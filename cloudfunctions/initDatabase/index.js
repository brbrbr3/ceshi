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
 * 2. 如果集合不存在，通过 add() 自动创建
 * 3. 返回需要配置安全规则和索引的集合列表
 * 
 * 安全规则和索引配置：
 * - 安全规则通过 CloudBase MCP 工具 writeSecurityRule 设置
 * - 索引通过 CloudBase MCP 工具 writeNoSqlDatabaseStructure 设置
 */

// 所有必需的数据库集合定义
const REQUIRED_COLLECTIONS = [
  // ==================== 用户相关 ====================
  {
    name: 'office_users',
    description: '办公系统用户',
    aclTag: 'ADMINONLY',
    indexes: []
  },
  {
    name: 'office_registration_requests',
    description: '用户注册请求',
    aclTag: 'READONLY',
    indexes: [
      { name: 'status_updatedAt_idx', keys: [{ name: 'status', direction: '1' }, { name: 'updatedAt', direction: '-1' }] },
      { name: 'openid_idx', keys: [{ name: 'openid', direction: '1' }] }
    ]
  },
  {
    name: 'permissions',
    description: '权限配置',
    aclTag: 'ADMINWRITE',
    indexes: []
  },

  // ==================== 系统配置 ====================
  {
    name: 'sys_config',
    description: '系统配置（常量）',
    aclTag: 'READONLY',
    indexes: []
  },

  // ==================== 通知公告 ====================
  {
    name: 'announcements',
    description: '通知公告',
    aclTag: 'ADMINWRITE',
    indexes: []
  },
  {
    name: 'notifications',
    description: '用户通知',
    aclTag: 'READONLY',
    indexes: [
      { name: 'openid_createdAt_idx', keys: [{ name: 'openid', direction: '1' }, { name: 'createdAt', direction: '-1' }] }
    ]
  },

  // ==================== 每周菜单 ====================
  {
    name: 'menus',
    description: '每周菜单',
    aclTag: 'ADMINWRITE',
    indexes: [
      { name: 'idx_createdAt', keys: [{ name: 'createdAt', direction: '-1' }] }
    ]
  },
  {
    name: 'menu_comments',
    description: '菜单评论',
    aclTag: 'ADMINWRITE',
    indexes: [
      { name: 'idx_menuId_createdAt', keys: [{ name: 'menuId', direction: '1' }, { name: 'createdAt', direction: '1' }] }
    ]
  },

  // ==================== 工作流相关 ====================
  {
    name: 'workflow_templates',
    description: '工作流模板',
    aclTag: 'ADMINWRITE',
    indexes: [
      { name: 'idx_name_version', keys: [{ name: 'name', direction: '1' }, { name: 'version', direction: '-1' }], unique: true },
      { name: 'idx_status', keys: [{ name: 'status', direction: '1' }] },
      { name: 'idx_createTime', keys: [{ name: 'createTime', direction: '-1' }] }
    ]
  },
  {
    name: 'work_orders',
    description: '工作订单',
    aclTag: 'ADMINWRITE',
    indexes: [
      { name: 'idx_applicantId', keys: [{ name: 'businessData.applicantId', direction: '1' }] },
      { name: 'idx_orderType', keys: [{ name: 'orderType', direction: '1' }] },
      { name: 'idx_status', keys: [{ name: 'status', direction: '1' }] },
      { name: 'idx_createTime', keys: [{ name: 'createTime', direction: '-1' }] },
      { name: 'idx_updateTime', keys: [{ name: 'updateTime', direction: '-1' }] }
    ]
  },
  {
    name: 'workflow_tasks',
    description: '工作流任务',
    aclTag: 'ADMINWRITE',
    indexes: [
      { name: 'idx_approverId', keys: [{ name: 'approverId', direction: '1' }] },
      { name: 'idx_orderId', keys: [{ name: 'orderId', direction: '1' }] },
      { name: 'idx_status', keys: [{ name: 'status', direction: '1' }] },
      { name: 'idx_assignTime', keys: [{ name: 'assignTime', direction: '-1' }] }
    ]
  },
  {
    name: 'workflow_logs',
    description: '工作流日志',
    aclTag: 'ADMINWRITE',
    indexes: [
      { name: 'idx_orderId', keys: [{ name: 'orderId', direction: '1' }] },
      { name: 'idx_action', keys: [{ name: 'action', direction: '1' }] },
      { name: 'idx_operatorId', keys: [{ name: 'operatorId', direction: '1' }] },
      { name: 'idx_operateTime', keys: [{ name: 'operateTime', direction: '-1' }] }
    ]
  },

  // ==================== 外出报备相关 ====================
  {
    name: 'trip_reports',
    description: '外出报备记录（含同行人代报备功能）',
    aclTag: 'READONLY',
    indexes: [
      { name: 'idx_openid_status', keys: [{ name: '_openid', direction: '1' }, { name: 'status', direction: '1' }] },
      { name: 'idx_departAt', keys: [{ name: 'departAt', direction: '-1' }] },
      { name: 'idx_department', keys: [{ name: 'department', direction: '1' }] }
    ]
  }
]

