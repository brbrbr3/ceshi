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
 * 获取默认常量（降级方案）
 */
function getDefaultConstants() {
  return {
    // 角色相关
    ROLE_OPTIONS: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],
    NEED_DEPARTMENT_ROLES: ['部门负责人', '馆员', '工勤'],
    NEED_RELATIVE_ROLES: ['配偶', '家属'],
    DEFAULT_ROLE: '馆员',
    
    // 岗位相关
    POSITION_OPTIONS: ['无', '会计主管', '会计', '招待员', '厨师'],
    DEFAULT_POSITION: '无',
    
    // 部门相关
    DEPARTMENT_OPTIONS: ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', '党委办'],
    DEFAULT_DEPARTMENT: '',
    WORKER_DEPARTMENT: '办公室',
    
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
    REVIEWER_ROLES: ['馆领导', '部门负责人']
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
    position: record.position || '无',
    department: record.department || ''
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
  return constants.positions || ['无', '会计主管', '会计', '招待员', '厨师']
}

async function getDepartmentOptions() {
  const constants = await getSystemConstants()
  return constants.departments || ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', '党委办']
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
  const roleOptions = constants.roles || ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
  const genderOptions = constants.genders || ['男', '女']
  const positionOptions = constants.positions || ['无', '会计主管', '会计', '招待员', '厨师']
  const needDepartmentRoles = constants.needDepartmentRoles || ['部门负责人', '馆员', '工勤']
  const relativeRoles = constants.relativeRoles || ['配偶', '家属']

  const payload = formData || {}
  const name = String(payload.name || '').trim()
  const gender = String(payload.gender || '').trim()
  const birthday = String(payload.birthday || '').trim()
  const role = String(payload.role || '').trim()
  const isAdmin = normalizeBoolean(payload.isAdmin)
  const relativeName = String(payload.relativeName || '').trim()
  const position = String(payload.position || '无').trim()
  const department = String(payload.department || '').trim()

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

  if (needDepartmentRoles.includes(role) && !department) {
    throw new Error('请选择部门')
  }

  if (position && !positionOptions.includes(position)) {
    throw new Error('请选择有效的岗位')
  }

  // 如果是工勤角色，部门必须为"办公室"
  if (role === '工勤' && department !== '办公室') {
    throw new Error('工勤人员的部门必须为办公室')
  }

  return {
    name,
    gender,
    birthday,
    role,
    isAdmin,
    relativeName: relativeRoles.includes(role) ? relativeName : '',
    position: position || '无',
    department: needDepartmentRoles.includes(role) ? department : '',
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
          position: businessData.position || '无',
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
            position: businessData.position || '无',
            department: businessData.department || ''
          }
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
          position: form.position || '无',
          department: form.department || '',
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
        position: form.position || '无',
        department: form.department || '',
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
          position: form.position || '无',
          department: form.department || '',
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
  
  const { page = 1, pageSize = 20 } = pagination
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

  // 查询我的工单（包括注册申请、就医申请、用户信息修改）
  const myOrderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid
    })
    .orderBy('createdAt', 'desc')
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

    // 根据订单类型返回不同的字段
    if (order.orderType === 'medical_application') {
      // 就医申请
      const orderStatus = order.workflowStatus === 'completed' ? requestStatus.APPROVED : (order.workflowStatus === 'rejected' ? requestStatus.REJECTED : (order.workflowStatus === 'terminated' ? requestStatus.TERMINATED : requestStatus.PENDING))
      const approvalInfo = myApprovalInfo[order._id] || { reviewedBy: '', reviewedAt: order.updatedAt }
      return {
        _id: order._id,
        openid: order.businessData.applicantId,
        name: order.businessData.applicantName,
        role: order.businessData.applicantRole,
        patientName: order.businessData.patientName,
        relation: order.businessData.relation,
        medicalDate: order.businessData.medicalDate,
        institution: order.businessData.institution,
        otherInstitution: order.businessData.otherInstitution,
        reasonForSelection: order.businessData.reasonForSelection,
        reason: order.businessData.reason,
        avatarText: order.businessData.applicantName ? order.businessData.applicantName.slice(0, 1) : '就',
        status: orderStatus,
        reviewRemark: myReviewRemarks[order._id] || '',
        submittedAt: order.createdAt,
        reviewedAt: approvalInfo.reviewedAt,
        reviewedBy: approvalInfo.reviewedBy,
        updatedAt: order.updatedAt,
        orderType: 'medical_application',
        requestType: templateMap[order.orderType]?.name || '就医申请',
        currentStep: order.currentStep,
        workflowSnapshot: order.workflowSnapshot,
        displayConfig: order.workflowSnapshot?.displayConfig || null,
        orderNo: order.orderNo,
        taskId: isCurrentApprover ? userTaskMap[order._id].taskId : null,
        isCurrentApprover: isCurrentApprover
      }
    } else if (order.orderType === 'user_profile_update') {
      // 用户信息修改申请
      const orderStatus = order.workflowStatus === 'completed' ? requestStatus.APPROVED : (order.workflowStatus === 'rejected' ? requestStatus.REJECTED : (order.workflowStatus === 'terminated' ? requestStatus.TERMINATED : requestStatus.PENDING))
      const approvalInfo = myApprovalInfo[order._id] || { reviewedBy: '', reviewedAt: order.updatedAt }
      return {
        _id: order._id,
        openid: order.businessData.applicantId,
        name: order.businessData.applicantName,
        gender: order.businessData.gender,
        birthday: order.businessData.birthday,
        role: order.businessData.role,
        relativeName: order.businessData.relativeName || '',
        position: order.businessData.position || '无',
        department: order.businessData.department || '',
        isAdmin: order.businessData.isAdmin,
        avatarText: order.businessData.avatarText,
        updateReason: order.businessData.updateReason || '申请修改个人信息',
        status: orderStatus,
        reviewRemark: myReviewRemarks[order._id] || '',
        submittedAt: order.createdAt,
        reviewedAt: approvalInfo.reviewedAt,
        reviewedBy: approvalInfo.reviewedBy,
        updatedAt: order.updatedAt,
        orderType: 'user_profile_update',
        requestType: templateMap[order.orderType]?.name || '用户信息修改申请',
        currentStep: order.currentStep,
        workflowSnapshot: order.workflowSnapshot,
        displayConfig: order.workflowSnapshot?.displayConfig || null,
        orderNo: order.orderNo,
        taskId: isCurrentApprover ? userTaskMap[order._id].taskId : null,
        isCurrentApprover: isCurrentApprover
      }
    } else {
      // 注册申请
      const orderStatus = order.workflowStatus === 'completed' ? requestStatus.APPROVED : (order.workflowStatus === 'rejected' ? requestStatus.REJECTED : (order.workflowStatus === 'terminated' ? requestStatus.TERMINATED : requestStatus.PENDING))
      const approvalInfo = myApprovalInfo[order._id] || { reviewedBy: '', reviewedAt: order.updatedAt }
      return {
        _id: order._id,
        openid: order.businessData.applicantId,
        name: order.businessData.applicantName,
        gender: order.businessData.gender,
        birthday: order.businessData.birthday,
        role: order.businessData.role,
        relativeName: order.businessData.relativeName || '',
        position: order.businessData.position || '无',
        department: order.businessData.department || '',
        isAdmin: order.businessData.isAdmin,
        avatarText: order.businessData.avatarText,
        status: orderStatus,
        reviewRemark: myReviewRemarks[order._id] || '',
        submittedAt: order.createdAt,
        reviewedAt: approvalInfo.reviewedAt,
        reviewedBy: approvalInfo.reviewedBy,
        updatedAt: order.updatedAt,
        orderType: 'user_registration',
        requestType: templateMap[order.orderType]?.name || '用户注册申请',
        currentStep: order.currentStep,
        workflowSnapshot: order.workflowSnapshot,
        displayConfig: order.workflowSnapshot?.displayConfig || null,
        orderNo: order.orderNo,
        taskId: isCurrentApprover ? userTaskMap[order._id].taskId : null,
        isCurrentApprover: isCurrentApprover
      }
    }
  }) : []

  // 管理员/馆领导/部门负责人查询所有待审批工单
  let pendingList = []
  let doneList = []
  let pendingTasksResult = null
  let processedTasksResult = null
  let completedOrdersResult = null

  if (canReview) {
    // 查询待审批的任务（包括直接分配给用户和角色审批的任务）
    pendingTasksResult = await workflowTasksCollection
      .where(
        _.or([
          { approverId: openid },
          { approverType: 'role' }
        ])
      )
      .where({ taskStatus: 'pending' })
      .orderBy('assignedAt', 'desc')
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

        // 过滤：根据角色和岗位显示相应的审批任务
        pendingList = pendingTasksResult.data.filter(task => {
          // 获取对应的工单信息
          const order = ordersMap[task.orderId]
          if (!order) {
            return false
          }

          // 直接分配的任务总是显示
          if (task.approverId === openid) {
            return true
          }

          // 角色审批任务：根据任务步骤名称、订单类型和用户的角色/岗位判断
          if (task.approverType === 'role' && currentUser) {
            // 注册申请：只有管理员可以审批
            if (order.orderType === 'user_registration') {
              return currentUser.isAdmin === true
            }

            // 用户信息修改申请：只有管理员可以审批
            if (order.orderType === 'user_profile_update') {
              return currentUser.isAdmin === true
            }

            // 就医申请：根据步骤名称和角色/岗位判断
            if (order.orderType === 'medical_application') {
              // 部门负责人审批
              if (task.stepName === '部门负责人审批' && currentUser.role === '部门负责人') {
                return true
              }
              // 会计主管审批（按岗位）
              if (task.stepName === '会计主管审批' && currentUser.position === '会计主管') {
                return true
              }
              // 馆领导审批
              if (task.stepName === '馆领导审批' && currentUser.role === '馆领导') {
                return true
              }
              // 管理员审批（管理员可以看到所有就医申请的任务）
              if (currentUser.isAdmin) {
                return true
              }
            }
          }
          return false
        }).map(task => {
          const order = ordersMap[task.orderId]

          // 根据订单类型返回不同的字段
          if (order && order.orderType === 'medical_application') {
            // 就医申请
            const name = order.businessData.applicantName || ''
            return {
              _id: task._id,
              orderId: task.orderId,
              openid: order ? order.businessData.applicantId : '',
              name: name,
              role: order ? order.businessData.applicantRole : '',
              patientName: order ? order.businessData.patientName : '',
              relation: order ? order.businessData.relation : '',
              medicalDate: order ? order.businessData.medicalDate : '',
              institution: order ? order.businessData.institution : '',
              otherInstitution: order ? order.businessData.otherInstitution : '',
              reasonForSelection: order ? order.businessData.reasonForSelection : '',
              reason: order ? order.businessData.reason : '',
              avatarText: name ? name.slice(0, 1) : '就',
              status: requestStatus.PENDING,
              submittedAt: order ? order.createdAt : null,
              taskId: task._id,
              taskName: task.stepName,
              updatedAt: order ? order.updatedAt : null,
              orderType: 'medical_application',
              requestType: templateMap[order.orderType]?.name || '就医申请',
              currentStep: order ? order.currentStep : 1,
              workflowSnapshot: order ? order.workflowSnapshot : null,
              displayConfig: order?.workflowSnapshot?.displayConfig || null,
              orderNo: order ? order.orderNo : '',
              isCurrentApprover: true
            }
          } else if (order && order.orderType === 'user_profile_update') {
            // 用户信息修改申请
            const name = order.businessData.applicantName || ''
            return {
              _id: task._id,
              orderId: task.orderId,
              openid: order ? order.businessData.applicantId : '',
              name: name,
              gender: order ? order.businessData.gender : '',
              birthday: order ? order.businessData.birthday : '',
              role: order ? order.businessData.role : '',
              relativeName: order ? (order.businessData.relativeName || '') : '',
              position: order ? (order.businessData.position || '无') : '无',
              department: order ? (order.businessData.department || '') : '',
              isAdmin: order ? order.businessData.isAdmin : false,
              avatarText: order ? order.businessData.avatarText : (name ? name.slice(0, 1) : '智'),
              updateReason: order ? (order.businessData.updateReason || '申请修改个人信息') : '申请修改个人信息',
              status: requestStatus.PENDING,
              submittedAt: order ? order.createdAt : null,
              taskId: task._id,
              taskName: task.stepName,
              updatedAt: order ? order.updatedAt : null,
              orderType: 'user_profile_update',
              requestType: templateMap[order.orderType]?.name || '用户信息修改申请',
              currentStep: order ? order.currentStep : 1,
              workflowSnapshot: order ? order.workflowSnapshot : null,
              displayConfig: order?.workflowSnapshot?.displayConfig || null,
              orderNo: order ? order.orderNo : '',
              isCurrentApprover: true
            }
          } else {
            // 注册申请
            const name = order ? order.businessData.applicantName : ''
            return {
              _id: task._id,
              orderId: task.orderId,
              openid: order ? order.businessData.applicantId : '',
              name: name,
              gender: order ? order.businessData.gender : '',
              birthday: order ? order.businessData.birthday : '',
              role: order ? order.businessData.role : '',
              relativeName: order ? (order.businessData.relativeName || '') : '',
              position: order ? (order.businessData.position || '无') : '无',
              department: order ? (order.businessData.department || '') : '',
              isAdmin: order ? order.businessData.isAdmin : false,
              avatarText: order ? order.businessData.avatarText : (name ? name.slice(0, 1) : '智'),
              status: requestStatus.PENDING,
              submittedAt: order ? order.createdAt : null,
              taskId: task._id,
              taskName: task.stepName,
              updatedAt: order ? order.updatedAt : null,
              orderType: 'user_registration',
              requestType: templateMap[order?.orderType]?.name || '用户注册申请',
              currentStep: order ? order.currentStep : 1,
              workflowSnapshot: order ? order.workflowSnapshot : null,
              displayConfig: order?.workflowSnapshot?.displayConfig || null,
              orderNo: order ? order.orderNo : '',
              isCurrentApprover: true
            }
          }
        })
      }
    }

    // 查询当前用户处理过的任务（包括已批准和已驳回的任务）
    processedTasksResult = await workflowTasksCollection
      .where({
        approverId: openid,
        taskStatus: db.command.in(['approved', 'rejected'])
      })
      .orderBy('updatedAt', 'desc')
      .limit(Math.min(pageSize, 100))
      .get()

    // 获取这些任务对应的工单ID
    let processedOrderIds = []
    if (processedTasksResult.data) {
      processedOrderIds = [...new Set(processedTasksResult.data.map(task => task.orderId))]
    }

    // 查询已完成的工单（只包括当前用户处理过的工单）
    completedOrdersResult = await workOrdersCollection
      .where({
        _id: db.command.in(processedOrderIds),
        workflowStatus: db.command.in(['completed', 'rejected', 'terminated'])
      })
      .orderBy('updatedAt', 'desc')
      .limit(pageSize)
      .get()

    // 获取已驳回工单的驳回原因
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
      const status = order.workflowStatus === 'completed' ? requestStatus.APPROVED : (order.workflowStatus === 'rejected' ? requestStatus.REJECTED : requestStatus.TERMINATED)
      const info = approvalInfo[order._id] || { reviewedBy: '管理员', reviewedAt: order.updatedAt }

      // 根据订单类型返回不同的字段
      if (order.orderType === 'medical_application') {
        // 就医申请
        return {
          _id: order._id,
          openid: order.businessData.applicantId,
          name: order.businessData.applicantName,
          role: order.businessData.applicantRole,
          patientName: order.businessData.patientName,
          relation: order.businessData.relation,
          medicalDate: order.businessData.medicalDate,
          institution: order.businessData.institution,
          otherInstitution: order.businessData.otherInstitution,
          reasonForSelection: order.businessData.reasonForSelection,
          reason: order.businessData.reason,
          avatarText: order.businessData.applicantName ? order.businessData.applicantName.slice(0, 1) : '就',
          status: status,
          reviewRemark: reviewRemarks[order._id] || '',
          submittedAt: order.createdAt,
          reviewedAt: info.reviewedAt,
          reviewedBy: info.reviewedBy,
          orderType: 'medical_application',
          requestType: templateMap[order.orderType]?.name || '就医申请',
          currentStep: order.currentStep,
          workflowSnapshot: order.workflowSnapshot,
          displayConfig: order.workflowSnapshot?.displayConfig || null,
          orderNo: order.orderNo,
          isCurrentApprover: false
        }
      } else if (order.orderType === 'user_profile_update') {
        // 用户信息修改申请
        return {
          _id: order._id,
          openid: order.businessData.applicantId,
          name: order.businessData.applicantName,
          gender: order.businessData.gender,
          birthday: order.businessData.birthday,
          role: order.businessData.role,
          relativeName: order.businessData.relativeName || '',
          position: order.businessData.position || '无',
          department: order.businessData.department || '',
          isAdmin: order.businessData.isAdmin,
          avatarText: order.businessData.avatarText,
          updateReason: order.businessData.updateReason || '申请修改个人信息',
          status: status,
          reviewRemark: reviewRemarks[order._id] || '',
          submittedAt: order.createdAt,
          reviewedAt: info.reviewedAt,
          reviewedBy: info.reviewedBy,
          orderType: 'user_profile_update',
          requestType: templateMap[order.orderType]?.name || '用户信息修改申请',
          currentStep: order.currentStep,
          workflowSnapshot: order.workflowSnapshot,
          displayConfig: order.workflowSnapshot?.displayConfig || null,
          orderNo: order.orderNo,
          isCurrentApprover: false
        }
      } else {
        // 注册申请
        return {
          _id: order._id,
          openid: order.businessData.applicantId,
          name: order.businessData.applicantName,
          gender: order.businessData.gender,
          birthday: order.businessData.birthday,
          role: order.businessData.role,
          relativeName: order.businessData.relativeName || '',
          position: order.businessData.position || '无',
          department: order.businessData.department || '',
          isAdmin: order.businessData.isAdmin,
          avatarText: order.businessData.avatarText,
          status: status,
          reviewRemark: reviewRemarks[order._id] || '',
          submittedAt: order.createdAt,
          reviewedAt: info.reviewedAt,
          reviewedBy: info.reviewedBy,
          orderType: 'user_registration',
          requestType: templateMap[order.orderType]?.name || '用户注册申请',
          currentStep: order.currentStep,
          workflowSnapshot: order.workflowSnapshot,
          displayConfig: order.workflowSnapshot?.displayConfig || null,
          orderNo: order.orderNo,
          isCurrentApprover: false
        }
      }
    }) : []
  }

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
        mineList: (myOrderResult.data && myOrderResult.data.length >= pageSize),
        pendingList: canReview ? (pendingTasksResult && pendingTasksResult.data && pendingTasksResult.data.length >= pageSize) : false,
        doneList: canReview ? (completedOrdersResult && completedOrdersResult.data && completedOrdersResult.data.length >= pageSize) : false
      }
    },
    summary: {
      pendingCount: pendingList.length,
      approvedCount: doneList.filter(r => r.status === requestStatus.APPROVED).length,
      rejectedCount: doneList.filter(r => r.status === requestStatus.REJECTED).length
    }
  })
}

