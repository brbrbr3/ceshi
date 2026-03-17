const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 获取系统配置
 * 从 sys_config 集合读取所有配置，按类型分组返回
 * 
 * 注意：本函数只负责读取，不负责初始化
 * 初始化请调用 initSystemConfig 云函数
 */
exports.main = async (event, context) => {
  try {
    // 从数据库读取所有配置
    const result = await db.collection('sys_config').get()
    const configs = result.data || []

    // 按类型分组
    const groupedConfigs = {}
    for (const config of configs) {
      if (!groupedConfigs[config.type]) {
        groupedConfigs[config.type] = {}
      }
      groupedConfigs[config.type][config.key] = config.value
    }

    return {
      code: 0,
      message: 'ok',
      data: groupedConfigs
    }
  } catch (error) {
    console.error('获取系统配置失败:', error)
    return {
      code: -1,
      message: error.message || '获取系统配置失败',
      data: null
    }
  }
}
