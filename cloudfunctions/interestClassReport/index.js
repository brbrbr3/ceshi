// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 集合引用
const interestClassReportsCollection = db.collection('interest_class_reports')
const usersCollection = db.collection('office_users')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 兴趣班备案云函数
 *
 * 支持的 action：
 * - list: 分页查询，按角色自动过滤查询范围与状态
 * - create: 新增备案（status 默认 active）
 * - edit: 编辑备案（先 create 新记录，再 end 原记录，保留备查历史）
 * - end: 结束备案（status 置为 ended，不删除数据）
 */
exports.main = async (event, context) => {
  const { action, params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      case 'list':
        return await handleList(openid, params)
      case 'create':
        return await handleCreate(openid, params)
      case 'edit':
        return await handleEdit(openid, params)
      case 'end':
        return await handleEnd(openid, params)
      default:
        return fail('未知的操作类型', 400)
    }
  } catch (error) {
    console.error('操作失败:', error)
    return fail(error.message)
  }
}

/**
 * 获取当前用户信息
 */
async function getCurrentUser(openid) {
  const userRes = await usersCollection.where({ openid }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) {
    return null
  }
  return userRes.data[0]
}

/**
 * 分页查询
 * 按角色自动过滤查询范围与状态：
 * - 部门负责人 → 本部门，仅生效中
 * - 馆领导（非部门负责人）→ 全体，仅生效中
 * - 其他 → 仅自己，全部（含已结束）
 */
async function handleList(openid, params) {
  const { page = 1, pageSize = 15, keyword, status } = params || {}
  const skip = (page - 1) * pageSize

  const currentUser = await getCurrentUser(openid)
  if (!currentUser) {
    return fail('用户不存在', 403)
  }

  // 构建查询条件
  const conditions = {}

  const isDeptHead = currentUser.isDepartmentHead === true
  const isLeader = currentUser.role === '馆领导'

  if (isDeptHead) {
    // 部门负责人 → 本部门 + 仅生效中
    conditions.creatorDepartment = currentUser.department || ''
    conditions.status = 'active'
  } else if (isLeader) {
    // 馆领导（非部门负责人）→ 全体 + 仅生效中
    conditions.status = 'active'
  } else {
    // 其他 → 仅自己 + 全部（含已结束）
    conditions._openid = openid
    // 支持前端按 status 筛选（生效中/已结束/全部）
    if (status && status !== 'all') {
      conditions.status = status
    }
  }

  // 关键词搜索（姓名 / 兴趣班名称）
  if (keyword && keyword.trim()) {
    const reg = db.RegExp({ regexp: keyword.trim(), options: 'i' })
    conditions.name = conditions.name
      ? _.and(conditions.name, reg)
      : reg
    // 用 _.or 实现 name 或 className 模糊匹配
    delete conditions.name
    const baseCond = {}
    if (isDeptHead) {
      baseCond.creatorDepartment = currentUser.department || ''
      baseCond.status = 'active'
    } else if (isLeader) {
      baseCond.status = 'active'
    } else {
      baseCond._openid = openid
      if (status && status !== 'all') {
        baseCond.status = status
      }
    }
    const query = _.and([
      baseCond,
      _.or([{ name: reg }, { className: reg }])
    ])
    const countRes = await interestClassReportsCollection.where(query).count()
    const total = countRes.total
    const listRes = await interestClassReportsCollection
      .where(query)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    return success({
      list: listRes.data || [],
      total,
      page,
      pageSize,
      hasMore: skip + (listRes.data || []).length < total
    })
  }

  // 无关键词的普通查询
  const countRes = await interestClassReportsCollection.where(conditions).count()
  const total = countRes.total
  const listRes = await interestClassReportsCollection
    .where(conditions)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return success({
    list: listRes.data || [],
    total,
    page,
    pageSize,
    hasMore: skip + (listRes.data || []).length < total
  })
}

/**
 * 校验备案字段
 */
function validateReportData(params) {
  const { name, className, timeSlot, teachingMode } = params || {}
  if (!String(name || '').trim()) return '请填写姓名'
  if (!String(className || '').trim()) return '请填写兴趣班名称'
  if (!String(timeSlot || '').trim()) return '请填写兴趣班时段'
  if (!String(teachingMode || '').trim()) return '请填写教学模式'
  return null
}

