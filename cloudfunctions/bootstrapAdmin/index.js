const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const usersCollection = db.collection('office_users')
const ordersCollection = db.collection('work_orders')
const tasksCollection = db.collection('workflow_tasks')
const logsCollection = db.collection('workflow_logs')

const APPROVED_STATUS = 'approved'
const BOOTSTRAP_APPROVER_ID = 'bootstrap_admin'
const BOOTSTRAP_APPROVER_NAME = '系统初始化'

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

async function getApprovedAdminCount() {
  const countRes = await usersCollection.where({
    status: APPROVED_STATUS,
    isAdmin: true
  }).count()

  return countRes.total || 0
}

async function getLatestRegistrationOrder(openid) {
  const res = await ordersCollection.where({
    'businessData.applicantId': openid,
    orderType: 'user_registration'
  })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  return res.data && res.data.length > 0 ? res.data[0] : null
}

function readBootstrapKey() {
  return String(process.env.BOOTSTRAP_ADMIN_KEY || '').trim()
}

async function getStatus(openid) {
  const bootstrapKeyConfigured = !!readBootstrapKey()
  const approvedAdminCount = await getApprovedAdminCount()
  const hasApprovedAdmin = approvedAdminCount > 0
  const existingUserRes = await usersCollection.where({ openid }).limit(1).get()
  const existingUser = existingUserRes.data && existingUserRes.data.length > 0
    ? existingUserRes.data[0]
    : null

  return success({
    bootstrapKeyConfigured,
    hasApprovedAdmin,
    canBootstrap: bootstrapKeyConfigured && !hasApprovedAdmin,
    currentUser: existingUser ? {
      openid: existingUser.openid,
      name: existingUser.name,
      status: existingUser.status,
      isAdmin: !!existingUser.isAdmin
    } : null
  })
}

async function markRegistrationOrdersCompleted(openid, now) {
  const pendingOrdersRes = await ordersCollection.where({
    'businessData.applicantId': openid,
    orderType: 'user_registration',
    workflowStatus: _.in(['pending', 'supplement'])
  }).get()

  const pendingOrders = pendingOrdersRes.data || []

  for (const order of pendingOrders) {
    await ordersCollection.doc(order._id).update({
      data: {
        workflowStatus: 'completed',
        finalDecision: 'approved',
        reviewedBy: BOOTSTRAP_APPROVER_NAME,
        reviewedAt: now,
        completedAt: now,
        totalDuration: now - (order.startedAt || order.submittedAt || now),
        updatedAt: now
      }
    })

    const pendingTasksRes = await tasksCollection.where({
      orderId: order._id,
      taskStatus: 'pending'
    }).get()

    const pendingTasks = pendingTasksRes.data || []
    for (const task of pendingTasks) {
      await tasksCollection.doc(task._id).update({
        data: {
          taskStatus: 'approved',
          action: 'approve',
          comment: '首个管理员引导完成注册审批',
          actualApproverId: BOOTSTRAP_APPROVER_ID,
          actualApproverName: BOOTSTRAP_APPROVER_NAME,
          startedAt: now,
          completedAt: now,
          updatedAt: now
        }
      })
    }

    await logsCollection.add({
      data: {
        orderId: order._id,
        taskId: null,
        stepName: '管理员引导初始化',
        action: 'approve',
        operatorType: 'system',
        operatorId: BOOTSTRAP_APPROVER_ID,
        operatorName: BOOTSTRAP_APPROVER_NAME,
        description: '首个管理员引导完成注册审批',
        detail: '首个管理员引导完成注册审批',
        beforeData: {
          workflowStatus: order.workflowStatus
        },
        afterData: {
          workflowStatus: 'completed',
          finalDecision: 'approved'
        },
        changes: null,
        createdAt: now
      }
    })

    await logsCollection.add({
      data: {
        orderId: order._id,
        taskId: null,
        stepName: '管理员引导初始化',
        action: 'complete',
        operatorType: 'system',
        operatorId: BOOTSTRAP_APPROVER_ID,
        operatorName: BOOTSTRAP_APPROVER_NAME,
        description: '首个管理员引导完成',
        detail: '首个管理员引导完成',
        beforeData: {
          workflowStatus: order.workflowStatus
        },
        afterData: {
          workflowStatus: 'completed',
          finalDecision: 'approved'
        },
        changes: null,
        createdAt: now
      }
    })
  }

  return pendingOrders
}

async function claimAdmin(openid, inviteCode) {
  const expectedKey = readBootstrapKey()
  if (!expectedKey) {
    return fail('未配置初始化密钥，请先在云函数环境变量中设置 BOOTSTRAP_ADMIN_KEY', 500)
  }

  if (String(inviteCode || '').trim() !== expectedKey) {
    return fail('初始化密钥错误', 403)
  }

  const approvedAdminCount = await getApprovedAdminCount()
  if (approvedAdminCount > 0) {
    return fail('系统中已存在管理员，初始化入口已关闭', 409)
  }

  const registrationOrder = await getLatestRegistrationOrder(openid)
  if (!registrationOrder) {
    return fail('请先提交注册申请，再进行首个管理员初始化', 400)
  }

  const businessData = registrationOrder.businessData || {}
  const now = Date.now()
  const existingUserRes = await usersCollection.where({ openid }).limit(1).get()
  const existingUser = existingUserRes.data && existingUserRes.data.length > 0
    ? existingUserRes.data[0]
    : null

  const userPayload = {
    openid,
    name: businessData.applicantName || existingUser?.name || '',
    gender: businessData.gender || existingUser?.gender || '',
    birthday: businessData.birthday || existingUser?.birthday || '',
    role: businessData.role || existingUser?.role || '馆领导',
    isAdmin: true,
    avatarText: businessData.avatarText || existingUser?.avatarText || (businessData.applicantName ? businessData.applicantName.slice(0, 1) : ''),
    relativeName: businessData.relativeName || existingUser?.relativeName || '',
    position: Array.isArray(businessData.position) ? businessData.position : (Array.isArray(existingUser?.position) ? existingUser.position : []),
    department: businessData.department || existingUser?.department || '',
    status: APPROVED_STATUS,
    sourceOrderId: registrationOrder._id,
    approvedAt: now,
    approvedBy: BOOTSTRAP_APPROVER_ID,
    createdAt: existingUser ? (existingUser.createdAt || now) : now,
    updatedAt: now
  }

  if (existingUser) {
    await usersCollection.doc(existingUser._id).update({ data: userPayload })
  } else {
    await usersCollection.add({ data: userPayload })
  }

  const completedOrders = await markRegistrationOrdersCompleted(openid, now)

  return success({
    openid,
    user: {
      openid,
      name: userPayload.name,
      role: userPayload.role,
      isAdmin: true,
      status: APPROVED_STATUS
    },
    completedOrderIds: completedOrders.map(order => order._id)
  }, '首个管理员初始化成功')
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event && event.action

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  try {
    switch (action) {
      case 'getStatus':
        return await getStatus(openid)
      case 'claimAdmin':
        return await claimAdmin(openid, event.inviteCode)
      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
