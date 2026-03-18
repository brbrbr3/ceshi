// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 数据库集合初始化云函数
 * 
 * 功能：
 * 1. 检查所有必需的数据库集合是否存在
 * 2. 如果集合不存在，自动创建
 * 3. 为集合设置初始数据（如需要）
 * 4. 为集合设置安全规则（aclTag）
 * 
 * 重要：
 * - 此云函数应在程序启动时最先执行
 * - 后续新增任何数据库集合，必须在此文件中添加
 * - 确保集合名称与 DATABASE_COLLECTIONS_REFERENCE.md 文档一致
 * - 所有集合必须配置 aclTag（安全规则）
 */

// 安全规则类别说明：
// ADMINONLY - 仅管理员可读写
// ADMINWRITE - 所有用户可读，仅管理员可写
// READONLY - 所有用户可读，仅创建者可写
// PRIVATE - 仅创建者可读写
// CUSTOM - 自定义规则（需要提供 rule 字段）

// 所有必需的数据库集合定义
const REQUIRED_COLLECTIONS = [
  // ==================== 用户相关 ====================
  {
    name: 'office_users',
    description: '办公系统用户',
    aclTag: 'ADMINONLY', // 仅管理员可读写
    initialData: null
  },
  {
    name: 'office_registration_requests',
    description: '用户注册请求',
    aclTag: 'READONLY', // 所有用户可读，仅创建者可写
    initialData: null
  },
  {
    name: 'permissions',
    description: '权限配置',
    aclTag: 'ADMINWRITE', // 所有用户可读，仅管理员可写
    initialData: null
  },

  // ==================== 系统配置 ====================
  {
    name: 'sys_config',
    description: '系统配置（常量）',
    aclTag: 'READONLY', // 所有用户可读，仅创建者可写
    initialData: null
  },

  // ==================== 通知公告 ====================
  {
    name: 'announcements',
    description: '通知公告',
    aclTag: 'ADMINWRITE', // 所有用户可读，仅管理员可写
    initialData: null
  },
  {
    name: 'notifications',
    description: '用户通知',
    aclTag: 'PRIVATE', // 仅创建者可读写（用户只能看到自己的通知）
    initialData: null
  },

  // ==================== 每周菜单 ====================
  {
    name: 'menus',
    description: '每周菜单',
    aclTag: 'ADMINWRITE', // 所有用户可读，仅管理员可写
    initialData: null
  },
  {
    name: 'menu_comments',
    description: '菜单评论',
    aclTag: 'ADMINWRITE', // 所有用户可读，仅管理员可写
    initialData: null
  },

  // ==================== 工作流相关 ====================
  {
    name: 'workflow_templates',
    description: '工作流模板',
    aclTag: 'PRIVATE', // 仅创建者可读写
    initialData: null
  },
  {
    name: 'work_orders',
    description: '工作订单（注意：不是 workflow_orders）',
    aclTag: 'PRIVATE', // 仅创建者可读写
    initialData: null
  },
  {
    name: 'workflow_tasks',
    description: '工作流任务',
    aclTag: 'PRIVATE', // 仅创建者可读写
    initialData: null
  },
  {
    name: 'workflow_logs',
    description: '工作流日志',
    aclTag: 'PRIVATE', // 仅创建者可读写
    initialData: null
  },
  {
    name: 'workflow_subscriptions',
    description: '工作流订阅配置',
    aclTag: 'PRIVATE', // 仅创建者可读写
    initialData: null
  }
]

/**
 * 检查集合是否存在
 * @param {string} collectionName - 集合名称
 * @returns {Promise<{exists: boolean, error: string|null}>} 是否存在及错误信息
 */
async function checkCollectionExists(collectionName) {
  try {
    // 尝试获取集合中的一条记录来判断集合是否存在
    const result = await db.collection(collectionName).limit(1).get()
    return { exists: true, error: null }
  } catch (error) {
    const errMsg = error.errMsg || error.message || String(error)
    console.log(`  检查集合 ${collectionName} 错误: ${errMsg}`)
    
    // 如果错误信息包含 "not exist" 或 "不存在" 或 "collection not found"，则集合不存在
    if (errMsg.includes('not exist') || 
        errMsg.includes('不存在') || 
        errMsg.includes('collection not found') ||
        errMsg.includes('Collection does not exist')) {
      return { exists: false, error: null }
    }
    
    // 其他错误（如权限问题），记录错误但假设集合可能存在
    console.warn(`  检查集合 ${collectionName} 时出现异常:`, errMsg)
    return { exists: true, error: errMsg }
  }
}

/**
 * 创建集合并设置安全规则
 * @param {string} collectionName - 集合名称
 * @param {string} aclTag - 安全规则标签
 * @returns {Promise<{success: boolean, error: string|null}>} 是否创建成功及错误信息
 */