/**
 * 检查集合是否存在
 */
async function checkCollectionExists(collectionName) {
  try {
    await db.collection(collectionName).limit(1).get()
    return { exists: true, error: null }
  } catch (error) {
    const errMsg = error.errMsg || error.message || String(error)
    if (errMsg.includes('not exist') || 
        errMsg.includes('不存在') || 
        errMsg.includes('collection not found') ||
        errMsg.includes('Collection does not exist')) {
      return { exists: false, error: null }
    }
    return { exists: true, error: errMsg }
  }
}

/**
 * 创建集合（通过 add() 自动创建）
 */
async function createCollection(collectionName) {
  try {
    await db.collection(collectionName).add({
      data: {
        _initialized: true,
        _initTime: Date.now(),
        _description: '集合初始化记录，可删除'
      }
    })
    return { success: true, error: null }
  } catch (error) {
    const errMsg = error.errMsg || error.message || String(error)
    return { success: false, error: errMsg }
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
    needsConfig: [], // 需要配置安全规则和索引的集合
    details: []
  }

  console.log('=== 开始初始化数据库集合 ===')
  console.log(`共 ${REQUIRED_COLLECTIONS.length} 个必需集合`)

  for (const collection of REQUIRED_COLLECTIONS) {
    const { name, description, aclTag = 'PRIVATE', indexes = [] } = collection
    console.log(`\n检查集合: ${name} (${description})`)

    const checkResult = await checkCollectionExists(name)

    if (checkResult.exists) {
      console.log(`  ✓ 集合已存在: ${name}`)
      results.exists++
      results.details.push({ name, status: 'exists', description, aclTag, indexes })
    } else {
      console.log(`  集合不存在，正在创建: ${name}`)
      const createResult = await createCollection(name)

      if (createResult.success) {
        console.log(`  ✓ 创建成功: ${name}`)
        results.created++
        results.details.push({ name, status: 'created', description, aclTag, indexes })
      } else {
        console.error(`  ✗ 创建失败: ${createResult.error}`)
        results.failed++
        results.details.push({ name, status: 'failed', description, aclTag, indexes, error: createResult.error })
      }
    }

    // 所有集合都需要配置（无论新建还是已存在）
    results.needsConfig.push({ name, aclTag, indexes })
  }

  const duration = Date.now() - startTime
  console.log(`\n=== 数据库集合初始化完成 ===`)
  console.log(`总数: ${results.total}, 已存在: ${results.exists}, 新创建: ${results.created}, 失败: ${results.failed}`)
  console.log(`耗时: ${duration}ms`)

  return {
    code: 0,
    message: '数据库集合初始化完成',
    data: {
      duration,
      ...results,
      note: '请使用 MCP 工具配置安全规则（writeSecurityRule）和索引（writeNoSqlDatabaseStructure）'
    }
  }
}
