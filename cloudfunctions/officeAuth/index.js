const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('office_users')
const workOrdersCollection = db.collection('work_orders')
const workflowTasksCollection = db.collection('workflow_tasks')
const workflowLogsCollection = db.collection('workflow_logs')
const templatesCollection = db.collection('workflow_templates')
const sysConfigCollection = db.collection('sys_config')

/**
 * 工作流状态到请求状态的映射
 */
const WORKFLOW_STATUS_MAP = {
  'completed': 'approved',
  'rejected': 'rejected',
  'terminated': 'terminated',
  'in_progress': 'pending'
}

/**
 * 通用工单字段映射函数（消除硬编码）
 * 将 businessData 展开到顶层，使 displayConfig 配置的字段可直接访问
 * 
 * @param {Object} order - 工单对象
 * @param {Object} options - 配置选项
 * @param {Object} options.taskInfo - 任务信息 { _id: taskId, stepName: taskName }
 * @param {Object} options.approvalInfo - 审批信息 { reviewedBy, reviewedAt }
 * @param {string} options.reviewRemark - 审批备注
 * @param {Object} options.templateMap - 工单类型到名称的映射
 * @param {boolean} options.isCurrentApprover - 是否是当前审批人
 * @param {string} options.statusOverride - 覆盖状态（用于 pendingList 固定为 pending）
 * @param {Object} options.requestStatus - 请求状态常量
 * @returns {Object} 映射后的显示项
 */
function mapOrderToDisplayItem(order, options = {}) {
  const {
    taskInfo = null,
    approvalInfo = {},
    reviewRemark = '',
    templateMap = {},
    isCurrentApprover = false,
    statusOverride = null,
    requestStatus = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', TERMINATED: 'terminated' }
  } = options

  // 状态映射：优先使用覆盖值，否则根据 workflowStatus 映射
  const status = statusOverride || WORKFLOW_STATUS_MAP[order.workflowStatus] || requestStatus.PENDING

  // 基础字段（所有工单类型通用）
  const baseItem = {
    _id: taskInfo?._id || order._id,
    orderId: order._id,
    openid: order.businessData?.applicantId || '',
    name: order.businessData?.applicantName || '',
    avatarText: order.businessData?.applicantName?.slice(0, 1) || '申',
    status,
    submittedAt: order.createdAt,
    updatedAt: order.updatedAt,
    orderType: order.orderType,
    requestType: templateMap[order.orderType]?.name || order.orderType,
    currentStep: order.currentStep,
    workflowSnapshot: order.workflowSnapshot,
    displayConfig: order.workflowSnapshot?.displayConfig || null,
    orderNo: order.orderNo,
    // 审批相关
    reviewRemark,
    reviewedAt: approvalInfo?.reviewedAt || order.updatedAt,
    reviewedBy: approvalInfo?.reviewedBy || '',
    // 任务相关
    taskId: taskInfo?._id || null,
    taskName: taskInfo?.stepName || null,
    isCurrentApprover
  }

  // 关键：展开 businessData 到顶层，使 displayConfig.detailFields 配置的字段可直接访问
  return {
    ...baseItem,
    ...(order.businessData || {})
  }
}

// 从数据库获取常量（带缓存）
let cachedConstants = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

/**
 * 从数据库读取系统常量
 */
async function getSystemConstants() {
  const now = Date.now()
  if (cachedConstants && (now - cacheTime) < CACHE_TTL) {
    return cachedConstants
  }

  try {
    // 从 sys_config 集合读取所有配置
    const result = await sysConfigCollection.get()
    const configs = result.data || []

    // 构建常量映射
    const constants = {}
    for (const config of configs) {
      constants[config.key] = config.value
    }

    // 更新缓存
    cachedConstants = constants
    cacheTime = now

    return constants
  } catch (error) {
    console.error('获取系统常量失败:', error)
    
    // 如果有旧缓存，继续使用
    if (cachedConstants) {
      console.warn('使用旧缓存数据')
      return cachedConstants
    }
    
    // 否则返回默认值
    return getDefaultConstants()
  }
}

/**
 * 获取默认常量（降级方案，与 initSystemConfig 保持同步）
 */