/**
 * 新增备案
 */
async function handleCreate(openid, params) {
  const errorMsg = validateReportData(params)
  if (errorMsg) return fail(errorMsg, 400)

  const currentUser = await getCurrentUser(openid)
  if (!currentUser) {
    return fail('用户不存在', 403)
  }

  const now = Date.now()
  const reportData = {
    _openid: openid,
    name: String(params.name).trim(),
    className: String(params.className).trim(),
    timeSlot: String(params.timeSlot).trim(),
    teachingMode: String(params.teachingMode).trim(),
    companion: String(params.companion || '').trim(),
    remark: String(params.remark || '').trim(),
    creatorName: currentUser.name || '',
    creatorDepartment: currentUser.department || '',
    creatorRole: currentUser.role || '',
    status: 'active',
    endedAt: null,
    createdAt: now,
    updatedAt: now
  }

  const result = await interestClassReportsCollection.add({ data: reportData })

  return success({ _id: result._id, ...reportData }, '备案成功')
}

/**
 * 编辑备案（结束原记录 + 新增一条新记录）
 * 顺序：先 create 新记录成功，再 end 原记录（保证数据不丢失）
 */
async function handleEdit(openid, params) {
  const { recordId } = params
  if (!recordId) return fail('缺少备案记录ID', 400)

  const errorMsg = validateReportData(params)
  if (errorMsg) return fail(errorMsg, 400)

  // 查询原记录并校验权限
  const recordRes = await interestClassReportsCollection.doc(recordId).get()
  if (!recordRes.data) {
    return fail('备案记录不存在', 404)
  }
  const originalRecord = recordRes.data

  if (originalRecord._openid !== openid) {
    return fail('无权操作此记录', 403)
  }
  if (originalRecord.status !== 'active') {
    return fail('该备案已结束，无法编辑', 400)
  }

  const currentUser = await getCurrentUser(openid)
  if (!currentUser) {
    return fail('用户不存在', 403)
  }

  // 1. 先 create 新记录
  const now = Date.now()
  const newReportData = {
    _openid: openid,
    name: String(params.name).trim(),
    className: String(params.className).trim(),
    timeSlot: String(params.timeSlot).trim(),
    teachingMode: String(params.teachingMode).trim(),
    companion: String(params.companion || '').trim(),
    remark: String(params.remark || '').trim(),
    creatorName: currentUser.name || '',
    creatorDepartment: currentUser.department || '',
    creatorRole: currentUser.role || '',
    status: 'active',
    endedAt: null,
    createdAt: now,
    updatedAt: now
  }

  const createResult = await interestClassReportsCollection.add({ data: newReportData })

  // 2. 再 end 原记录（即使此步失败，新记录已创建，不影响使用）
  try {
    await interestClassReportsCollection.doc(recordId).update({
      data: {
        status: 'ended',
        endedAt: now,
        updatedAt: now
      }
    })
  } catch (e) {
    console.warn('结束原备案记录失败（新记录已创建）:', e)
  }

  return success({ _id: createResult._id, ...newReportData }, '编辑成功，原备案已结束')
}

/**
 * 结束备案（仅创建者可操作，仅生效中记录可结束）
 */
async function handleEnd(openid, params) {
  const { recordId } = params || {}
  if (!recordId) return fail('缺少备案记录ID', 400)

  const recordRes = await interestClassReportsCollection.doc(recordId).get()
  if (!recordRes.data) {
    return fail('备案记录不存在', 404)
  }
  const record = recordRes.data

  if (record._openid !== openid) {
    return fail('无权操作此记录', 403)
  }
  if (record.status !== 'active') {
    return fail('该备案已结束', 400)
  }

  const now = Date.now()
  await interestClassReportsCollection.doc(recordId).update({
    data: {
      status: 'ended',
      endedAt: now,
      updatedAt: now
    }
  })

  return success({ recordId, status: 'ended', endedAt: now }, '已结束该兴趣班')
}
