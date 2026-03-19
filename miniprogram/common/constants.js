/**
 * 前端常量模块
 * 从数据库加载系统配置，带缓存机制
 */

// 缓存配置
let constantsCache = null
let cacheLoadTime = null
const CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

/**
 * 从云函数获取系统配置（异步）
 * @param {string} key - 常量键名
 * @returns {Promise<any>} 常量值
 */
async function getConstant(key) {
  const allConstants = await getAllConstants()
  return allConstants[key]
}

/**
 * 从缓存中同步获取系统配置
 * 如果缓存不存在，返回默认值
 * @param {string} key - 常量键名
 * @returns {any} 常量值
 */
function getConstantSync(key) {
  // 如果有缓存，直接返回
  if (constantsCache && cacheLoadTime) {
    return constantsCache[key]
  }
  
  // 否则返回默认值
  const defaults = getDefaultConstants()
  return defaults[key]
}

/**
 * 获取多个常量值
 * @param {string[]} keys - 常量键名数组
 * @returns {Promise<Object>} 常量键值对
 */
async function getConstants(keys) {
  const allConstants = await getAllConstants()
  const result = {}
  for (const key of keys) {
    result[key] = allConstants[key]
  }
  return result
}

/**
 * 获取所有常量（带缓存）
 * @returns {Promise<Object>} 所有常量的键值对
 */
async function getAllConstants() {
  const now = Date.now()
  
  // 检查缓存是否有效
  if (constantsCache && cacheLoadTime && (now - cacheLoadTime < CACHE_TTL)) {
    return constantsCache
  }

  try {
    // 调用云函数获取配置
    const res = await wx.cloud.callFunction({
      name: 'getSystemConfig'
    })
    
    if (res.result.code !== 0) {
      throw new Error(res.result.message || '获取配置失败')
    }
    
    const configs = res.result.data || {}
    
    // 将按类型分组的配置转换为键值对
    const constants = {}
    for (const type in configs) {
      for (const key in configs[type]) {
        constants[key] = configs[type][key]
      }
    }
    
    // 更新缓存
    constantsCache = constants
    cacheLoadTime = now
    
    return constants
  } catch (error) {
    console.error('获取常量失败:', error)
    
    // 如果有旧缓存，继续使用
    if (constantsCache) {
      console.warn('使用旧缓存数据')
      return constantsCache
    }
    
    // 否则返回默认值
    return getDefaultConstants()
  }
}

/**
 * 清除缓存
 */
function clearCache() {
  constantsCache = null
  cacheLoadTime = null
}

/**
 * 获取默认常量（降级方案）
 * @returns {Object} 默认常量
 */
function getDefaultConstants() {
  return {
    // 角色相关
    ROLE_OPTIONS: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],
    ROLE_POSITION_MAP: {
      '工勤': ['会计', '招待员', '厨师'],
      '配偶': ['无']
    },
    NEED_DEPARTMENT_ROLES: ['部门负责人', '馆员', '工勤'],
    NEED_RELATIVE_ROLES: ['配偶', '家属'],
    DEFAULT_ROLE: '馆员',

    // 岗位相关
    POSITION_OPTIONS: ['无', '会计主管', '会计', '招待员', '厨师'],
    DEFAULT_POSITION: '无',

    // 部门相关
    DEPARTMENT_OPTIONS: ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', '党委办'],
    DEFAULT_DEPARTMENT: '',

    // 角色-字段显示映射关系
    ROLE_FIELD_VISIBILITY: {
      '馆领导': { showPosition: false, showDepartment: false, fixedDepartment: null },
      '部门负责人': { showPosition: true, showDepartment: true, fixedDepartment: null },
      '馆员': { showPosition: true, showDepartment: true, fixedDepartment: null },
      '工勤': { showPosition: true, showDepartment: true, fixedDepartment: '办公室' },
      '物业': { showPosition: false, showDepartment: false, fixedDepartment: null },
      '配偶': { showPosition: true, showDepartment: false, fixedDepartment: null },
      '家属': { showPosition: false, showDepartment: false, fixedDepartment: null }
    },

    // 性别相关
    GENDER_OPTIONS: ['男', '女'],
    DEFAULT_GENDER: '男',

    // 请求状态
    REQUEST_STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      TERMINATED: 'terminated'
    },
    REQUEST_STATUS_TEXT: {
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回',
      terminated: '已中止'
    },
    REQUEST_STATUS_STYLE: {
      pending: { color: '#D97706', bg: '#FEF3C7' },
      approved: { color: '#16A34A', bg: '#DCFCE7' },
      rejected: { color: '#DC2626', bg: '#FEE2E2' },
      terminated: { color: '#DC2626', bg: '#FEE2E2' }
    },

    // 工作流状态
    TASK_STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      CANCELLED: 'cancelled',
      RETURNED: 'returned'
    },
    ORDER_STATUS: {
      PENDING: 'pending',
      SUPPLEMENT: 'supplement',
      COMPLETED: 'completed',
      REJECTED: 'rejected',
      CANCELLED: 'cancelled',
      TERMINATED: 'terminated'
    },

    // 时区配置
    TIMEZONE_OFFSET: -3,
    TIMEZONE_NAME: 'America/Sao_Paulo',

    // 就医申请相关
    RELATION_OPTIONS: ['本人', '配偶', '子女', '父母', '其他'],
    MEDICAL_INSTITUTIONS: [
      'Hospital Sírio-Libanês（私立综合性医院）',
      'DF Star-Rede D\'OR（私立综合性医院）',
      'Hospital Brasília（私立综合性医院）',
      'Hospital Daher（私立综合性医院）',
      'Hospital Santa Lúcia（私立综合性医院）',
      'Hospital Santa Luzia（私立综合性医院）',
      'Hospital Home（私立综合性医院，骨科专长）',
      'Sarah Kubitschek（公立医院 – 残障人士友好）',
      'Hospital das Forças Armadas （公立综合性医院）',
      'Rita Trindade（牙科）',
      'Clínica Implanto Odontologia Especializada（牙科）',
      'CBV（眼科）',
      'Laboratório Sabin（巴西临床医学典范）',
      'Cote Brasília（骨科）',
      'Aluma Dermatologia e Laser（皮肤科）',
      'Rheos. Reumatologia e Clínica Médica（风湿科）',
      'Prodigest（消化科）',
      'CEOL ENT-Otorhinolaryngology Clinic（耳鼻喉科）',
      'Centro de Acupuntura Shen（针灸、艾灸）',
      'Consultório Natasha Ferraroni（过敏）',
      'Hospital Materno Infantil de Brasília（妇幼专科）',
      '其他'
    ],

    // 通知消息类型
    NOTIFICATION_TYPES: {
      MENU: 'menu',
      NEW_REGISTRATION: 'new_registration',
      TASK_ASSIGNED: 'task_assigned',
      TASK_COMPLETED: 'task_completed',
      PROCESS_RETURNED: 'process_returned',
      WORKFLOW_COMPLETED: 'workflow_completed',
      ORDER_TERMINATED: 'order_terminated'
    },

    // 通知消息类型与跳转tab映射
    NOTIFICATION_TARGET_TAB: {
      menu: 'none',
      new_registration: 'pending',
      task_assigned: 'pending',
      task_completed: 'mine',
      process_returned: 'mine',
      workflow_completed: 'mine',
      order_terminated: 'mine'
    }
  }
}

module.exports = {
  getConstant,
  getConstantSync,
  getConstants,
  getAllConstants,
  clearCache,
  getDefaultConstants
}