function getDefaultConstants() {
  return {
    // 角色相关
    ROLE_OPTIONS: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],
    ROLE_POSITION_MAP: {
      '馆领导': ['人事主管', '会计主管'],
      '部门负责人': ['人事主管', '会计主管', '会计', '出纳', '俱乐部', '阳光课堂'],
      '馆员': ['礼宾', '会计', '出纳', '俱乐部', '阳光课堂'],
      '工勤': ['招待员', '厨师'],
      '配偶': ['出纳', '内聘']
    },
    NEED_RELATIVE_ROLES: ['配偶', '家属'],
    DEFAULT_ROLE: '',
    ROLE_FIELD_VISIBILITY: {
      '馆领导': { showPosition: false, showDepartment: false, fixedDepartment: null },
      '部门负责人': { showPosition: false, showDepartment: true, fixedDepartment: null },
      '馆员': { showPosition: false, showDepartment: true, fixedDepartment: null },
      '工勤': { showPosition: false, showDepartment: true, fixedDepartment: '办公室' },
      '物业': { showPosition: false, showDepartment: true, fixedDepartment: '办公室' },
      '配偶': { showPosition: false, showDepartment: false, fixedDepartment: null },
      '家属': { showPosition: false, showDepartment: false, fixedDepartment: null }
    },

    // 岗位相关
    POSITION_OPTIONS: ['人事主管', '会计主管', '礼宾', '会计', '出纳', '俱乐部', '阳光课堂', '招待员', '厨师', '内聘'],
    DEFAULT_POSITION: [],

    // 部门相关
    DEPARTMENT_OPTIONS: ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', 'DW办'],
    DEFAULT_DEPARTMENT: '',

    // 性别相关
    GENDER_OPTIONS: ['男', '女'],
    DEFAULT_GENDER: '男',

    // 请求状态
    REQUEST_STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      TERMINATED: 'terminated'
    },
    REQUEST_STATUS_TEXT: {
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回',
      terminated: '已中止'
    },
    REQUEST_STATUS_STYLE: {
      pending: { color: '#D97706', bg: '#FEF3C7' },
      approved: { color: '#16A34A', bg: '#DCFCE7' },
      rejected: { color: '#DC2626', bg: '#FEE2E2' },
      terminated: { color: '#DC2626', bg: '#FEE2E2' }
    },

    // 审批角色
    APPROVAL_REVIEWER_ROLES: ['馆领导', '部门负责人'],

    // 物业报修
    REPAIR_LIVING_AREAS: ['本部', '馆周边', '5号院', '8号院', '湖畔']
  }
}

function success(data, message) {
  return {
    code: 0,
    message: message || 'ok',
    data: data || {}
  }
}

function fail(message, code, data) {
  return {
    code: code || 500,
    message: message || '服务异常',
    data: data || null
  }
}

function formatUserRecord(record) {
  if (!record) {
    return null
  }

  return {
    _id: record._id,
    openid: record.openid,
    name: record.name,
    gender: record.gender,
    birthday: record.birthday,
    role: record.role,
    isAdmin: !!record.isAdmin,
    status: record.status,
    avatarText: record.avatarText || (record.name ? record.name.slice(0, 1) : '智'),
    approvedAt: record.approvedAt || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    relativeName: record.relativeName || '',
    position: Array.isArray(record.position) ? record.position : (record.position ? [record.position] : []),
    department: record.department || '',
    mobile: record.mobile || '',
    landline: record.landline || '',
    userStatus: record.userStatus || 'offline'
  }
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value === 'true'
  }
  return !!value
}

// 动态获取常量
async function getPositionOptions() {
  const constants = await getSystemConstants()
  return constants.POSITION_OPTIONS || ['人事主管', '会计主管', '礼宾', '会计', '出纳', '俱乐部', '阳光课堂', '招待员', '厨师', '内聘']
}

async function getDepartmentOptions() {
  const constants = await getSystemConstants()
  return constants.DEPARTMENT_OPTIONS || ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', 'DW办']
}

async function getRoleOptions() {
  const constants = await getSystemConstants()
  return constants.roles || ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
}

async function getGenderOptions() {
  const constants = await getSystemConstants()
  return constants.genders || ['男', '女']
}

async function validateForm(formData) {
  const constants = await getSystemConstants()
  const roleOptions = constants.ROLE_OPTIONS || ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
  const genderOptions = constants.GENDER_OPTIONS || ['男', '女']
  const positionOptions = constants.POSITION_OPTIONS || ['人事主管', '会计主管', '礼宾', '会计', '出纳', '俱乐部', '阳光课堂', '招待员', '厨师', '内聘']
  const relativeRoles = constants.NEED_RELATIVE_ROLES || ['配偶', '家属']
  const roleFieldVisibility = constants.ROLE_FIELD_VISIBILITY || {}

  const payload = formData || {}
  const name = String(payload.name || '').trim()
  const gender = String(payload.gender || '').trim()
  const birthday = String(payload.birthday || '').trim()
  const role = String(payload.role || '').trim()
  const isAdmin = normalizeBoolean(payload.isAdmin)
  const relativeName = String(payload.relativeName || '').trim()
  const position = String(payload.position || '').trim()
  const department = String(payload.department || '').trim()
  const mobile = String(payload.mobile || '').trim()
  const landline = String(payload.landline || '').trim()

  if (!name) {
    throw new Error('请输入姓名')
  }

  if (!genderOptions.includes(gender)) {
    throw new Error('请选择性别')
  }

  if (!birthday) {
    throw new Error('请选择出生日期')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    throw new Error('出生日期格式不正确')
  }

  if (!roleOptions.includes(role)) {
    throw new Error('请选择角色')
  }

  if (relativeRoles.includes(role) && !relativeName) {
    throw new Error('请填写亲属姓名')
  }

  // 获取角色的字段显示配置
  const roleConfig = roleFieldVisibility[role] || { showPosition: false, showDepartment: true }
  const showDepartment = roleConfig.showDepartment !== false // 默认显示

  if (showDepartment && !department) {
    throw new Error('请选择部门')
  }

  return {
    name,
    gender,
    birthday,
    role,
    isAdmin,
    relativeName: relativeRoles.includes(role) ? relativeName : '',
    position: [], // 岗位由管理员在岗位配置页分配
    department: showDepartment ? department : '',
    mobile,
    landline,
    avatarText: name.slice(0, 1)
  }
}

