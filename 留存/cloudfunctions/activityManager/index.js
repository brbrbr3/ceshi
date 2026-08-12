const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const activitiesCollection = db.collection('activities')
const registrationsCollection = db.collection('activity_registrations')
const usersCollection = db.collection('office_users')

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

/**
 * 判断当前用户是否为活动的目标用户
 * @param {string} openid 当前用户openid
 * @param {object} activity 活动对象
 * @returns {Promise<boolean>}
 */
async function isUserTarget(openid, activity) {
  // 未启用目标用户限制 → 所有人都是目标用户
  if (!activity.isTargetRoleEnabled) return true
  // 启用了但没有指定角色 → 视为所有人
  if (!activity.targetRoles || activity.targetRoles.length === 0) return true
  // 查询用户的角色
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) return false
  const user = userResult.data[0]
  const userRole = user.role || ''
  // 检查用户角色是否匹配任一目标角色
  return activity.targetRoles.includes(userRole)
}

/**
 * 创建活动
 */
async function createActivity(openid, data) {
  const { title, content, registrationDeadline, isTargetRoleEnabled, targetRoles, isGroupedActivity, groups, isMaxRegistrationsEnabled, maxRegistrations, isTargetOnlyVisible, isRegistrationVisible } = data

  if (!title || !title.trim()) {
    return fail('标题不能为空', 400)
  }

  if (!content || !content.trim()) {
    return fail('活动内容不能为空', 400)
  }

  if (title.length > 50) {
    return fail('标题不能超过50个字符', 400)
  }

  // 分组活动校验
  if (isGroupedActivity && (!groups || groups.length === 0)) {
    return fail('分组活动至少需要一个分组', 400)
  }

  // 获取用户信息
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    return fail('用户不存在', 404)
  }
  const user = userResult.data[0]

  const now = Date.now()

  const activityData = {
    title: title.trim(),
    content: content.trim(),
    registrationDeadline: registrationDeadline || null,
    creatorOpenid: openid,
    creatorName: user.name,
    // 目标用户
    isTargetRoleEnabled: !!isTargetRoleEnabled,
    targetRoles: isTargetRoleEnabled ? (targetRoles || []) : [],
    // 分组
    isGroupedActivity: !!isGroupedActivity,
    groups: isGroupedActivity ? (groups || []).map(g => ({ name: g.name })) : [],
    // 人数上限
    isMaxRegistrationsEnabled: !!isMaxRegistrationsEnabled,
    maxRegistrations: isMaxRegistrationsEnabled ? (maxRegistrations || 50) : null,
    // 可见性控制
    isTargetOnlyVisible: !!isTargetOnlyVisible,
    isRegistrationVisible: isRegistrationVisible !== false, // 默认 true
    status: 'active',
    registrationCount: 0,
    createdAt: now,
    updatedAt: now
  }

  const result = await activitiesCollection.add({ data: activityData })

  return success({
    activityId: result._id,
    activity: activityData
  }, '活动创建成功')
}

/**
 * 活动列表（分页）
 */
async function listActivities(params) {
  const { page = 1, pageSize = 20, status } = params

  const where = {}

  if (status && status !== 'all') {
    where.status = status
  }

  const countResult = await activitiesCollection.where(where).count()
  const total = countResult.total || 0

  const skip = (page - 1) * pageSize
  const listResult = await activitiesCollection
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const list = listResult.data || []

  return success({
    list,
    total,
    page,
    pageSize,
    hasMore: skip + list.length < total
  })
}

/**
 * 活动详情（含当前用户报名状态）
 */
async function getActivity(openid, activityId) {
  const result = await activitiesCollection.doc(activityId).get()
  if (!result.data) {
    return fail('活动不存在', 404)
  }

  const activity = result.data

  // 查询当前用户是否已报名
  const regResult = await registrationsCollection
    .where({ activityId, openid })
    .limit(1)
    .get()

  const myRegistration = regResult.data.length > 0 ? regResult.data[0] : null

  // 查询报名列表（如果可见）
  let registrationList = []
  let groupStats = []

  if (activity.isRegistrationVisible) {
    const allRegs = await registrationsCollection
      .where({ activityId })
      .orderBy('createdAt', 'asc')
      .get()

    registrationList = allRegs.data || []

    // 如果是分组活动，统计各组人数
    if (activity.isGroupedActivity && activity.groups && activity.groups.length > 0) {
      groupStats = activity.groups.map(g => ({
        name: g.name,
        count: registrationList.filter(r => r.groupName === g.name).length
      }))
    }
  }

  // 计算剩余名额
  let remainingSlots = null
  if (activity.isMaxRegistrationsEnabled && activity.maxRegistrations) {
    remainingSlots = Math.max(0, activity.maxRegistrations - activity.registrationCount)
  }

  return success({
    ...activity,
    myRegistration,
    isRegistered: !!myRegistration,
    registrationList: activity.isRegistrationVisible ? registrationList : [],
    groupStats,
    remainingSlots,
    registrationCount: activity.registrationCount || 0
  })
}

