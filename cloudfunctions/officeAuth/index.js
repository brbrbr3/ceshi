const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const usersCollection = db.collection('office_users')
const requestCollection = db.collection('office_registration_requests')
const workOrdersCollection = db.collection('work_orders')
const workflowTasksCollection = db.collection('workflow_tasks')
const workflowLogsCollection = db.collection('workflow_logs')
const ROLE_OPTIONS = ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
const GENDER_OPTIONS = ['男', '女']
const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
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
    updatedAt: record.updatedAt || null
  }
}

function formatRequestRecord(record) {
  if (!record) {
    return null
  }

  return {
    _id: record._id,
    openid: record.openid,
    requestNo: record.requestNo,
    name: record.name,
    gender: record.gender,
    birthday: record.birthday,
    role: record.role,
    isAdmin: !!record.isAdmin,
    status: record.status,
    avatarText: record.avatarText || (record.name ? record.name.slice(0, 1) : '智'),
    reviewRemark: record.reviewRemark || '',
    submittedAt: record.submittedAt || record.createdAt || null,
    updatedAt: record.updatedAt || null,
    reviewedAt: record.reviewedAt || null,
    reviewedBy: record.reviewedBy || ''
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

function validateForm(formData) {
  const payload = formData || {}
  const name = String(payload.name || '').trim()
  const gender = String(payload.gender || '').trim()
  const birthday = String(payload.birthday || '').trim()
  const role = String(payload.role || '').trim()
  const isAdmin = normalizeBoolean(payload.isAdmin)

  if (!name) {
    throw new Error('请输入姓名')
  }

  if (!GENDER_OPTIONS.includes(gender)) {
    throw new Error('请选择性别')
  }

  if (!birthday) {
    throw new Error('请选择出生日期')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    throw new Error('出生日期格式不正确')
  }

  if (!ROLE_OPTIONS.includes(role)) {
    throw new Error('请选择角色')
  }

  return {
    name,
    gender,
    birthday,
    role,
    isAdmin,
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

async function findRequestByOpenId(openid) {
  const result = await requestCollection.where({ openid }).limit(1).get()
  return result.data[0] || null
}

async function ensureAdminUser(openid) {
  const userRecord = await findUserByOpenId(openid)
  if (!userRecord || userRecord.status !== REQUEST_STATUS.APPROVED || !userRecord.isAdmin) {
    throw new Error('仅管理员可执行此操作')
  }
  return userRecord
}

async function checkRegistration(openid) {
  console.log('=== checkRegistration 开始 ===')
  console.log('openid:', openid)

  // 先查询用户表
  const userRecord = await findUserByOpenId(openid)
  console.log('查询用户表结果:', userRecord ? '找到记录' : '未找到记录')

  if (userRecord && userRecord.status === REQUEST_STATUS.APPROVED) {
    console.log('用户表找到已批准记录，返回已注册')
    return success({
      openid,
      registered: true,
      authStatus: REQUEST_STATUS.APPROVED,
      user: formatUserRecord(userRecord),
      request: null
    })
  }

  // 查询工作流工单
  const orderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid,
      orderType: 'user_registration'
    })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get()

  if (orderResult.data && orderResult.data.length > 0) {
    const order = orderResult.data[0]
    console.log('找到工作流工单，状态:', order.status)

    // 如果工单已完成，自动创建或更新用户记录
    if (order.status === 'approved' || order.status === 'rejected') {
      console.log('工单已完成，处理用户记录')

      if (order.status === 'approved') {
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
          status: REQUEST_STATUS.APPROVED,
          sourceOrderId: order.orderId,
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

        // 更新旧申请表
        const existingRequest = await findRequestByOpenId(openid)
        if (existingRequest) {
          await requestCollection.doc(existingRequest._id).update({
            data: {
              status: REQUEST_STATUS.APPROVED,
              reviewedAt: now,
              reviewedBy: order.updatedBy || '',
              updatedAt: now
            }
          })
        }

        const updatedUser = await findUserByOpenId(openid)
        return success({
          openid,
          registered: true,
          authStatus: REQUEST_STATUS.APPROVED,
          user: formatUserRecord(updatedUser),
          request: null
        })
      } else {
        // 审批驳回
        const existingRequest = await findRequestByOpenId(openid)
        if (existingRequest) {
          await requestCollection.doc(existingRequest._id).update({
            data: {
              status: REQUEST_STATUS.REJECTED,
              reviewRemark: order.finalRemark || '管理员已驳回该申请',
              reviewedAt: order.updatedTime || Date.now(),
              reviewedBy: order.updatedBy || '',
              updatedAt: Date.now()
            }
          })
        }

        return success({
          openid,
          registered: false,
          authStatus: REQUEST_STATUS.REJECTED,
          user: null,
          request: {
            _id: order.orderId,
            openid: openid,
            status: REQUEST_STATUS.REJECTED,
            reviewRemark: order.finalRemark || '管理员已驳回该申请'
          }
        })
      }
    }

    // 工单进行中，返回待审核状态
    return success({
      openid,
      registered: false,
      authStatus: REQUEST_STATUS.PENDING,
      user: null,
      request: {
        _id: order.orderId,
        openid: openid,
        status: REQUEST_STATUS.PENDING,
        submittedAt: order.createTime
      }
    })
  }

  // 查询旧的申请表（兼容性处理）
  const requestRecord = await findRequestByOpenId(openid)
  console.log('查询申请表结果:', requestRecord ? '找到记录，状态:' + requestRecord.status : '未找到记录')

  // 如果申请已批准但用户表无记录，自动创建用户记录（数据修复）
  if (requestRecord && requestRecord.status === REQUEST_STATUS.APPROVED) {
    console.log('申请已批准但用户表无记录，自动创建用户记录')
    const now = Date.now()
    const userPayload = {
      openid: requestRecord.openid,
      name: requestRecord.name,
      gender: requestRecord.gender,
      birthday: requestRecord.birthday,
      role: requestRecord.role,
      isAdmin: !!requestRecord.isAdmin,
      avatarText: requestRecord.avatarText || (requestRecord.name ? requestRecord.name.slice(0, 1) : '智'),
      status: REQUEST_STATUS.APPROVED,
      sourceRequestId: requestRecord._id,
      approvedAt: now,
      approvedBy: requestRecord.reviewedBy || '',
      createdAt: now,
      updatedAt: now
    }

    try {
      await usersCollection.add({ data: userPayload })
      console.log('自动创建用户记录成功')
      return success({
        openid,
        registered: true,
        authStatus: REQUEST_STATUS.APPROVED,
        user: formatUserRecord(userPayload),
        request: formatRequestRecord(requestRecord)
      })
    } catch (e) {
      console.error('自动创建用户记录失败:', e)
      // 即使创建失败，也返回已注册状态，让用户能正常使用
      return success({
        openid,
        registered: true,
        authStatus: REQUEST_STATUS.APPROVED,
        user: formatUserRecord(requestRecord),
        request: formatRequestRecord(requestRecord)
      })
    }
  }

  // 申请待审核或已驳回
  if (requestRecord) {
    console.log('返回: 未注册，申请状态:', requestRecord.status)
    return success({
      openid,
      registered: false,
      authStatus: requestRecord.status,
      user: null,
      request: formatRequestRecord(requestRecord)
    })
  }

  console.log('返回: 未注册，无申请记录')
  return success({
    openid,
    registered: false,
    authStatus: 'unregistered',
    user: null,
    request: null
  })
}

async function submitRegistration(openid, formData) {
  const form = validateForm(formData)
  const existingUser = await findUserByOpenId(openid)
  if (existingUser && existingUser.status === REQUEST_STATUS.APPROVED) {
    return success({
      openid,
      authStatus: REQUEST_STATUS.APPROVED,
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
      authStatus: REQUEST_STATUS.PENDING,
      orderId: existingOrder.orderId,
      request: {
        _id: existingOrder.orderId,
        openid: openid,
        status: REQUEST_STATUS.PENDING,
        submittedAt: existingOrder.createTime
      }
    })
  }

  // 调用工作流引擎提交工单
  try {
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
          phone: formData.phone || '',
          email: formData.email || '',
          applyReason: formData.applyReason || '申请注册系统'
        }
      }
    })

    console.log('工作流引擎返回:', workflowResult)

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '提交工作流工单失败')
    }

    const orderId = workflowResult.result.data.orderId

    // 更新旧申请表的数据，保持兼容性
    const existingRequest = await findRequestByOpenId(openid)
    const now = Date.now()
    const requestPayload = {
      openid,
      name: form.name,
      gender: form.gender,
      birthday: form.birthday,
      role: form.role,
      isAdmin: form.isAdmin,
      avatarText: form.avatarText,
      status: REQUEST_STATUS.PENDING,
      reviewRemark: '',
      reviewedAt: null,
      reviewedBy: '',
      updatedAt: now,
      submittedAt: now,
      source: 'workflow',
      orderId: orderId // 关联工作流工单ID
    }

    if (existingRequest) {
      await requestCollection.doc(existingRequest._id).update({
        data: Object.assign({}, requestPayload, {
          requestNo: existingRequest.requestNo || createRequestNo(),
          createdAt: existingRequest.createdAt || now
        })
      })
    } else {
      const createPayload = Object.assign({}, requestPayload, {
        requestNo: createRequestNo(),
        createdAt: now
      })
      await requestCollection.add({ data: createPayload })
    }

    return success({
      openid,
      authStatus: REQUEST_STATUS.PENDING,
      orderId: orderId,
      request: {
        _id: orderId,
        openid: openid,
        name: form.name,
        role: form.role,
        status: REQUEST_STATUS.PENDING,
        submittedAt: now
      },
      user: null
    }, '注册申请已提交')
  } catch (error) {
    console.error('调用工作流引擎失败:', error)
    throw new Error('提交工作流工单失败: ' + error.message)
  }
}