function createRequestNo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `REG${year}${month}${date}${suffix}`
}

async function findUserByOpenId(openid) {
  const result = await usersCollection.where({ openid }).limit(1).get()
  return result.data[0] || null
}

async function ensureAdminUser(openid) {
  const userRecord = await findUserByOpenId(openid)
  const constants = await getSystemConstants()
  const requestStatus = constants.requestStatus || { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', TERMINATED: 'terminated' }
  
  if (!userRecord || userRecord.status !== requestStatus.APPROVED || !userRecord.isAdmin) {
    throw new Error('仅管理员可执行此操作')
  }
  return userRecord
}

async function checkRegistration(openid) {
  const constants = await getSystemConstants()
  const requestStatus = constants.requestStatus || { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', TERMINATED: 'terminated' }
  
  const userRecord = await findUserByOpenId(openid)

  if (userRecord && userRecord.status === requestStatus.APPROVED) {
    return success({
      openid,
      registered: true,
      authStatus: requestStatus.APPROVED,
      user: formatUserRecord(userRecord),
      request: null
    })
  }

  // 查询工单
  const orderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid,
      orderType: 'user_registration'
    })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  if (orderResult.data && orderResult.data.length > 0) {
    const order = orderResult.data[0]

    if (order.workflowStatus === 'completed' || order.workflowStatus === 'rejected') {

      if (order.workflowStatus === 'completed') {
        // 审批通过，创建或更新用户记录
        const businessData = order.businessData || {}
        const existingUser = await findUserByOpenId(openid)
        const now = Date.now()

        const userPayload = {
          openid: openid,
          name: businessData.applicantName || '',
          gender: businessData.gender || '',
          birthday: businessData.birthday || '',
          role: businessData.role || '馆员',
          isAdmin: !!businessData.isAdmin,
          avatarText: businessData.avatarText || '',
          relativeName: businessData.relativeName || '',
          position: Array.isArray(businessData.position) ? businessData.position : [],
          department: businessData.department || '',
          status: requestStatus.APPROVED,
          approvedAt: now,
          approvedBy: order.updatedBy || '',
          createdAt: existingUser ? (existingUser.createdAt || now) : now,
          updatedAt: now
        }

        if (existingUser) {
          await usersCollection.doc(existingUser._id).update({ data: userPayload })
        } else {
          await usersCollection.add({ data: userPayload })
        }

        const updatedUser = await findUserByOpenId(openid)
        return success({
          openid,
          registered: true,
          authStatus: requestStatus.APPROVED,
          user: formatUserRecord(updatedUser),
          request: null
        })
      } else {
        // 审批驳回
        // 获取驳回原因（从任务日志中）
        const taskResult = await workflowTasksCollection
          .where({
            orderId: order._id,
            taskStatus: 'rejected'
          })
          .limit(1)
          .get()

        const reviewRemark = taskResult.data && taskResult.data.length > 0
          ? (taskResult.data[0].comment || '管理员已驳回该申请')
          : '管理员已驳回该申请'

        // 从工单业务数据中获取申请信息，用于重新申请时回填
        const businessData = order.businessData || {}

        return success({
          openid,
          registered: false,
          authStatus: requestStatus.REJECTED,
          user: null,
          request: {
            _id: order._id,
            openid: openid,
            status: requestStatus.REJECTED,
            reviewRemark: reviewRemark,
            name: businessData.applicantName || '',
            gender: businessData.gender || '',
            birthday: businessData.birthday || '',
            role: businessData.role || '',
            isAdmin: !!businessData.isAdmin,
            relativeName: businessData.relativeName || '',
            position: Array.isArray(businessData.position) ? businessData.position : (businessData.position ? [businessData.position] : []),
           department: businessData.department || ''
          },
        })
      }
    }

    // 工单进行中，返回待审核状态
    return success({
      openid,
      registered: false,
      authStatus: requestStatus.PENDING,
      user: null,
      request: {
        _id: order._id,
        openid: openid,
        status: requestStatus.PENDING,
        submittedAt: order.createdAt
      }
    })
  }

  // 未注册
  return success({
    openid,
    registered: false,
    authStatus: 'unregistered',
    user: null,
    request: null
  })
}