/**
 * 获取待审批的用户注册申请列表（超级管理员用）
 */
async function getPendingRegistrations() {
  try {
    // 查询用户注册类型的进行中工单
    const ordersResult = await workflowOrdersCollection
      .where({
        orderType: 'user_registration',
        workflowStatus: 'in_progress'
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
        position: businessData.position || '',
        createdAt: order.createdAt
      }
    })

    return success(list)
  } catch (error) {
    console.error('获取待审批注册申请失败:', error)
    return fail(error.message || '获取失败', 500)
  }
}

async function reviewRegistration(openid, payload) {
  const adminUser = await ensureAdminUser(openid)
  const taskId = String((payload && payload.taskId) || '').trim()
  const decision = String((payload && payload.decision) || '').trim()
  const reviewRemark = String((payload && payload.reviewRemark) || '').trim()

  if (!taskId) {
    throw new Error('缺少任务记录')
  }

  if (!['approve', 'reject'].includes(decision)) {
    throw new Error('审批动作无效')
  }

  // 查询任务
  const taskDoc = await workflowTasksCollection.doc(taskId).get()
  const taskRecord = taskDoc.data

  if (!taskRecord) {
    throw new Error('未找到任务记录')
  }

  if (taskRecord.taskStatus !== 'pending') {
    throw new Error('该任务已处理，请刷新页面')
  }

  // 调用工作流引擎进行审批
  try {
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'approveTask',
        taskId: taskId,
        approveAction: decision,  // 修复参数冲突：审批动作改为 approveAction
        comment: reviewRemark || (decision === 'approve' ? '管理员已批准该申请' : '管理员已驳回该申请'),
        operatorId: openid,  // 显式传递操作员 openid
        operatorName: adminUser.name || '管理员'
      }
    })

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '审批失败')
    }

    const resultData = workflowResult.result.data

    // 如果是单步审批且审批通过，工作流引擎会自动创建用户记录
    // 这里只需要返回审批结果
    return success({
      reviewer: formatUserRecord(adminUser),
      taskId: taskId,
      orderId: resultData.orderId,
      status: resultData.status,
      message: decision === 'approve' ? '审批通过' : '审批已驳回'
    }, decision === 'approve' ? '审批通过' : '审批已驳回')
  } catch (error) {
    throw new Error('审批失败: ' + error.message)
  }
}

// 获取工作流日志
async function getWorkflowLogs(orderId) {
  try {
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

      const actionText = {
        'start': '提交工单',
        'approve': '审批通过',
        'reject': '审批驳回',
        'return': '退回补充',
        'cancel': '撤回工单',
        'terminate': '中止工单',
        'timeout': '超时处理',
        'escalate': '升级处理',
        'auto_approve': '自动通过',
        'auto_reject': '自动驳回',
        'remind': '发送提醒'
      }[log.action] || log.action

      return {
        _id: log._id,
        action: log.action,
        actionText: actionText,
        operatorId: log.operatorId,
        operatorName: operatorName,
        description: log.description,
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
        pageSize: event.pageSize || 20
      }
      return await getApprovalData(openid, pagination)
    }

    if (action === 'reviewRegistration') {
      return await reviewRegistration(openid, event)
    }

    if (action === 'getWorkflowLogs') {
      return await getWorkflowLogs(event.orderId)
    }

    // 超级管理员：获取待审批的用户注册申请列表（无需 openid 验证）
    if (action === 'getPendingRegistrations') {
      return await getPendingRegistrations()
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
