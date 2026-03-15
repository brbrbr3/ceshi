const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('office_users')
const permissionsCollection = db.collection('permissions')

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
 * 初始化权限配置
 * 创建默认的权限规则
 */
async function initPermissions() {
  const now = Date.now()
  
  // 定义权限配置
  const permissions = [
    {
      featureKey: 'medical_application',
      featureName: '就医申请',
      description: '提交就医申请',
      enabledRoles: ['馆领导', '部门负责人', '馆员', '工勤'],
      requireAdmin: false,
      createdAt: now,
      updatedAt: now
    },
    {
      featureKey: 'weekly_menu',
      featureName: '每周菜单',
      description: '查看每周菜单',
      enabledRoles: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],
      requireAdmin: false,
      createdAt: now,
      updatedAt: now
    },
    {
      featureKey: 'user_management',
      featureName: '用户管理',
      description: '管理系统用户',
      enabledRoles: ['馆领导', '部门负责人'],
      requireAdmin: true,
      createdAt: now,
      updatedAt: now
    },
    {
      featureKey: 'approval_management',
      featureName: '审批管理',
      description: '审批工作流任务',
      enabledRoles: ['馆领导', '部门负责人'],
      requireAdmin: false,
      createdAt: now,
      updatedAt: now
    }
  ]

  // 批量插入权限配置
  const results = []
  for (const perm of permissions) {
    try {
      // 检查是否已存在
      const existing = await permissionsCollection
        .where({ featureKey: perm.featureKey })
        .limit(1)
        .get()

      if (existing.data && existing.data.length > 0) {
        // 更新现有权限
        await permissionsCollection
          .doc(existing.data[0]._id)
          .update({
            data: { ...perm, updatedAt: now }
          })
        results.push({ action: 'updated', featureKey: perm.featureKey })
      } else {
        // 插入新权限
        await permissionsCollection.add({ data: perm })
        results.push({ action: 'created', featureKey: perm.featureKey })
      }
    } catch (error) {
      console.error(`Failed to init permission ${perm.featureKey}:`, error)
      results.push({ action: 'failed', featureKey: perm.featureKey, error: error.message })
    }
  }

  return success({ results, count: permissions.length }, '权限初始化完成')
}

/**
 * 检查用户是否有权限访问指定功能
 */
async function checkPermission(openid, featureKey) {
  try {
    // 查询用户信息
    const userResult = await usersCollection
      .where({ openid })
      .limit(1)
      .get()

    if (!userResult.data || userResult.data.length === 0) {
      return fail('用户不存在', 404)
    }

    const user = userResult.data[0]

    // 查询功能权限配置
    const permResult = await permissionsCollection
      .where({ featureKey })
      .limit(1)
      .get()

    if (!permResult.data || permResult.data.length === 0) {
      // 如果没有配置权限，默认允许访问（向后兼容）
      return success({
        allowed: true,
        user: {
          openid: user.openid,
          name: user.name,
          role: user.role,
          isAdmin: !!user.isAdmin
        },
        feature: {
          featureKey,
          message: '未配置权限规则，默认允许访问'
        }
      })
    }

    const permission = permResult.data[0]

    // 检查功能是否启用
    if (!permission.enabledRoles || permission.enabledRoles.length === 0) {
      return success({
        allowed: true,
        user: {
          openid: user.openid,
          name: user.name,
          role: user.role,
          isAdmin: !!user.isAdmin
        },
        feature: {
          featureKey: permission.featureKey,
          featureName: permission.featureName,
          message: '该功能对所有用户开放'
        }
      })
    }

    // 检查管理员权限
    if (permission.requireAdmin && !user.isAdmin) {
      return fail('需要管理员权限才能访问该功能', 403, {
        allowed: false,
        user: {
          openid: user.openid,
          name: user.name,
          role: user.role,
          isAdmin: false
        },
        feature: {
          featureKey: permission.featureKey,
          featureName: permission.featureName,
          message: `只有管理员才能访问${permission.featureName}`
        }
      })
    }

    // 检查角色权限
    if (!permission.enabledRoles.includes(user.role)) {
      return fail(`您当前的角色（${user.role}）无权访问${permission.featureName}`, 403, {
        allowed: false,
        user: {
          openid: user.openid,
          name: user.name,
          role: user.role,
          isAdmin: !!user.isAdmin
        },
        feature: {
          featureKey: permission.featureKey,
          featureName: permission.featureName,
          enabledRoles: permission.enabledRoles,
          message: `只有${permission.enabledRoles.join('、')}才能访问${permission.featureName}`
        }
      })
    }

    // 有权限
    return success({
      allowed: true,
      user: {
        openid: user.openid,
        name: user.name,
        role: user.role,
        isAdmin: !!user.isAdmin
      },
      feature: {
        featureKey: permission.featureKey,
        featureName: permission.featureName,
        enabledRoles: permission.enabledRoles
      }
    })
  } catch (error) {
    return fail(error.message || '权限检查失败', 500)
  }
}

/**
 * 批量检查多个功能的权限
 */