async function submitRegistration(openid, formData) {
  const constants = await getSystemConstants()
  const requestStatus = constants.requestStatus || { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', TERMINATED: 'terminated' }
  
  const form = await validateForm(formData)
  const existingUser = await findUserByOpenId(openid)
  if (existingUser && existingUser.status === requestStatus.APPROVED) {
    return success({
      openid,
      authStatus: requestStatus.APPROVED,
      request: null,
      user: formatUserRecord(existingUser)
    }, '您已完成注册')
  }

  // 检查是否已有待审批的工单
  const existingOrderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid,
      orderType: 'user_registration',
      status: 'in_progress'
    })
    .limit(1)
    .get()

  if (existingOrderResult.data && existingOrderResult.data.length > 0) {
    const existingOrder = existingOrderResult.data[0]
    return fail('您的注册申请正在审核中，请勿重复提交', 409, {
      authStatus: requestStatus.PENDING,
      orderId: existingOrder.orderId,
      request: {
        _id: existingOrder.orderId,
        openid: openid,
        status: requestStatus.PENDING,
        submittedAt: existingOrder.createTime
      }
    })
  }

  // 调用工作流引擎提交工单
  try {
    const now = Date.now()
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'user_registration',
        businessData: {
          applicantId: openid,
          applicantName: form.name,
          gender: form.gender,
          birthday: form.birthday,
          role: form.role,
          isAdmin: form.isAdmin,
          avatarText: form.avatarText,
          relativeName: form.relativeName || '',
          position: Array.isArray(form.position) ? form.position : [],
          department: form.department || '',
          mobile: form.mobile || '',
          landline: form.landline || '',
          phone: formData.phone || '',
          email: formData.email || '',
          applyReason: formData.applyReason || '申请注册系统'
        }
      }
    })

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '提交工作流工单失败')
    }

    const orderId = workflowResult.result.data.orderId

    return success({
      openid,
      authStatus: requestStatus.PENDING,
      orderId: orderId,
      request: {
        _id: orderId,
        openid: openid,
        name: form.name,
        role: form.role,
        relativeName: form.relativeName || '',
        position: Array.isArray(form.position) ? form.position : [],
        department: form.department || '',
        mobile: form.mobile || '',
        landline: form.landline || '',
        status: requestStatus.PENDING,
        submittedAt: now
      },
      user: null
    }, '注册申请已提交')
  } catch (error) {
    throw new Error('提交工作流工单失败: ' + error.message)
  }
}

async function submitProfileUpdate(openid, formData) {
  const constants = await getSystemConstants()
  const requestStatus = constants.requestStatus || { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', TERMINATED: 'terminated' }
  
  // 验证用户已注册
  const existingUser = await findUserByOpenId(openid)
  if (!existingUser || existingUser.status !== requestStatus.APPROVED) {
    return fail('请先完成注册审批', 401, {
      authStatus: requestStatus.PENDING
    })
  }

  // 验证表单数据
  const form = await validateForm(formData)

  // 检查是否已有待审批的修改申请
  const existingOrderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid,
      orderType: 'user_profile_update',
      status: 'in_progress'
    })
    .limit(1)
    .get()

  if (existingOrderResult.data && existingOrderResult.data.length > 0) {
    const existingOrder = existingOrderResult.data[0]
    return fail('您的修改申请正在审核中，请勿重复提交', 409, {
      orderId: existingOrder.orderId,
      submittedAt: existingOrder.createTime
    })
  }

  // 调用工作流引擎提交工单
  try {
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'user_profile_update',
        businessData: {
          applicantId: openid,
          applicantName: form.name,
          gender: form.gender,
          birthday: form.birthday,
          role: form.role,
          isAdmin: form.isAdmin,
          relativeName: form.relativeName || '',
          position: Array.isArray(form.position) ? form.position : [],
          department: form.department || '',
          mobile: form.mobile || '',
          landline: form.landline || '',
          userId: existingUser._id, // 关联原用户ID
          updateReason: formData.updateReason || '申请修改个人信息'
        }
      }
    })

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '提交工作流工单失败')
    }

    const orderId = workflowResult.result.data.orderId

    return success({
      openid,
      orderId: orderId,
      message: '修改申请已提交，等待管理员审批'
    }, '修改申请已提交')
  } catch (error) {
    throw new Error('提交工作流工单失败: ' + error.message)
  }
}

