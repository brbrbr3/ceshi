const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('office_users')
const permissionsCollection = db.collection('permissions')

function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 权限检查：通过 permissionManager 的逻辑检查 manage_positions 权限
 */
async function checkPermission(openid) {
  const userResult = await usersCollection.where({ openid, status: 'approved' }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在或未审批')
  }
  const user = userResult.data[0]

  // 管理员自动拥有所有权限
  if (user.isAdmin) return user

  // 查询权限配置
  const permResult = await permissionsCollection.where({ featureKey: 'manage_positions' }).limit(1).get()
  if (!permResult.data || permResult.data.length === 0) {
    throw new Error('权限配置不存在')
  }
  const permission = permResult.data[0]

  // 检查角色权限
  if (permission.enabledRoles.includes(user.role)) return user

  // 检查特殊条件
  const specialConditions = permission.specialConditions || []
  const specialPassed = specialConditions.some(cond => {
    if (user.role !== cond.role) return false
    if (cond.position && Array.isArray(user.position) && user.position.includes(cond.position)) return true
    if (cond.department && user.department === cond.department) return true
    return false
  })

  if (!specialPassed) {
    throw new Error('您没有岗位配置权限')
  }
  return user
}

/**
 * 为用户分配岗位
 */
async function assignPosition(openid, targetOpenid, position) {
  if (!targetOpenid) throw new Error('缺少目标用户标识')
  if (!position) throw new Error('缺少岗位信息')

  await checkPermission(openid)

  // 获取目标用户
  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }

  const targetUser = targetResult.data[0]
  const currentPositions = Array.isArray(targetUser.position) ? targetUser.position : (targetUser.position ? [targetUser.position] : [])

  // 检查是否已有该岗位
  if (currentPositions.includes(position)) {
    throw new Error('该用户已有此岗位')
  }

  // 验证岗位是否在 POSITION_OPTIONS 中
  const sysConfigResult = await db.collection('sys_config').where({ key: 'POSITION_OPTIONS' }).limit(1).get()
  const positionOptions = (sysConfigResult.data && sysConfigResult.data.length > 0) ? sysConfigResult.data[0].value : []
  if (!positionOptions.includes(position)) {
    throw new Error('无效的岗位')
  }

  // 如果 position 字段是字符串，先转为数组（兼容历史数据）
  if (!Array.isArray(targetUser.position)) {
    await usersCollection.doc(targetUser._id).update({
      data: {
        position: targetUser.position ? [targetUser.position] : [],
        updatedAt: Date.now()
      }
    })
  }

  // 使用 _.push 添加岗位
  await usersCollection.doc(targetUser._id).update({
    data: {
      position: _.push(position),
      updatedAt: Date.now()
    }
  })

  return success({ targetOpenid, position }, '岗位分配成功')
}

/**
 * 移除用户岗位
 */
async function removePosition(openid, targetOpenid, position) {
  if (!targetOpenid) throw new Error('缺少目标用户标识')
  if (!position) throw new Error('缺少岗位信息')

  await checkPermission(openid)

  // 获取目标用户
  const targetResult = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetResult.data || targetResult.data.length === 0) {
    throw new Error('目标用户不存在')
  }

  const targetUser = targetResult.data[0]
  const currentPositions = Array.isArray(targetUser.position) ? targetUser.position : (targetUser.position ? [targetUser.position] : [])

  // 检查是否有该岗位
  if (!currentPositions.includes(position)) {
    throw new Error('该用户没有此岗位')
  }

  // 如果 position 字段是字符串，先转为数组（兼容历史数据）
  if (!Array.isArray(targetUser.position)) {
    await usersCollection.doc(targetUser._id).update({
      data: {
        position: targetUser.position ? [targetUser.position] : [],
        updatedAt: Date.now()
      }
    })
  }

  // 使用 _.pull 移除岗位
  await usersCollection.doc(targetUser._id).update({
    data: {
      position: _.pull(position),
      updatedAt: Date.now()
    }
  })

  return success({ targetOpenid, position }, '岗位移除成功')
}

/**
 * 获取岗位配置数据
 */
async function getPositionConfig(openid) {
  // 只需检查用户已审批通过，不需要完整权限校验
  const userResult = await usersCollection.where({ openid, status: 'approved' }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在或未审批')
  }

  // 获取岗位选项
  const sysConfigResult = await db.collection('sys_config').where({ key: 'POSITION_OPTIONS' }).limit(1).get()
  const positionOptions = (sysConfigResult.data && sysConfigResult.data.length > 0) ? sysConfigResult.data[0].value : []

  // 获取所有已审批用户
  const usersResult = await usersCollection.where({ status: 'approved' }).limit(1000).get()
  const users = (usersResult.data || []).map(u => ({
    openid: u.openid,
    name: u.name,
    role: u.role,
    department: u.department || '',
    position: Array.isArray(u.position) ? u.position : (u.position ? [u.position] : []),
    avatarText: u.avatarText || (u.name ? u.name.slice(0, 1) : '智')
  }))

  // 按岗位分组
  const positionGroups = positionOptions.map(position => {
    const positionUsers = users.filter(u => u.position.includes(position))
    return { position, users: positionUsers }
  })

  return success({ positionGroups, allUsers: users }, '获取成功')
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取微信身份失败', 401)
  }

  try {
    const { action } = event

    if (action === 'assignPosition') {
      return await assignPosition(openid, event.targetOpenid, event.position)
    }

    if (action === 'removePosition') {
      return await removePosition(openid, event.targetOpenid, event.position)
    }

    if (action === 'getPositionConfig') {
      return await getPositionConfig(openid)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    return fail(error.message || '服务异常', 500)
  }
}