async function batchCheckPermissions(openid, featureKeys) {
  try {
    // 查询用户信息
    const userResult = await usersCollection
      .where({ openid })
      .limit(1)
      .get()

    if (!userResult.data || userResult.data.length === 0) {
      return fail('用户不存在', 404)
    }

    const user = userResult.data[0]

    // 批量查询权限配置
    const permResult = await permissionsCollection
      .where({
        featureKey: _.in(featureKeys)
      })
      .get()

    const permissionsMap = {}
    if (permResult.data) {
      permResult.data.forEach(perm => {
        permissionsMap[perm.featureKey] = perm
      })
    }

    // 检查每个功能的权限
    const results = {}
    for (const featureKey of featureKeys) {
      const permission = permissionsMap[featureKey]

      if (!permission) {
        // 未配置权限，默认允许
        results[featureKey] = {
          allowed: true,
          featureKey,
          message: '未配置权限规则，默认允许访问'
        }
        continue
      }

      // 检查管理员权限
      if (permission.requireAdmin && !user.isAdmin) {
        results[featureKey] = {
          allowed: false,
          featureKey: permission.featureKey,
          featureName: permission.featureName,
          message: `只有管理员才能访问${permission.featureName}`
        }
        continue
      }

      // 检查角色权限
      if (!permission.enabledRoles.includes(user.role)) {
        results[featureKey] = {
          allowed: false,
          featureKey: permission.featureKey,
          featureName: permission.featureName,
          enabledRoles: permission.enabledRoles,
          message: `只有${permission.enabledRoles.join('、')}才能访问${permission.featureName}`
        }
        continue
      }

      // 有权限
      results[featureKey] = {
        allowed: true,
        featureKey: permission.featureKey,
        featureName: permission.featureName,
        enabledRoles: permission.enabledRoles
      }
    }

    return success({
      user: {
        openid: user.openid,
        name: user.name,
        role: user.role,
        isAdmin: !!user.isAdmin
      },
      permissions: results
    })
  } catch (error) {
    return fail(error.message || '批量权限检查失败', 500)
  }
}

/**
 * 获取所有权限配置
 */
async function listPermissions() {
  try {
    const result = await permissionsCollection
      .orderBy('createdAt', 'asc')
      .get()

    return success({
      permissions: result.data || [],
      count: (result.data || []).length
    })
  } catch (error) {
    return fail(error.message || '获取权限配置失败', 500)
  }
}

/**
 * 更新权限配置
 */
async function updatePermission(openid, featureKey, config) {
  try {
    // 验证用户是否为管理员
    const userResult = await usersCollection
      .where({ openid })
      .limit(1)
      .get()

    if (!userResult.data || userResult.data.length === 0) {
      return fail('用户不存在', 404)
    }

    const user = userResult.data[0]
    if (!user.isAdmin) {
      return fail('只有管理员才能修改权限配置', 403)
    }

    // 查询现有权限配置
    const permResult = await permissionsCollection
      .where({ featureKey })
      .limit(1)
      .get()

    const now = Date.now()
    const updateData = {
      updatedAt: now
    }

    if (config.featureName !== undefined) {
      updateData.featureName = config.featureName
    }
    if (config.description !== undefined) {
      updateData.description = config.description
    }
    if (config.enabledRoles !== undefined) {
      updateData.enabledRoles = config.enabledRoles
    }
    if (config.requireAdmin !== undefined) {
      updateData.requireAdmin = config.requireAdmin
    }

    if (permResult.data && permResult.data.length > 0) {
      // 更新现有权限
      await permissionsCollection
        .doc(permResult.data[0]._id)
        .update({ data: updateData })

      return success({
        featureKey,
        updated: true,
        ...updateData
      }, '权限配置更新成功')
    } else {
      // 创建新权限
      const newPerm = {
        featureKey,
        featureName: config.featureName || featureKey,
        description: config.description || '',
        enabledRoles: config.enabledRoles || [],
        requireAdmin: config.requireAdmin || false,
        createdAt: now,
        updatedAt: now
      }
      await permissionsCollection.add({ data: newPerm })

      return success({
        featureKey,
        created: true,
        ...newPerm
      }, '权限配置创建成功')
    }
  } catch (error) {
    return fail(error.message || '更新权限配置失败', 500)
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
    if (action === 'initPermissions') {
      // 初始化权限（仅管理员可调用）
      const userResult = await usersCollection.where({ openid }).limit(1).get()
      if (!userResult.data || userResult.data.length === 0 || !userResult.data[0].isAdmin) {
        return fail('只有管理员才能初始化权限配置', 403)
      }
      return await initPermissions()
    }

    if (action === 'checkPermission') {
      const featureKey = event.featureKey
      if (!featureKey) {
        return fail('缺少功能标识', 400)
      }
      return await checkPermission(openid, featureKey)
    }

    if (action === 'batchCheckPermissions') {
      const featureKeys = event.featureKeys
      if (!featureKeys || !Array.isArray(featureKeys)) {
        return fail('缺少功能标识列表', 400)
      }
      return await batchCheckPermissions(openid, featureKeys)
    }

    if (action === 'listPermissions') {
      return await listPermissions()
    }

    if (action === 'updatePermission') {
      const featureKey = event.featureKey
      const config = event.config || {}
      if (!featureKey) {
        return fail('缺少功能标识', 400)
      }
      return await updatePermission(openid, featureKey, config)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