async function getApprovalData(openid, pagination = {}) {
  const constants = await getSystemConstants()
  const requestStatus = constants.requestStatus || { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', TERMINATED: 'terminated' }
  const reviewerRoles = constants.reviewerRoles || ['馆领导', '部门负责人']
  
  const { page = 1, pageSize = 10 } = pagination
  const currentUser = await findUserByOpenId(openid)

  // 权限判断：馆领导、部门负责人、管理员可以审批
  const canReview = !!(currentUser &&
    currentUser.status === requestStatus.APPROVED &&
    (currentUser.isAdmin || reviewerRoles.includes(currentUser.role)))

  // 查询所有激活的工作流模板，用于获取申请类型的名称
  const templatesResult = await templatesCollection
    .where({
      status: 'active'
    })
    .get()

  // 创建 orderType 到模板 name 的映射
  const templateMap = {}
  if (templatesResult.data) {
    templatesResult.data.forEach(template => {
      // 处理显示名称：去掉"审批"，如果不是"申请"结尾则添加"申请"
      let displayName = template.name
      if (displayName.endsWith('审批')) {
        displayName = displayName.slice(0, -2) // 去掉"审批"
        if (!displayName.endsWith('申请')) {
          displayName += '申请'
        }
      }
      templateMap[template.code] = {
        name: displayName, // 使用处理后的名称
        originalName: template.name // 保留原始名称
      }
    })
  }

  // 查询我的工单（包括注册申请、就医申请、用户信息修改）—— 先查总数再分页
  const myOrderCountResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid
    })
    .count()

  const mineTotal = myOrderCountResult.total || 0

  const myOrderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid
    })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 查询当前用户的待审批任务，用于判断是否是当前步骤的审批人
  let userTaskMap = {}
  if (canReview) {
    const userTasksResult = await workflowTasksCollection
      .where({
        approverId: openid,
        taskStatus: 'pending'
      })
      .get()

    if (userTasksResult.data) {
      userTasksResult.data.forEach(task => {
        userTaskMap[task.orderId] = {
          taskId: task._id,
          stepName: task.stepName
        }
      })
    }
  }

  // 获取已驳回工单的驳回原因（用于 mineList）
  const myRejectedOrderIds = myOrderResult.data
    ? myOrderResult.data.filter(o => o.workflowStatus === 'rejected').map(o => o._id)
    : []

  let myReviewRemarks = {}
  if (myRejectedOrderIds.length > 0) {
    const myRejectedTasks = await workflowTasksCollection
      .where({
        orderId: db.command.in(myRejectedOrderIds),
        taskStatus: 'rejected'
      })
      .get()

    myRejectedTasks.data.forEach(task => {
      myReviewRemarks[task.orderId] = task.comment || ''
    })
  }

  // 获取所有已完成工单的审批信息（从工作流日志中，用于 mineList）
  const allMyOrderIds = myOrderResult.data ? myOrderResult.data.map(o => o._id) : []

  let myApprovalInfo = {}
  if (allMyOrderIds.length > 0) {
    const myLogsResult = await workflowLogsCollection
      .where({
        orderId: db.command.in(allMyOrderIds),
        action: db.command.in(['approve', 'reject', 'terminate'])
      })
      .orderBy('createdAt', 'desc')
      .get()

    // 获取所有审批人的 openid，批量查询用户信息
    const myApproverOpenids = myLogsResult.data
      .map(log => log.operatorId)
      .filter(id => id && id !== 'system')

    let myUsersMap = {}
    if (myApproverOpenids.length > 0) {
      const myUsersResult = await usersCollection
        .where({
          openid: db.command.in(myApproverOpenids)
        })
        .get()

      myUsersResult.data.forEach(user => {
        myUsersMap[user.openid] = user.name
      })
    }

    // 使用 Map 记录每个工单的最新审批信息
    const myLastApprovalMap = {}
    myLogsResult.data.forEach(log => {
      if (!myLastApprovalMap[log.orderId]) {
        let finalApproverName = log.operatorName
        if (!finalApproverName || finalApproverName === '管理员' || finalApproverName === '审批人') {
          finalApproverName = myUsersMap[log.operatorId] || '管理员'
        }
        myLastApprovalMap[log.orderId] = {
          reviewedBy: finalApproverName,
          reviewedAt: log.createdAt
        }
      }
    })

    myApprovalInfo = myLastApprovalMap
  }

  const mineList = myOrderResult.data ? myOrderResult.data.map(order => {
    // 判断当前用户是否是当前步骤的审批人
    const isCurrentApprover = canReview && userTaskMap[order._id] ? true : false
    const taskInfo = isCurrentApprover && userTaskMap[order._id] ? { _id: userTaskMap[order._id].taskId } : null

    // 使用通用映射函数（消除硬编码）
    return mapOrderToDisplayItem(order, {
      taskInfo,
      approvalInfo: myApprovalInfo[order._id] || {},
      reviewRemark: myReviewRemarks[order._id] || '',
      templateMap,
      isCurrentApprover,
      requestStatus
    })
  }) : []

  // 管理员/馆领导/部门负责人查询所有待审批工单
  let pendingList = []
  let doneList = []
  let pendingTasksResult = null
  let processedTasksResult = null
  let completedOrdersResult = null
  let completedOrdersAll = []

  if (canReview) {
    // 查询待审批任务总数
    const pendingTasksCountResult = await workflowTasksCollection
      .where({ taskStatus: 'pending' })
      .count()

    // 查询待审批的任务（工作流引擎已解析 approverList，查询时统一过滤）
    pendingTasksResult = await workflowTasksCollection
      .where({ taskStatus: 'pending' })
      .orderBy('assignedAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    if (pendingTasksResult.data) {
      const orderIds = pendingTasksResult.data.map(task => task.orderId)

      // 批量查询工单详情
      if (orderIds.length > 0) {
        const ordersResult = await workOrdersCollection
          .where({
            _id: db.command.in(orderIds)
          })
          .get()

        const ordersMap = {}
        if (ordersResult.data) {
          ordersResult.data.forEach(order => {
            ordersMap[order._id] = order
          })
        }

        // 过滤：统一使用 approverList 判断，不再区分 approverType
        pendingList = pendingTasksResult.data.filter(task => {
          return task.approverList && task.approverList.some(approver => approver.id === openid)
        }).map(task => {
          const order = ordersMap[task.orderId]

          // 使用通用映射函数（消除硬编码）
          return mapOrderToDisplayItem(order || {}, {
            taskInfo: { _id: task._id, stepName: task.stepName },
            templateMap,
            isCurrentApprover: true,
            statusOverride: requestStatus.PENDING,
            requestStatus
          })
        })
      }
    }

    // 查询当前用户作为实际审批人处理过的全部任务（不限状态）
    const processedTasksData = await workflowTasksCollection
      .where({ actualApproverId: openid })
      .orderBy('updatedAt', 'desc')
      .limit(1000)
      .get()

    // 获取这些任务对应的全部工单ID（去重）
    let processedOrderIds = []
    if (processedTasksData.data) {
      processedOrderIds = [...new Set(processedTasksData.data.map(task => task.orderId))]
    }

    // 查询对应的全部工单（复用外层声明的 completedOrdersAll）
    completedOrdersAll = []
    if (processedOrderIds.length > 0) {
      const completedOrdersRawResult = await workOrdersCollection
        .where({
          _id: db.command.in(processedOrderIds),
          workflowStatus: db.command.in(['completed', 'rejected', 'terminated'])
        })
        .orderBy('updatedAt', 'desc')
        .limit(1000)
        .get()
      completedOrdersAll = completedOrdersRawResult.data || []
    }

    // 最后在工单层面做分页（completedOrdersResult 已在上面的 slice 中完成）
    const doneSkipCount = (page - 1) * pageSize
    completedOrdersResult = { data: completedOrdersAll.slice(doneSkipCount, doneSkipCount + Math.min(pageSize, 100)) }
    processedTasksResult = processedTasksData  // 保留原始数据用于日志等用途

    // 获取已驳回工单的驳回原因（基于分页后的 completedOrdersResult）
    const rejectedOrderIds = completedOrdersResult.data
      ? completedOrdersResult.data.filter(o => o.workflowStatus === 'rejected').map(o => o._id)
      : []

    let reviewRemarks = {}
    if (rejectedOrderIds.length > 0) {
      const rejectedTasks = await workflowTasksCollection
        .where({
          orderId: db.command.in(rejectedOrderIds),
          taskStatus: 'rejected'
        })
        .get()

      rejectedTasks.data.forEach(task => {
        // 只保存真正的驳回原因（用户填写的），不设置默认值
        reviewRemarks[task.orderId] = task.comment || ''
      })
    }

    // 获取所有已完成工单的审批信息（从工作流日志中）
    const allCompletedOrderIds = completedOrdersResult.data
      ? completedOrdersResult.data.map(o => o._id)
      : []

    let approvalInfo = {}
    if (allCompletedOrderIds.length > 0) {
      const logsResult = await workflowLogsCollection
        .where({
          orderId: db.command.in(allCompletedOrderIds),
          action: db.command.in(['approve', 'reject', 'terminate'])
        })
        .orderBy('createdAt', 'desc')  // 按时间倒序排列，最新的在前面
        .get()

      // 获取所有审批人的 openid，批量查询用户信息
      const approverOpenids = logsResult.data
        .map(log => log.operatorId)
        .filter(id => id && id !== 'system')

      let usersMap = {}
      if (approverOpenids.length > 0) {
        const usersResult = await usersCollection
          .where({
            openid: db.command.in(approverOpenids)
          })
          .get()
        
        usersResult.data.forEach(user => {
          usersMap[user.openid] = user.name
        })
      }

      // 使用 Map 记录每个工单的最新审批信息
      const lastApprovalMap = {}
      logsResult.data.forEach(log => {
        if (!lastApprovalMap[log.orderId]) {
          // 第一次遇到该工单的记录，就是最新的（因为已经按时间倒序排列）
          let finalApproverName = log.operatorName
          // 如果审批人姓名为空或只是通用词，尝试从用户表查询
          if (!finalApproverName || finalApproverName === '管理员' || finalApproverName === '审批人') {
            finalApproverName = usersMap[log.operatorId] || '管理员'
          }
          lastApprovalMap[log.orderId] = {
            reviewedBy: finalApproverName,
            reviewedAt: log.createdAt
          }
        }
      })
      
      approvalInfo = lastApprovalMap
    }

    doneList = completedOrdersResult.data ? completedOrdersResult.data.map(order => {
      const info = approvalInfo[order._id] || { reviewedBy: '管理员', reviewedAt: order.updatedAt }

      // 使用通用映射函数（消除硬编码）
      return mapOrderToDisplayItem(order, {
        approvalInfo: info,
        reviewRemark: reviewRemarks[order._id] || '',
        templateMap,
        isCurrentApprover: false,
        requestStatus
      })
    }) : []
  }

  // 计算各列表总数（用于 tab badge 和概览）
  // mineTotal 已在前面通过 count() 查询得到
  // pending: 需要基于过滤后的数量（当前用户在 approverList 中的任务数），这里用 pendingList 的实际条数作为近似值
  // doneTotalCount: completedOrdersAll 是全量未分页的数组
  const doneTotalCount = completedOrdersAll.length || 0
  const mineTotalCount = mineTotal
  // pending 总数：用全部待审批任务中属于当前用户的数量（近似，因为需要过滤 approverList）
  // 为简化，使用前端传入时后端返回的 pendingList 长度 + 是否有更多数据来判断
  // 更准确的做法：pendingTotalCount 应该是 pendingTasksCountResult.total 中经过 approverList 过滤后的数量
  // 这里保守地使用 pendingList 的长度（首次加载page=1时为 pageSize 或更少）
  const pendingTotalCount = pendingTasksResult && pendingTasksResult.data
    ? (pendingList.length || 0)
    : 0

  return success({
    canReview,
    currentUser: formatUserRecord(currentUser),
    mineList,
    pendingList,
    doneList,
    pagination: {
      page,
      pageSize,
      hasMore: {
        mineList: mineTotalCount > page * pageSize,
        pendingList: pendingTotalCount > page * pageSize,
        doneList: doneTotalCount > page * pageSize
      }
    },
    // 总数：只在首次加载(page=1)时使用，前端缓存用于 tab badge 和概览
    counts: {
      mine: mineTotalCount,
      pending: pendingTotalCount,
      done: doneTotalCount
    },
    summary: {
      pendingCount: pendingTotalCount,
      approvedCount: doneTotalCount > 0 ? doneList.filter(r => r.status === requestStatus.APPROVED).length : 0,
      rejectedCount: doneTotalCount > 0 ? doneList.filter(r => r.status === requestStatus.REJECTED).length : 0
    }
  })
}

