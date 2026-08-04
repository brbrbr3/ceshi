// 人员配置管理云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('office_users')

function success(data, msg) { return { code: 0, message: msg || 'ok', data: data || {} } }
function fail(msg, code) { return { code: code || 500, message: msg || 'error', data: null } }

/**
 * 支持的 action:
 * - getAllPersonnel: 获取全部已批准用户及其配置
 * - updatePersonnel: 更新单个用户的配置
 */
exports.main = async (event, context) => {
  const { action, params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 权限校验：管理员/领导/部门负责人/片长/有报备人 → 可查看；仅管理员可编辑
  if (openid) {
    const userRes = await usersCollection.where({ openid, status: 'approved' }).limit(1).get()
    if (!userRes.data || !userRes.data.length) return fail('用户不存在', 403)
    const u = userRes.data[0]

    const isAdmin = u.isAdmin
    const isLeader = u.role === '馆员' && u.department === '无'
    const isDeptHead = u.isDepartmentHead
    const isAreaManager = !!u.isAreaManager

    let hasReporters = false
    if (!isAdmin && !isLeader && !isDeptHead && !isAreaManager) {
      const cntRes = await usersCollection.where({ reportTo: openid, status: 'approved' }).count()
      hasReporters = cntRes.total > 0
    }

    const canRead = isAdmin || isLeader || isDeptHead || isAreaManager || hasReporters
    if (!canRead) return fail('无权查看人员配置', 403)

    // 写入操作仅管理员
    if (action !== 'getAllPersonnel' && !isAdmin) {
      return fail('仅管理员可编辑', 403)
    }
  }

  try {
    switch (action) {
      case 'getAllPersonnel': return await getAllPersonnel()
      case 'updatePersonnel': return await updatePersonnel(params)
      case 'updateBatchReportTo': return await updateBatchReportTo(params)
      case 'migrateData': return await migrateData()
      default: return fail('未知操作', 400)
    }
  } catch (error) {
    console.error('人员配置操作失败:', error)
    return fail(error.message)
  }
}

/**
 * 获取全部已批准用户及其配置
 */
async function getAllPersonnel() {
  const res = await usersCollection
    .where({ status: 'approved' })
    .field({
      _id: true,
      openid: true,
      name: true,
      role: true,
      department: true,
      isDepartmentHead: true,
      position: true,
      livingArea: true,
      isAreaManager: true,
      reportTo: true,
      avatarUrl: true
    })
    .limit(200)
    .get()

  return success({ users: res.data || [] })
}

/**
 * 更新单个用户的配置
 * @param {Object} params
 * @param {string} params.targetOpenid - 目标用户 openid
 * @param {Object} params.updates - 需要更新的字段
 */
async function updatePersonnel(params) {
  // 兼容两种传参结构：{targetOpenid, updates:{...}} 或 {targetOpenid, ...fields}
  const { targetOpenid, updates: nestedUpdates } = params
  const updates = nestedUpdates || params
  if (!targetOpenid) return fail('缺少目标用户', 400)

  // 只允许更新许可的字段
  const allowedFields = [
    'role', 'department', 'isDepartmentHead', 'position',
    'livingArea', 'isAreaManager', 'reportTo'
  ]
  const data = {}
  for (const key of allowedFields) {
    if (key in updates) data[key] = updates[key]
  }
  if (Object.keys(data).length === 0) return fail('无有效更新字段', 400)

  data.updatedAt = Date.now()
  await usersCollection.where({ openid: targetOpenid }).update({ data })

  return success(null, '更新成功')
}

/**
 * 批量更新其他用户的 reportTo（"谁向该用户报备"）
 * @param {Object} params
 * @param {string} params.currentOpenid - 当前编辑的用户
 * @param {string[]} params.additions - 需要将 currentOpenid 加入 reportTo 的用户
 * @param {string[]} params.removals - 需要将 currentOpenid 从 reportTo 移除的用户
 */
async function updateBatchReportTo(params) {
  const { currentOpenid, additions = [], removals = [] } = params
  if (!currentOpenid) return fail('缺少目标用户', 400)
  const now = Date.now()

  // 将 currentOpenid 加入指定用户的 reportTo
  for (const openid of additions) {
    try {
      const res = await usersCollection.where({ openid }).limit(1).get()
      if (res.data && res.data.length > 0) {
        const existing = Array.isArray(res.data[0].reportTo) ? res.data[0].reportTo : []
        if (!existing.includes(currentOpenid)) {
          await usersCollection.where({ openid }).update({
            data: { reportTo: [...existing, currentOpenid], updatedAt: now }
          })
        }
      }
    } catch (e) {
      console.warn('batchReportTo 添加失败:', openid, e)
    }
  }

  // 将 currentOpenid 从指定用户的 reportTo 移除
  for (const openid of removals) {
    try {
      const res = await usersCollection.where({ openid }).limit(1).get()
      if (res.data && res.data.length > 0) {
        const existing = Array.isArray(res.data[0].reportTo) ? res.data[0].reportTo : []
        const filtered = existing.filter(o => o !== currentOpenid)
        if (filtered.length !== existing.length) {
          await usersCollection.where({ openid }).update({
            data: { reportTo: filtered, updatedAt: now }
          })
        }
      }
    } catch (e) {
      console.warn('batchReportTo 移除失败:', openid, e)
    }
  }

  return success(null, '批量更新成功')
}

/**
 * 数据迁移：将旧字段映射到新字段
 * 旧字段: areaManagerOf[], deptExtraNotifierOf[], reportNotifiers[], isLeaderNotifier
 * 新字段: isAreaManager, reportTo[]
 */
async function migrateData() {
  const allUsers = await usersCollection.where({ status: 'approved' }).get()
  const users = allUsers.data || []
  const stats = { total: users.length, migrated: 0, errors: [] }

  // 构建 openid→user 映射
  const userMap = {}
  users.forEach(u => { userMap[u.openid] = u })

  for (const user of users) {
    try {
      const updates = {}
      const now = Date.now()

      // 1. areaManagerOf → isAreaManager
      const oldAreas = Array.isArray(user.areaManagerOf) ? user.areaManagerOf : []
      if (oldAreas.length > 0) {
        updates.isAreaManager = true
      }

      // 2. reportNotifiers → reportTo
      const oldReportNotifiers = Array.isArray(user.reportNotifiers) ? user.reportNotifiers : []
      if (oldReportNotifiers.length > 0) {
        // deduplicate
        updates.reportTo = [...new Set(oldReportNotifiers)]
      }

      // 3. isLeaderNotifier → 将此人添加到各领导（部门空+馆员）的 reportTo 中
      if (user.isLeaderNotifier) {
        users.forEach(leader => {
          if (leader.openid === user.openid) return
          if (leader.role === '馆员' && leader.department === '无') {
            const existingRt = Array.isArray(leader.reportTo) ? leader.reportTo : []
            if (!existingRt.includes(user.openid)) {
              const newRt = [...new Set([...existingRt, user.openid])]
              usersCollection.where({ openid: leader.openid }).update({
                data: { reportTo: newRt, updatedAt: now }
              }).catch(e => stats.errors.push({ user: leader.openid, error: e.message }))
            }
          }
        })
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = now
        // 如果已有 reportTo 字段，不清空
        const existingRt = Array.isArray(user.reportTo) ? user.reportTo : []
        if (existingRt.length > 0) updates.reportTo = existingRt

        await usersCollection.where({ openid: user.openid }).update({ data: updates })
        stats.migrated++
      }
    } catch (e) {
      stats.errors.push({ user: user.openid, error: e.message })
    }
  }

  return success(stats, `迁移完成: ${stats.migrated}/${stats.total}`)
}