async function createCollection(collectionName, aclTag = 'PRIVATE') {
  try {
    // 云开发数据库在第一次写入数据时会自动创建集合
    // 所以我们添加一条初始化记录来创建集合
    await db.collection(collectionName).add({
      data: {
        _initialized: true,
        _initTime: Date.now(),
        _description: '集合初始化记录，可删除'
      }
    })
    console.log(`  ✓ 创建集合并添加初始化记录: ${collectionName}`)
    
    // 设置安全规则
    const aclResult = await setCollectionAcl(collectionName, aclTag)
    if (!aclResult.success) {
      console.warn(`  ⚠ 集合创建成功但安全规则设置失败: ${aclResult.error}`)
    }
    
    return { success: true, error: null, aclWarning: aclResult.success ? null : aclResult.error }
  } catch (error) {
    const errMsg = error.errMsg || error.message || String(error)
    console.error(`  ✗ 创建集合失败 ${collectionName}:`, errMsg)
    
    // 检查是否是权限错误
    if (errMsg.includes('permission') || errMsg.includes('权限') || errMsg.includes('auth')) {
      return { success: false, error: `权限不足: ${errMsg}` }
    }
    
    // 检查是否是集合已存在错误
    if (errMsg.includes('already exist') || errMsg.includes('已存在')) {
      return { success: false, error: `集合已存在: ${errMsg}` }
    }
    
    return { success: false, error: errMsg }
  }
}

/**
 * 设置集合的安全规则
 * 注意：此功能需要使用 CloudBase 管理 API，在云函数中可能无法直接调用
 * 实际的安全规则设置应通过 MCP 工具或云开发控制台完成
 * 
 * @param {string} collectionName - 集合名称
 * @param {string} aclTag - 安全规则标签
 * @returns {Promise<{success: boolean, error: string|null}>} 设置结果
 */
async function setCollectionAcl(collectionName, aclTag) {
  // 云函数中无法直接设置安全规则
  // 安全规则需要通过以下方式设置：
  // 1. 云开发控制台手动设置
  // 2. 使用 CloudBase MCP 工具的 writeSecurityRule 工具
  // 3. 使用 CloudBase HTTP API
  
  // 这里我们只记录日志，实际设置需要在外部完成
  console.log(`  [安全规则] ${collectionName} -> ${aclTag}（需要通过控制台或MCP工具设置）`)
  
  return { 
    success: true, 
    error: null,
    note: '云函数无法直接设置安全规则，请使用MCP工具或控制台设置'
  }
}

/**
 * 初始化数据库集合
 */
exports.main = async (event, context) => {
  const startTime = Date.now()
  const results = {
    total: REQUIRED_COLLECTIONS.length,
    exists: 0,
    created: 0,
    failed: 0,
    aclPending: [], // 需要设置安全规则的集合
    details: []
  }

  console.log('=== 开始初始化数据库集合 ===')
  console.log(`共 ${REQUIRED_COLLECTIONS.length} 个必需集合`)

  for (const collection of REQUIRED_COLLECTIONS) {
    const { name, description, aclTag = 'PRIVATE' } = collection
    console.log(`\n检查集合: ${name} (${description})`)
    console.log(`  安全规则: ${aclTag}`)

    try {
      const checkResult = await checkCollectionExists(name)

      if (checkResult.exists) {
        if (checkResult.error) {
          // 集合可能存在但有访问问题
          console.warn(`  ⚠ 集合可能存在但访问异常: ${name}`)
          results.exists++
          results.aclPending.push({ name, aclTag, reason: 'exists_with_warning' })
          results.details.push({
            name,
            status: 'exists_with_warning',
            description,
            aclTag,
            warning: checkResult.error
          })
        } else {
          console.log(`  ✓ 集合已存在: ${name}`)
          results.exists++
          results.aclPending.push({ name, aclTag, reason: 'already_exists' })
          results.details.push({
            name,
            status: 'exists',
            description,
            aclTag
          })
        }
      } else {
        console.log(`  集合不存在，正在创建: ${name}`)
        const createResult = await createCollection(name, aclTag)

        if (createResult.success) {
          results.created++
          results.aclPending.push({ name, aclTag, reason: 'newly_created' })
          results.details.push({
            name,
            status: 'created',
            description,
            aclTag,
            aclWarning: createResult.aclWarning
          })
        } else {
          results.failed++
          results.details.push({
            name,
            status: 'failed',
            description,
            aclTag,
            error: createResult.error || '创建失败'
          })
        }
      }
    } catch (error) {
      console.error(`  ✗ 处理集合 ${name} 时发生错误:`, error)
      results.failed++
      results.details.push({
        name,
        status: 'error',
        description,
        aclTag,
        error: error.message || String(error)
      })
    }
  }

  const duration = Date.now() - startTime
  console.log(`\n=== 数据库集合初始化完成 ===`)
  console.log(`总数: ${results.total}, 已存在: ${results.exists}, 新创建: ${results.created}, 失败: ${results.failed}`)
  console.log(`耗时: ${duration}ms`)
  
  if (results.aclPending.length > 0) {
    console.log(`\n=== 需要设置安全规则的集合 ===`)
    results.aclPending.forEach(item => {
      console.log(`  ${item.name}: ${item.aclTag} (${item.reason})`)
    })
  }

  return {
    code: 0,
    message: '数据库集合初始化完成',
    data: {
      duration,
      ...results,
      aclNote: '安全规则需要通过MCP工具或云开发控制台设置。请使用 writeSecurityRule 工具为每个集合设置对应的 aclTag。'
    }
  }
}