/**
 * 获取待审批的用户注册申请列表（超级管理员用）
 */
async function getPendingRegistrations(openid) {
  try {
    await ensureAdminUser(openid)

    // 查询用户注册类型的待审批工单
    const ordersResult = await workOrdersCollection
      .where({
        orderType: 'user_registration',
        workflowStatus: 'pending'
      })
      .orderBy('createdAt', 'asc')
      .get()

    if (!ordersResult.data || ordersResult.data.length === 0) {
      return success([])
    }

    // 获取所有工单 ID
    const orderIds = ordersResult.data.map(order => order._id)

    // 查询这些工单对应的待处理任务
    const tasksResult = await workflowTasksCollection
      .where({
        orderId: db.command.in(orderIds),
        taskStatus: 'pending'
      })
      .get()

    // 建立 orderId -> taskId 的映射
    const taskMap = {}
    if (tasksResult.data) {
      tasksResult.data.forEach(task => {
        if (!taskMap[task.orderId]) {
          taskMap[task.orderId] = task._id
        }
      })
    }

    // 组装返回数据
    const list = ordersResult.data.map(order => {
      const businessData = order.businessData || {}
      return {
        orderId: order._id,
        orderNo: order.orderNo,
        taskId: taskMap[order._id] || null,
        applicantId: businessData.applicantId || '',
        applicantName: businessData.applicantName || '',
        gender: businessData.gender || '',
        role: businessData.role || '',
        department: businessData.department || '',
        position: Array.isArray(businessData.position) ? businessData.position : (businessData.position ? [businessData.position] : []),
        createdAt: order.createdAt
      }
    })

    return success(list)
  } catch (error) {
    console.error('获取待审批注册申请失败:', error)
    return fail(error.message || '获取失败', 500)
  }
}

