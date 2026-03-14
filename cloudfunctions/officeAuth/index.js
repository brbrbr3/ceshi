const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const usersCollection = db.collection('office_users')
const requestCollection = db.collection('office_registration_requests')
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

  // 查询申请表
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

  const existingRequest = await findRequestByOpenId(openid)
  if (existingRequest && existingRequest.status === REQUEST_STATUS.PENDING) {
    return fail('您的注册申请正在审核中，请勿重复提交', 409, {
      authStatus: REQUEST_STATUS.PENDING,
      request: formatRequestRecord(existingRequest)
    })
  }

  const now = Date.now()
  const payload = {
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
    source: 'miniprogram'
  }

  if (existingRequest) {
    await requestCollection.doc(existingRequest._id).update({
      data: Object.assign({}, payload, {
        requestNo: existingRequest.requestNo || createRequestNo(),
        createdAt: existingRequest.createdAt || now
      })
    })

    const updatedRequest = await requestCollection.doc(existingRequest._id).get()
    return success({
      openid,
      authStatus: REQUEST_STATUS.PENDING,
      request: formatRequestRecord(updatedRequest.data),
      user: null
    }, '注册申请已重新提交')
  }

  const createPayload = Object.assign({}, payload, {
    requestNo: createRequestNo(),
    createdAt: now
  })

  const createResult = await requestCollection.add({
    data: createPayload
  })

  const createdRequest = await requestCollection.doc(createResult._id).get()
  return success({
    openid,
    authStatus: REQUEST_STATUS.PENDING,
    request: formatRequestRecord(createdRequest.data),
    user: null
  }, '注册申请已提交')
}

async function getApprovalData(openid) {
  const currentUser = await findUserByOpenId(openid)
  const mineRequest = await findRequestByOpenId(openid)
  const canReview = !!(currentUser && currentUser.status === REQUEST_STATUS.APPROVED && currentUser.isAdmin)

  // 始终查询待审批数量
  const [pendingCountRes, pendingRes, approvedRes, rejectedRes] = await Promise.all([
    requestCollection.where({ status: REQUEST_STATUS.PENDING }).count(),
    requestCollection.where({ status: REQUEST_STATUS.PENDING }).orderBy('updatedAt', 'desc').limit(50).get(),
    requestCollection.where({ status: REQUEST_STATUS.APPROVED }).orderBy('updatedAt', 'desc').limit(50).get(),
    requestCollection.where({ status: REQUEST_STATUS.REJECTED }).orderBy('updatedAt', 'desc').limit(50).get()
  ])

  const result = {
    canReview,
    currentUser: formatUserRecord(currentUser),
    mineList: mineRequest ? [formatRequestRecord(mineRequest)] : [],
    pendingList: [],
    doneList: [],
    summary: {
      pendingCount: pendingCountRes.total || 0,
      approvedCount: 0,
      rejectedCount: 0
    }
  }

  if (!canReview) {
    return success(result)
  }

  result.pendingList = pendingRes.data.map(formatRequestRecord)
  result.doneList = approvedRes.data.concat(rejectedRes.data)
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, 50)
    .map(formatRequestRecord)
  result.summary = {
    pendingCount: pendingCountRes.total || 0,
    approvedCount: approvedRes.data.length,
    rejectedCount: rejectedRes.data.length
  }

  return success(result)
}

async function reviewRegistration(openid, payload) {
  const adminUser = await ensureAdminUser(openid)
  const requestId = String((payload && payload.requestId) || '').trim()
  const decision = String((payload && payload.decision) || '').trim()
  const reviewRemark = String((payload && payload.reviewRemark) || '').trim()

  if (!requestId) {
    throw new Error('缺少申请记录')
  }

  if (!['approve', 'reject'].includes(decision)) {
    throw new Error('审批动作无效')
  }

  const requestDoc = await requestCollection.doc(requestId).get()
  const requestRecord = requestDoc.data

  if (!requestRecord) {
    throw new Error('未找到申请记录')
  }

  if (requestRecord.status !== REQUEST_STATUS.PENDING) {
    throw new Error('该申请已处理，请刷新页面')
  }

  const now = Date.now()
  const nextStatus = decision === 'approve' ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.REJECTED
  const nextRemark = reviewRemark || (decision === 'approve' ? '管理员已批准该申请' : '管理员已驳回该申请')

  await requestCollection.doc(requestId).update({
    data: {
      status: nextStatus,
      reviewRemark: nextRemark,
      reviewedAt: now,
      reviewedBy: openid,
      updatedAt: now
    }
  })

  if (decision === 'approve') {
    const existingUser = await findUserByOpenId(requestRecord.openid)
    const userPayload = {
      openid: requestRecord.openid,
      name: requestRecord.name,
      gender: requestRecord.gender,
      birthday: requestRecord.birthday,
      role: requestRecord.role,
      isAdmin: !!requestRecord.isAdmin,
      avatarText: requestRecord.avatarText || (requestRecord.name ? requestRecord.name.slice(0, 1) : '智'),
      status: REQUEST_STATUS.APPROVED,
      sourceRequestId: requestId,
      approvedAt: now,
      approvedBy: openid,
      createdAt: existingUser ? (existingUser.createdAt || now) : now,
      updatedAt: now
    }

    if (existingUser) {
      await usersCollection.doc(existingUser._id).update({
        data: userPayload
      })
    } else {
      await usersCollection.add({
        data: userPayload
      })
    }
  }

  const updatedRequest = await requestCollection.doc(requestId).get()
  const targetUser = decision === 'approve' ? await findUserByOpenId(requestRecord.openid) : null

  return success({
    reviewer: formatUserRecord(adminUser),
    request: formatRequestRecord(updatedRequest.data),
    user: formatUserRecord(targetUser)
  }, decision === 'approve' ? '审批通过' : '审批已驳回')
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
