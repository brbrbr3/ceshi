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
 * 权限检查：仅已审批用户可操作（用于只读查询）
 */
async function assertApproved(openid) {
  const userResult = await usersCollection
    .where({ openid, status: 'approved' })
    .limit(1)
    .get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户未授权，请先完成审批')
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
 * 获取报备配置
 * 返回：
 * - livingAreas: 居住区域列表（来自 sys_config REPAIR_LIVING_AREAS）
 * - areaManagerGroups: [{ area, managers: [user...] }] 按居住区域分组的片长
 * - leaderNotifierGroups: [{ leader, notifiers: [user...] }] 按馆领导分组的报备人
 * - deptNotifierGroups: [{ department, heads: [user...], extraNotifiers: [user...] }] 按部门分组的报备配置
 * - allUsers: 所有已审批用户（含 areaManagerOf/reportNotifiers/deptExtraNotifierOf/deptHeadNotifyDisabled，用于添加弹窗过滤）
 */
async function getReportConfig(openid) {
  await assertApproved(openid)

  // 获取居住区域列表
  const areaConfigRes = await sysConfigCollection.where({ key: 'REPAIR_LIVING_AREAS' }).limit(1).get()
  const livingAreas = (areaConfigRes.data && areaConfigRes.data.length > 0) ? areaConfigRes.data[0].value : []

  // 获取部门列表
  const deptConfigRes = await sysConfigCollection.where({ key: 'DEPARTMENT_OPTIONS' }).limit(1).get()
  const departmentOptions = (deptConfigRes.data && deptConfigRes.data.length > 0) ? deptConfigRes.data[0].value : []

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
    deptExtraNotifierOf: Array.isArray(u.deptExtraNotifierOf) ? u.deptExtraNotifierOf : [],
    deptHeadNotifyDisabled: !!u.deptHeadNotifyDisabled,
    avatarText: u.avatarText || (u.name ? u.name.slice(0, 1) : '智')
  }))

  // 片长分组：按居住区域顺序分组
  const areaManagerGroups = livingAreas.map(area => {
    const managers = users.filter(u => u.areaManagerOf.includes(area))
    return { area, managers }
  })

  // 馆领导报备接收人分组：列出所有馆领导
  const leaders = users.filter(u => u.role === '馆领导')
  const leaderNotifierGroups = leaders.map(leader => {
    const notifiers = users.filter(u => leader.reportNotifiers.includes(u.openid))
    return { leader, notifiers }
  })

  // 部门报备配置分组：按部门列表分组，每组含负责人（只读，可暂停/恢复）和额外报备接收人（可增删）
  const deptNotifierGroups = departmentOptions.map(dept => {
    const heads = users.filter(u => u.isDepartmentHead && u.department === dept)
    const extraNotifiers = users.filter(u => u.deptExtraNotifierOf.includes(dept))
    return { department: dept, heads, extraNotifiers }
  })

  return success({ livingAreas, areaManagerGroups, leaderNotifierGroups, deptNotifierGroups, allUsers: users }, '获取成功')
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

  return success({ targetOpenid, area }, '片长配置成功')
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
 * 设置馆领导报备接收人：为某馆领导添加报备人
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

  const now = Date.now()
  await usersCollection.doc(leader._id).update({
    data: { reportNotifiers: _.push(notifierOpenid), updatedAt: now }
  })

  // 同步更新被指定报备人的 updatedAt，确保 checkRegistration 版本比对能感知变化
  await usersCollection.doc(notifierResult.data[0]._id).update({
    data: { updatedAt: now }
  })

  return success({ leaderOpenid, notifierOpenid }, '报备人设置成功')
}

/**
 * 移除馆领导报备接收人
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

  const now = Date.now()
  await usersCollection.doc(leader._id).update({
    data: { reportNotifiers: _.pull(notifierOpenid), updatedAt: now }
  })

  // 同步更新被移除报备人的 updatedAt，确保 checkRegistration 版本比对能感知变化
  const notifierDoc = await usersCollection.where({ openid: notifierOpenid }).limit(1).get()
  if (notifierDoc.data && notifierDoc.data.length > 0) {
    await usersCollection.doc(notifierDoc.data[0]._id).update({
      data: { updatedAt: now }
    })
  }

  return success({ leaderOpenid, notifierOpenid }, '报备人移除成功')
}

/**
 * 设置部门额外报备接收人：为某用户添加某部门的额外报备接收人身份
 */
async function setDeptExtraNotifier(openid, targetOpenid, department) {
  await assertAdmin(openid)
  if (!targetOpenid) throw new Error('缺少目标用户标识')
  if (!department) throw new Error('缺少部门名称')

  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }
  const target = targetResult.data[0]
  const currentDepts = Array.isArray(target.deptExtraNotifierOf) ? target.deptExtraNotifierOf : []

  if (currentDepts.includes(department)) {
    throw new Error('该用户已是此部门的额外报备接收人')
  }

  await ensureArrayField(target, 'deptExtraNotifierOf')

  await usersCollection.doc(target._id).update({
    data: { deptExtraNotifierOf: _.push(department), updatedAt: Date.now() }
  })

  return success({ targetOpenid, department }, '部门额外报备接收人设置成功')
}

/**
 * 移除部门额外报备接收人
 */
async function removeDeptExtraNotifier(openid, targetOpenid, department) {
  await assertAdmin(openid)
  if (!targetOpenid) throw new Error('缺少目标用户标识')
  if (!department) throw new Error('缺少部门名称')

  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }
  const target = targetResult.data[0]
  const currentDepts = Array.isArray(target.deptExtraNotifierOf) ? target.deptExtraNotifierOf : []

  if (!currentDepts.includes(department)) {
    throw new Error('该用户不是此部门的额外报备接收人')
  }

  await ensureArrayField(target, 'deptExtraNotifierOf')

  await usersCollection.doc(target._id).update({
    data: { deptExtraNotifierOf: _.pull(department), updatedAt: Date.now() }
  })

  return success({ targetOpenid, department }, '部门额外报备接收人移除成功')
}

/**
 * 切换部门负责人报备推送开关（暂停/恢复接收本部门报备推送）
 * 仅对 isDepartmentHead=true 的用户有效
 */
async function toggleDeptHeadNotify(openid, targetOpenid) {
  await assertAdmin(openid)
  if (!targetOpenid) throw new Error('缺少目标用户标识')

  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }
  const target = targetResult.data[0]

  if (!target.isDepartmentHead) {
    throw new Error('目标用户不是部门负责人')
  }

  const newStatus = !target.deptHeadNotifyDisabled
  await usersCollection.doc(target._id).update({
    data: { deptHeadNotifyDisabled: newStatus, updatedAt: Date.now() }
  })

  return success({ targetOpenid, deptHeadNotifyDisabled: newStatus }, newStatus ? '已暂停接收报备推送' : '已恢复接收报备推送')
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

    if (action === 'setDeptExtraNotifier') {
      return await setDeptExtraNotifier(openid, event.targetOpenid, event.department)
    }

    if (action === 'removeDeptExtraNotifier') {
      return await removeDeptExtraNotifier(openid, event.targetOpenid, event.department)
    }

    if (action === 'toggleDeptHeadNotify') {
      return await toggleDeptHeadNotify(openid, event.targetOpenid)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    return fail(error.message || '服务异常', 500)
  }
}