// 获取工作流日志
async function getWorkflowLogs(orderId) {
  try {
    // 从 sys_config 读取 WORKFLOW_ACTION_TEXT
    const sysConfigCollection = db.collection('sys_config')
    let actionTextMap = {}
    try {
      const configRes = await sysConfigCollection
        .where({ type: 'workflow', key: 'WORKFLOW_ACTION_TEXT' })
        .limit(1)
        .get()
      if (configRes.data && configRes.data.length > 0 && configRes.data[0].value) {
        actionTextMap = configRes.data[0].value
      }
    } catch (e) {
      // 降级使用空映射
    }

    const logsResult = await workflowLogsCollection
      .where({
        orderId: orderId
      })
      .orderBy('createdAt', 'asc')
      .limit(50)
      .get()

    if (!logsResult.data) {
      return success([], '获取成功')
    }

    // 获取所有操作人的 openid
    const operatorOpenids = logsResult.data
      .map(log => log.operatorId)
      .filter(id => id && id !== 'system')

    // 批量查询用户信息
    let usersMap = {}
    if (operatorOpenids.length > 0) {
      const usersResult = await usersCollection
        .where({
          openid: db.command.in(operatorOpenids)
        })
        .get()

      usersResult.data.forEach(user => {
        usersMap[user.openid] = user.name
      })
    }

    // 格式化日志
    const logs = logsResult.data.map(log => {
      const operatorName = log.operatorName ||
        (log.operatorId === 'system' ? '系统' : (usersMap[log.operatorId] || '未知'))

      const actionText = actionTextMap[log.action] || log.action

      return {
        _id: log._id,
        action: log.action,
        actionText: actionText,
        operatorId: log.operatorId,
        operatorName: operatorName,
        description: log.description,
        stepName: log.stepName || '',
        createdAt: log.createdAt
      }
    })

    return success(logs, '获取成功')
  } catch (error) {
    throw error
  }
}

