// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('office_users')
const sysConfigCollection = db.collection('sys_config')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 权限检查：仅管理员可操作
 */
async function assertAdmin(openid) {
  const userResult = await usersCollection
    .where({ openid, status: 'approved', isAdmin: true })
    .limit(1)
    .get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('仅管理员可执行此操作')
  }
  return userResult.data[0]
}

/**
 * 兼容历史数据：确保字段为数组
 */
async function ensureArrayField(target, field) {
  if (Array.isArray(target[field])) return
  const existing = target[field]
  await usersCollection.doc(target._id).update({
    data: {
      [field]: existing ? [existing] : [],
      updatedAt: Date.now()
    }
  })
}

/**
 * 获取报备配置配置
 * 返回：
 * - livingAreas: 居住区域列表（来自 sys_config REPAIR_LIVING_AREAS）
 * - areaManagerGroups: [{ area, managers: [user...] }] 按居住区域分组的片长
 * - leaderNotifierGroups: [{ leader, notifiers: [user...] }] 按馆领导分组的报备人
 * - allUsers: 所有已审批用户（含 areaManagerOf/reportNotifiers，用于添加弹窗过滤）
 */
async function getReportConfig(openid) {
  await assertAdmin(openid)

  // 获取居住区域列表
  const areaConfigRes = await sysConfigCollection.where({ key: 'REPAIR_LIVING_AREAS' }).limit(1).get()
  const livingAreas = (areaConfigRes.data && areaConfigRes.data.length > 0) ? areaConfigRes.data[0].value : []

  // 获取所有已审批用户
  const usersResult = await usersCollection.where({ status: 'approved' }).limit(1000).get()
  const users = (usersResult.data || []).map(u => ({
    openid: u.openid,
    name: u.name,
    role: u.role,
    department: u.department || '',
    livingArea: u.livingArea || '',
    isDepartmentHead: !!u.isDepartmentHead,
    areaManagerOf: Array.isArray(u.areaManagerOf) ? u.areaManagerOf : [],
    reportNotifiers: Array.isArray(u.reportNotifiers) ? u.reportNotifiers : [],
    avatarText: u.avatarText || (u.name ? u.name.slice(0, 1) : '智')
  }))

  // 片长分组：按居住区域顺序分组
  const areaManagerGroups = livingAreas.map(area => {
    const managers = users.filter(u => u.areaManagerOf.includes(area))
    return { area, managers }
  })

  // 馆领导报备人分组：列出所有馆领导
  const leaders = users.filter(u => u.role === '馆领导')
  const leaderNotifierGroups = leaders.map(leader => {
    const notifiers = users.filter(u => leader.reportNotifiers.includes(u.openid))
    return { leader, notifiers }
  })

  return success({ livingAreas, areaManagerGroups, leaderNotifierGroups, allUsers: users }, '获取成功')
}

/**
 * 设置片长：为某用户添加某居住区域的片长身份
 */
async function setAreaManager(openid, targetOpenid, area) {
  await assertAdmin(openid)
  if (!targetOpenid) throw new Error('缺少目标用户标识')
  if (!area) throw new Error('缺少居住区域')

  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }
  const target = targetResult.data[0]
  const currentAreas = Array.isArray(target.areaManagerOf) ? target.areaManagerOf : []

  if (currentAreas.includes(area)) {
    throw new Error('该用户已是该区域片长')
  }

  await ensureArrayField(target, 'areaManagerOf')

  await usersCollection.doc(target._id).update({
    data: { areaManagerOf: _.push(area), updatedAt: Date.now() }
  })

  return success({ targetOpenid, area }, '片长设置成功')
}

/**
 * 移除片长
 */
async function removeAreaManager(openid, targetOpenid, area) {
  await assertAdmin(openid)
  if (!targetOpenid) throw new Error('缺少目标用户标识')
  if (!area) throw new Error('缺少居住区域')

  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }
  const target = targetResult.data[0]
  const currentAreas = Array.isArray(target.areaManagerOf) ? target.areaManagerOf : []

  if (!currentAreas.includes(area)) {
    throw new Error('该用户不是该区域片长')
  }

  await ensureArrayField(target, 'areaManagerOf')

  await usersCollection.doc(target._id).update({
    data: { areaManagerOf: _.pull(area), updatedAt: Date.now() }
  })

  return success({ targetOpenid, area }, '片长移除成功')
}

/**
 * 设置馆领导报备人：为某馆领导添加报备人
 */
async function setLeaderNotifier(openid, leaderOpenid, notifierOpenid) {
  await assertAdmin(openid)
  if (!leaderOpenid) throw new Error('缺少馆领导标识')
  if (!notifierOpenid) throw new Error('缺少报备人标识')

  // 校验目标用户是馆领导
  const leaderResult = await usersCollection.where({ openid: leaderOpenid }).limit(1).get()
  if (!leaderResult.data || leaderResult.data.length === 0) {
    throw new Error('馆领导用户不存在')
  }
  const leader = leaderResult.data[0]
  if (leader.role !== '馆领导') {
    throw new Error('目标用户不是馆领导')
  }

  // 校验报备人存在
  const notifierResult = await usersCollection.where({ openid: notifierOpenid }).limit(1).get()
  if (!notifierResult.data || notifierResult.data.length === 0) {
    throw new Error('报备人用户不存在')
  }

  const currentNotifiers = Array.isArray(leader.reportNotifiers) ? leader.reportNotifiers : []
  if (currentNotifiers.includes(notifierOpenid)) {
    throw new Error('该用户已是此馆领导的报备人')
  }

  await ensureArrayField(leader, 'reportNotifiers')

  await usersCollection.doc(leader._id).update({
    data: { reportNotifiers: _.push(notifierOpenid), updatedAt: Date.now() }
  })

  return success({ leaderOpenid, notifierOpenid }, '报备人设置成功')
}

/**
 * 移除馆领导报备人
 */
async function removeLeaderNotifier(openid, leaderOpenid, notifierOpenid) {
  await assertAdmin(openid)
  if (!leaderOpenid) throw new Error('缺少馆领导标识')
  if (!notifierOpenid) throw new Error('缺少报备人标识')

  const leaderResult = await usersCollection.where({ openid: leaderOpenid }).limit(1).get()
  if (!leaderResult.data || leaderResult.data.length === 0) {
    throw new Error('馆领导用户不存在')
  }
  const leader = leaderResult.data[0]
  const currentNotifiers = Array.isArray(leader.reportNotifiers) ? leader.reportNotifiers : []

  if (!currentNotifiers.includes(notifierOpenid)) {
    throw new Error('该用户不是此馆领导的报备人')
  }

  await ensureArrayField(leader, 'reportNotifiers')

  await usersCollection.doc(leader._id).update({
    data: { reportNotifiers: _.pull(notifierOpenid), updatedAt: Date.now() }
  })

  return success({ leaderOpenid, notifierOpenid }, '报备人移除成功')
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取微信身份失败', 401)
  }

  try {
    const { action } = event

    if (action === 'getReportConfig') {
      return await getReportConfig(openid)
    }

    if (action === 'setAreaManager') {
      return await setAreaManager(openid, event.targetOpenid, event.area)
    }

    if (action === 'removeAreaManager') {
      return await removeAreaManager(openid, event.targetOpenid, event.area)
    }

    if (action === 'setLeaderNotifier') {
      return await setLeaderNotifier(openid, event.leaderOpenid, event.notifierOpenid)
    }

    if (action === 'removeLeaderNotifier') {
      return await removeLeaderNotifier(openid, event.leaderOpenid, event.notifierOpenid)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    return fail(error.message || '服务异常', 500)
  }
}