async function getApprovalData(openid) {
  const currentUser = await findUserByOpenId(openid)
  const canReview = !!(currentUser && currentUser.status === REQUEST_STATUS.APPROVED && currentUser.isAdmin)

  // 查询我的工单
  const myOrderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid,
      orderType: 'user_registration'
    })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get()

  const mineList = myOrderResult.data ? myOrderResult.data.map(order => ({
    _id: order.orderId,
    openid: order.businessData.applicantId,
    name: order.businessData.applicantName,
    gender: order.businessData.gender,
    role: order.businessData.role,
    status: order.status === 'approved' ? REQUEST_STATUS.APPROVED : (order.status === 'rejected' ? REQUEST_STATUS.REJECTED : REQUEST_STATUS.PENDING),
    reviewRemark: order.finalRemark || '',
    submittedAt: order.createTime,
    reviewedAt: order.updatedTime,
    reviewedBy: order.updatedBy || ''
  })) : []

  // 管理员查询所有待审批工单
  let pendingList = []
  let doneList = []

  if (canReview) {
    // 查询待审批的任务
    const pendingTasksResult = await workflowTasksCollection
      .where({
        approverId: openid,
        status: 'pending'
      })
      .orderBy('assignTime', 'desc')
      .get()

    if (pendingTasksResult.data) {
      const orderIds = pendingTasksResult.data.map(task => task.orderId)
      
      // 批量查询工单详情
      if (orderIds.length > 0) {
        const ordersResult = await workOrdersCollection
          .where({
            orderId: db.command.in(orderIds)
          })
          .get()

        const ordersMap = {}
        if (ordersResult.data) {
          ordersResult.data.forEach(order => {
            ordersMap[order.orderId] = order
          })
        }

        pendingList = pendingTasksResult.data.map(task => {
          const order = ordersMap[task.orderId]
          return {
            _id: task.taskId,
            orderId: task.orderId,
            openid: order ? order.businessData.applicantId : '',
            name: order ? order.businessData.applicantName : '',
            gender: order ? order.businessData.gender : '',
            role: order ? order.businessData.role : '',
            status: REQUEST_STATUS.PENDING,
            submittedAt: order ? order.createTime : null,
            taskId: task.taskId,
            taskName: task.taskName
          }
        })
      }
    }

    // 查询已完成的工单
    const completedOrdersResult = await workOrdersCollection
      .where({
        orderType: 'user_registration',
        status: db.command.in(['approved', 'rejected'])
      })
      .orderBy('updateTime', 'desc')
      .limit(50)
      .get()

    doneList = completedOrdersResult.data ? completedOrdersResult.data.map(order => ({
      _id: order.orderId,
      openid: order.businessData.applicantId,
      name: order.businessData.applicantName,
      gender: order.businessData.gender,
      role: order.businessData.role,
      status: order.status === 'approved' ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.REJECTED,
      reviewRemark: order.finalRemark || '',
      submittedAt: order.createTime,
      reviewedAt: order.updatedTime,
      reviewedBy: order.updatedBy || ''
    })) : []
  }

  return success({
    canReview,
    currentUser: formatUserRecord(currentUser),
    mineList,
    pendingList,
    doneList,
    summary: {
      pendingCount: pendingList.length,
      approvedCount: doneList.filter(r => r.status === REQUEST_STATUS.APPROVED).length,
      rejectedCount: doneList.filter(r => r.status === REQUEST_STATUS.REJECTED).length
    }
  })
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

  if (taskRecord.status !== 'pending') {
    throw new Error('该任务已处理，请刷新页面')
  }

  // 调用工作流引擎进行审批
  try {
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'approveTask',
        taskId: taskId,
        action: decision,
        comment: reviewRemark || (decision === 'approve' ? '管理员已批准该申请' : '管理员已驳回该申请')
      }
    })

    console.log('工作流引擎返回:', workflowResult)

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
    console.error('调用工作流引擎失败:', error)
    throw new Error('审批失败: ' + error.message)
  }
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

    if (action === 'getApprovalData') {
      return await getApprovalData(openid)
    }

    if (action === 'reviewRegistration') {
      return await reviewRegistration(openid, event)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    console.error('officeAuth 执行失败', error)
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
