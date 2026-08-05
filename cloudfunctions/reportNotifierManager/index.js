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
 * 获取报备配置（新字段：isAreaManager / reportTo）
 * 返回：
 * - livingAreas: 居住区域列表（来自 sys_config REPAIR_LIVING_AREAS）
 * - areaManagerGroups: [{ area, managers: [user...] }] 按居住区域分组的片长（isAreaManager + livingArea 匹配）
 * - leaderNotifierGroups: [{ leader, notifiers: [user...] }] 按馆领导分组的报备人（reportTo 反查）
 * - deptNotifierGroups: [{ department, heads: [user...], extraNotifiers: [user...] }] 按部门分组的报备配置
 * - allUsers: 所有已审批用户（含 isAreaManager/reportTo/deptHeadNotifyDisabled，用于添加弹窗过滤）
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
    isAreaManager: !!u.isAreaManager,
    reportTo: Array.isArray(u.reportTo) ? u.reportTo : [],
    deptHeadNotifyDisabled: !!u.deptHeadNotifyDisabled,
    avatarText: u.avatarText || (u.name ? u.name.slice(0, 1) : '智')
  }))

  // 片长分组：按居住区域分组，片长由 isAreaManager + livingArea 决定
  const areaManagerGroups = livingAreas.map(area => {
    const managers = users.filter(u => u.isAreaManager && u.livingArea === area)
    return { area, managers }
  })

  // 馆领导报备接收人分组：通过报备人的 reportTo 反查（谁的 reportTo 含该领导）
  const leaders = users.filter(u => u.role === '馆领导')
  const leaderNotifierGroups = leaders.map(leader => {
    const notifiers = users.filter(u => u.reportTo.includes(leader.openid))
    return { leader, notifiers }
  })

  // 部门报备配置分组：按部门列表分组，每组含负责人（只读，可暂停/恢复）和额外报备接收人（可增删）
  // 额外报备接收人：从部门成员的 reportTo 反推（排除部门负责人）
  const deptNotifierGroups = departmentOptions.map(dept => {
    const heads = users.filter(u => u.isDepartmentHead && u.department === dept)
    // 收集该部门所有成员的 reportTo 中出现过的 openid，排除负责人即为额外报备接收人
    const deptMembers = users.filter(u => u.department === dept)
    const headOpenidSet = new Set(heads.map(h => h.openid))
    const extraOpenidSet = new Set()
    deptMembers.forEach(member => {
      (member.reportTo || []).forEach(oid => {
        if (!headOpenidSet.has(oid)) extraOpenidSet.add(oid)
      })
    })
    const extraNotifiers = users.filter(u => extraOpenidSet.has(u.openid))
    return { department: dept, heads, extraNotifiers }
  })

  return success({ livingAreas, areaManagerGroups, leaderNotifierGroups, deptNotifierGroups, allUsers: users }, '获取成功')
}

/**
 * 设置片长：将目标用户设为指定居住区域的片长
 * 新逻辑：isAreaManager = true，livingArea = area（片长管自己居住区域）
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

  if (target.isAreaManager && target.livingArea === area) {
    throw new Error('该用户已是该区域片长')
  }

  await usersCollection.doc(target._id).update({
    data: { isAreaManager: true, livingArea: area, updatedAt: Date.now() }
  })

  return success({ targetOpenid, area }, '片长配置成功')
}

/**
 * 移除片长：取消目标用户的片长身份
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

  if (!target.isAreaManager || target.livingArea !== area) {
    throw new Error('该用户不是该区域片长')
  }

  await usersCollection.doc(target._id).update({
    data: { isAreaManager: false, updatedAt: Date.now() }
  })

  return success({ targetOpenid, area }, '片长移除成功')
}

/**
 * 设置馆领导报备接收人：将报备人的 reportTo 中加入该馆领导
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
  const notifier = notifierResult.data[0]
  const currentReportTo = Array.isArray(notifier.reportTo) ? notifier.reportTo : []

  if (currentReportTo.includes(leaderOpenid)) {
    throw new Error('该用户已是此馆领导的报备人')
  }

  const now = Date.now()
  await usersCollection.doc(notifier._id).update({
    data: { reportTo: [...currentReportTo, leaderOpenid], updatedAt: now }
  })

  return success({ leaderOpenid, notifierOpenid }, '报备人设置成功')
}

/**
 * 移除馆领导报备接收人：从报备人的 reportTo 中移除该馆领导
 */