// 格式化日期时间（本地时区）
function formatDateTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 获取通讯录列表
 * 查询所有 approved 用户，排除"家属"和"待赴任馆员"角色
 * 仅返回公开字段，不返回 openid 等敏感信息
 */
async function getContactsList() {
  // 排除的角色
  const EXCLUDED_ROLES = ['家属', '待赴任馆员']

  const result = await usersCollection
    .where({
      status: 'approved',
      role: _.nin(EXCLUDED_ROLES)
    })
    .limit(1000)
    .get()

  const contacts = (result.data || []).map(record => ({
    _id: record._id,
    name: record.name,
    role: record.role,
    department: record.department || '',
    position: Array.isArray(record.position) ? record.position : (record.position ? [record.position] : []),
    mobile: record.mobile || '',
    landline: record.landline || '',
    avatarText: record.avatarText || (record.name ? record.name.slice(0, 1) : '智'),
    isAdmin: !!record.isAdmin,
    userStatus: record.userStatus || 'offline'
  }))

  return success({ contacts }, '获取成功')
}

/**
 * 更新用户在线状态
 * @param {string} openid - 用户 openid
 * @param {string} userStatus - 目标状态：online/busy/out/offline
 * @param {boolean} preserveOut - 为 true 时，若用户当前状态为 out 则不覆盖
 */
async function updateUserStatus(openid, userStatus, preserveOut = false) {
  const VALID_STATUSES = ['online', 'busy', 'out', 'offline']

  if (!userStatus || !VALID_STATUSES.includes(userStatus)) {
    return fail('无效的用户状态', 400)
  }

  const user = await findUserByOpenId(openid)
  if (!user) {
    return fail('用户不存在', 404)
  }

  // preserveOut 模式：用户当前外出中，登录/退出不覆盖 out 状态
  if (preserveOut && user.userStatus === 'out') {
    return success({ userStatus: 'out', preserved: true }, '用户外出中，状态保持不变')
  }

  await usersCollection.doc(user._id).update({
    data: {
      userStatus,
      updatedAt: Date.now()
    }
  })

  return success({ userStatus }, '状态更新成功')
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const action = event && event.action

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  try {
    if (action === 'getOpenId') {
      return success({ openid }, '获取成功')
    }

    if (action === 'checkRegistration') {
      return await checkRegistration(openid)
    }

    if (action === 'submitRegistration') {
      return await submitRegistration(openid, event.formData)
    }

    if (action === 'submitProfileUpdate') {
      return await submitProfileUpdate(openid, event.formData)
    }

    if (action === 'getApprovalData') {
      const pagination = {
        page: event.page || 1,
        pageSize: event.pageSize || 10
      }
      return await getApprovalData(openid, pagination)
    }

    if (action === 'getWorkflowLogs') {
      return await getWorkflowLogs(event.orderId)
    }

    // 超级管理员：获取待审批的用户注册申请列表（无需 openid 验证）
    if (action === 'getPendingRegistrations') {
      return await getPendingRegistrations(openid)
    }

    // 获取通讯录列表（排除家属和待赴任馆员）
    if (action === 'getContactsList') {
      return await getContactsList()
    }

    // 更新用户在线状态
    if (action === 'updateUserStatus') {
      return await updateUserStatus(openid, event.userStatus, event.preserveOut || false)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