/**
 * 报名参与
 */
async function registerActivity(openid, data) {
  const { activityId, groupName } = data

  if (!activityId) {
    return fail('缺少活动ID', 400)
  }

  // 查询活动
  const actResult = await activitiesCollection.doc(activityId).get()
  if (!actResult.data) {
    return fail('活动不存在', 404)
  }

  const activity = actResult.data

  if (activity.status !== 'active') {
    return fail('活动已结束，无法报名', 400)
  }

  // ★ 目标用户资格检查（后端双保险）
  if (activity.isTargetRoleEnabled) {
    const isTarget = await isUserTarget(openid, activity)
    if (!isTarget) {
      const roleNames = (activity.targetRoles || []).join('、')
      return fail(`该活动仅面向「${roleNames}」开放，您暂无报名资格`, 403)
    }
  }

  // 检查是否已报名
  const existReg = await registrationsCollection
    .where({ activityId, openid })
    .limit(1)
    .get()

  if (existReg.data && existReg.data.length > 0) {
    return fail('您已经报过名了', 400)
  }

  // 分组活动：检查是否传了分组名
  if (activity.isGroupedActivity && !groupName) {
    return fail('请选择一个分组进行报名', 400)
  }

  // 非分组活动不应传分组名
  if (!activity.isGroupedActivity && groupName) {
    return fail('此活动不是分组活动', 400)
  }

  // 检查人数上限
  if (activity.isMaxRegistrationsEnabled && activity.maxRegistrations) {
    if (activity.registrationCount >= activity.maxRegistrations) {
      return fail('报名人数已达上限', 400)
    }
  }

  // 获取用户信息
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  const userName = userResult.data && userResult.data.length > 0 ? userResult.data[0].name : '未知用户'

  const now = Date.now()

  // 创建报名记录
  await registrationsCollection.add({
    data: {
      activityId,
      openid,
      name: userName,
      groupName: groupName || null,
      createdAt: now
    }
  })

  // 更新活动报名计数
  await activitiesCollection.doc(activityId).update({
    data: {
      registrationCount: _.inc(1),
      updatedAt: now
    }
  })

  return success(null, '报名成功')
}

/**
 * 取消报名
 */
async function cancelRegistration(openid, activityId) {
  if (!activityId) {
    return fail('缺少活动ID', 400)
  }

  // 查找报名记录
  const regResult = await registrationsCollection
    .where({ activityId, openid })
    .limit(1)
    .get()

  if (!regResult.data || regResult.data.length === 0) {
    return fail('未找到报名记录', 404)
  }

  // 删除报名记录
  await registrationsCollection.doc(regResult.data[0]._id).remove()

  // 更新活动报名计数
  const now = Date.now()
  await activitiesCollection.doc(activityId).update({
    data: {
      registrationCount: _.inc(-1),
      updatedAt: now
    }
  })

  return success(null, '已取消报名')
}

/**
 * 删除活动
 */
async function deleteActivity(openid, activityId) {
  const result = await activitiesCollection.doc(activityId).get()
  if (!result.data) {
    return fail('活动不存在', 404)
  }

  const activity = result.data

  // 只有创建者和管理员可删除
  if (activity.creatorOpenid !== openid) {
    const userResult = await usersCollection.where({ openid }).limit(1).get()
    if (!userResult.data || userResult.data.length === 0 || !userResult.data[0].isAdmin) {
      return fail('只有发布者或管理员才能删除活动', 403)
    }
  }

  // 删除活动
  await activitiesCollection.doc(activityId).remove()

  // 删除关联的报名记录
  const regs = await registrationsCollection.where({ activityId }).get()
  if (regs.data && regs.data.length > 0) {
    for (const reg of regs.data) {
      await registrationsCollection.doc(reg._id).remove()
    }
  }

  return success(null, '已删除')
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const action = event && event.action

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  try {
    if (action === 'create') {
      const data = event.data || {}
      return await createActivity(openid, data)
    }

    if (action === 'list') {
      const params = event.params || {}
      return await listActivities(params)
    }

    if (action === 'get') {
      const activityId = event.activityId
      if (!activityId) { return fail('缺少活动ID', 400) }
      return await getActivity(openid, activityId)
    }

    if (action === 'register') {
      const data = event.data || {}
      return await registerActivity(openid, data)
    }

    if (action === 'cancelRegistration') {
      const activityId = event.activityId
      if (!activityId) { return fail('缺少活动ID', 400) }
      return await cancelRegistration(openid, activityId)
    }

    if (action === 'delete') {
      const activityId = event.activityId
      if (!activityId) { return fail('缺少活动ID', 400) }
      return await deleteActivity(openid, activityId)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    console.error('activityManager error:', error)
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