async function removeLeaderNotifier(openid, leaderOpenid, notifierOpenid) {
  await assertAdmin(openid)
  if (!leaderOpenid) throw new Error('缺少馆领导标识')
  if (!notifierOpenid) throw new Error('缺少报备人标识')

  // 校验馆领导存在
  const leaderResult = await usersCollection.where({ openid: leaderOpenid }).limit(1).get()
  if (!leaderResult.data || leaderResult.data.length === 0) {
    throw new Error('馆领导用户不存在')
  }

  // 校验报备人存在
  const notifierResult = await usersCollection.where({ openid: notifierOpenid }).limit(1).get()
  if (!notifierResult.data || notifierResult.data.length === 0) {
    throw new Error('报备人用户不存在')
  }
  const notifier = notifierResult.data[0]
  const currentReportTo = Array.isArray(notifier.reportTo) ? notifier.reportTo : []

  if (!currentReportTo.includes(leaderOpenid)) {
    throw new Error('该用户不是此馆领导的报备人')
  }

  const now = Date.now()
  await usersCollection.doc(notifier._id).update({
    data: { reportTo: currentReportTo.filter(o => o !== leaderOpenid), updatedAt: now }
  })

  return success({ leaderOpenid, notifierOpenid }, '报备人移除成功')
}

/**
 * 设置部门额外报备接收人：将该用户 openid 批量加入该部门所有成员的 reportTo
 * 注意：大部门场景下可能涉及较多写入，云函数需关注超时
 */
async function setDeptExtraNotifier(openid, targetOpenid, department) {
  await assertAdmin(openid)
  if (!targetOpenid) throw new Error('缺少目标用户标识')
  if (!department) throw new Error('缺少部门名称')

  // 校验目标用户存在
  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }

  // 校验未重复：检查是否已有该部门成员的 reportTo 含 targetOpenid
  const existingCheck = await usersCollection
    .where({ status: 'approved', department, reportTo: targetOpenid })
    .limit(1)
    .get()
  if (existingCheck.data && existingCheck.data.length > 0) {
    throw new Error('该用户已是此部门的额外报备接收人')
  }

  // 查询该部门所有已审批用户（排除目标用户本人和部门负责人）
  const deptUsersRes = await usersCollection
    .where({ status: 'approved', department, isDepartmentHead: _.neq(true) })
    .field({ openid: true, reportTo: true })
    .get()
  const deptUsers = (deptUsersRes.data || []).filter(u => u.openid !== targetOpenid)
  const now = Date.now()

  // 批量更新：为每个部门成员追加 targetOpenid 到 reportTo
  let updatedCount = 0
  for (const user of deptUsers) {
    const existingRt = Array.isArray(user.reportTo) ? user.reportTo : []
    if (!existingRt.includes(targetOpenid)) {
      try {
        await usersCollection.where({ openid: user.openid }).update({
          data: { reportTo: [...existingRt, targetOpenid], updatedAt: now }
        })
        updatedCount++
      } catch (e) {
        console.warn(`更新用户 ${user.openid} 的 reportTo 失败:`, e.message)
      }
    }
  }

  return success({ targetOpenid, department, updatedCount }, `已为 ${updatedCount} 名部门成员配置报备接收人`)
}

/**
 * 移除部门额外报备接收人：将该用户 openid 从该部门所有成员的 reportTo 中批量移除
 */
async function removeDeptExtraNotifier(openid, targetOpenid, department) {
  await assertAdmin(openid)
  if (!targetOpenid) throw new Error('缺少目标用户标识')
  if (!department) throw new Error('缺少部门名称')

  // 校验目标用户存在
  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }

  // 查询该部门所有含 targetOpenid 的成员
  const deptUsersRes = await usersCollection
    .where({ status: 'approved', department, reportTo: targetOpenid })
    .field({ openid: true, reportTo: true })
    .get()
  const deptUsers = deptUsersRes.data || []

  if (deptUsers.length === 0) {
    throw new Error('该用户不是此部门的额外报备接收人')
  }

  const now = Date.now()
  let updatedCount = 0

  for (const user of deptUsers) {
    const existingRt = Array.isArray(user.reportTo) ? user.reportTo : []
    const newRt = existingRt.filter(o => o !== targetOpenid)
    try {
      await usersCollection.where({ openid: user.openid }).update({
        data: { reportTo: newRt, updatedAt: now }
      })
      updatedCount++
    } catch (e) {
      console.warn(`更新用户 ${user.openid} 的 reportTo 失败:`, e.message)
    }
  }

  return success({ targetOpenid, department, updatedCount }, `已从 ${updatedCount} 名部门成员移除报备接收人`)
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
