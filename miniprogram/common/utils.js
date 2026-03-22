/**
 * 前端工具函数模块（统一入口）
 * 所有时间处理函数都集中在这里，供前端共享使用
 * 
 * 设计原则：
 * - 后端只存储和返回 GMT 时间戳
 * - 前端统一处理所有时间格式化
 * - 所有时间函数基于时区偏移常量计算
 * 
 * 使用示例：
 * const utils = require('../../../common/utils.js')
 * const formattedTime = utils.formatDateTime(timestamp)
 */

const constants = require('./constants.js')

// ==================== 核心时间处理函数 ====================

/**
 * 获取时区偏移量（同步版本，从缓存中读取）
 * @returns {number} 时区偏移量（小时），默认 -3（圣保罗时区）
 */
function getTimezoneOffset() {
  // 从 constants 模块的缓存中获取
  const offset = constants.getConstantSync('TIMEZONE_OFFSET')
  return offset !== undefined && offset !== null ? offset : -3
}

/**
 * 将 GMT 时间戳转换为本地时间
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @param {number} offset - 时区偏移量（小时），可选
 * @returns {Date} 本地时间 Date 对象
 */
function toLocalTime(timestamp, offset) {
  if (!timestamp) return new Date()
  
  // 如果未提供 offset，使用缓存的时区偏移量
  if (offset === undefined || offset === null) {
    offset = getTimezoneOffset()
  }
  
  const date = new Date(timestamp)
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000)
  return new Date(utcTime + (offset * 3600000))
}

// ==================== 时间格式化函数（全部同步） ====================

/**
 * 格式化日期时间（YYYY-MM-DD HH:mm:ss）
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @param {number} offset - 时区偏移量（小时），可选
 * @returns {string} 格式化后的日期时间字符串
 */
function formatDateTime(timestamp, offset) {
  if (!timestamp) return ''
  
  const date = toLocalTime(timestamp, offset)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 格式化日期（YYYY-MM-DD）
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @param {number} offset - 时区偏移量（小时），可选
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(timestamp, offset) {
  if (!timestamp) return ''
  
  const date = toLocalTime(timestamp, offset)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

/**
 * 格式化时间（HH:mm:ss）
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @param {number} offset - 时区偏移量（小时），可选
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(timestamp, offset) {
  if (!timestamp) return ''
  
  const date = toLocalTime(timestamp, offset)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  
  return `${hour}:${minute}:${second}`
}

/**
 * 格式化相对时间（如"5分钟前"）
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @param {number} offset - 时区偏移量（小时），可选
 * @returns {string} 格式化后的相对时间字符串
 */
function formatRelativeTime(timestamp, offset) {
  if (!timestamp) return '刚刚'
  
  const now = Date.now()
  const diff = now - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  
  // 未来时间
  if (diff < 0) {
    return '刚刚'
  }
  
  // 1小时内
  if (diff < hour) {
    return `${Math.max(1, Math.floor(diff / minute))} 分钟前`
  }
  
  // 24小时内
  if (diff < day) {
    return `${Math.max(1, Math.floor(diff / hour))} 小时前`
  }
  
  // 7天内
  if (diff < 7 * day) {
    return `${Math.max(1, Math.floor(diff / day))} 天前`
  }
  
  // 超过7天，显示具体日期
  return formatDate(timestamp, offset)
}

/**
 * 格式化简短日期时间（MM-DD HH:mm）
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @param {number} offset - 时区偏移量（小时），可选
 * @returns {string} 格式化后的简短日期时间字符串
 */
function formatShortDateTime(timestamp, offset) {
  if (!timestamp) return ''
  
  const date = toLocalTime(timestamp, offset)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  
  return `${month}-${day} ${hour}:${minute}`
}

/**
 * 格式化为时分秒（用于视频/音频时长）
 * @param {number} time - 时间（秒）
 * @returns {string} HH:mm:ss 格式
 */
function formatDuration(time) {
  if (typeof time !== 'number' || time < 0) {
    return time
  }

  const hour = parseInt(time / 3600, 10)
  time %= 3600
  const minute = parseInt(time / 60, 10)
  time = parseInt(time % 60, 10)
  const second = time

  return ([hour, minute, second]).map(function (n) {
    n = n.toString()
    return n[1] ? n : '0' + n
  }).join(':')
}

/**
 * 获取今天的日期字符串（YYYY-MM-DD）
 * @param {number} offset - 时区偏移量（小时），可选
 * @returns {string} 今天的日期
 */
function getTodayDate(offset) {
  return formatDate(Date.now(), offset)
}

/**
 * 获取设备本地日期字符串（YYYY-MM-DD）
 * 用于日期选择器的默认值，避免时区转换问题
 * @returns {string} 本地日期字符串
 */
function getLocalDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取当前时间戳（GMT）
 * @returns {number} 当前 GMT 时间戳（毫秒）
 */
function now() {
  return Date.now()
}

// ==================== 通用工具函数 ====================

/**
 * 规范化布尔值
 * @param {any} value - 输入值
 * @returns {boolean} 布尔值
 */
function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true'
  }
  return !!value
}

/**
 * 生成请求编号
 * @param {string} prefix - 前缀（如 'REG', 'MED'）
 * @returns {string} 编号（如 REG20260317ABC123）
 */
function generateRequestNo(prefix = 'REQ') {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const dateStr = `${year}${month}${day}`
  
  // 生成随机字符串（6位）
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase()
  
  return `${prefix}${dateStr}${randomStr}`
}

/**
 * 根据文本生成固定的头像颜色
 * @param {string} text - 输入文本
 * @returns {string} 十六进制颜色值
 */
function getAvatarColor(text) {
  if (!text) return '#6B7280'
  
  const colors = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', 
    '#84CC16', '#22C55E', '#10B981', '#14B8A6',
    '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1',
    '#8B5CF6', '#A855F7', '#D946EF', '#EC4899'
  ]
  
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

/**
 * 显示 Toast 提示
 * @param {Object|string} options - Toast 选项或文本
 * @param {string} options.title - 提示文本
 * @param {string} options.icon - 图标类型（success, error, loading, none）
 * @param {number} options.duration - 显示时长（毫秒）
 */
function showToast(options) {
  if (typeof options === 'string') {
    options = { title: options }
  }

  const minDuration = 1500
  const duration = options.duration || minDuration
  const actualDuration = Math.max(duration, minDuration)

  return wx.showToast({
    ...options,
    duration: actualDuration
  })
}

/**
 * 深拷贝对象
 * @param {any} obj - 要拷贝的对象
 * @returns {any} 拷贝后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item))
  }
  
  if (obj instanceof Object) {
    const copy = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        copy[key] = deepClone(obj[key])
      }
    }
    return copy
  }
  
  return obj
}

/**
 * 检查是否为空值
 * @param {any} value - 要检查的值
 * @returns {boolean}
 */
function isEmpty(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * 格式化经纬度
 * @param {number|string} longitude - 经度
 * @param {number|string} latitude - 纬度
 * @returns {Object} 格式化后的经纬度对象
 */
function formatLocation(longitude, latitude) {
  if (typeof longitude === 'string' && typeof latitude === 'string') {
    longitude = parseFloat(longitude)
    latitude = parseFloat(latitude)
  }

  longitude = longitude.toFixed(2)
  latitude = latitude.toFixed(2)

  return {
    longitude: longitude.toString().split('.'),
    latitude: latitude.toString().split('.')
  }
}

/**
 * 比较版本号
 * @param {string} v1 - 版本号1
 * @param {string} v2 - 版本号2
 * @returns {number} 1: v1>v2, -1: v1<v2, 0: v1=v2
 */
function compareVersion(v1, v2) {
  v1 = v1.split('.')
  v2 = v2.split('.')
  const len = Math.max(v1.length, v2.length)

  while (v1.length < len) {
    v1.push('0')
  }
  while (v2.length < len) {
    v2.push('0')
  }

  for (let i = 0; i < len; i++) {
    const num1 = parseInt(v1[i], 10)
    const num2 = parseInt(v2[i], 10)

    if (num1 > num2) {
      return 1
    } else if (num1 < num2) {
      return -1
    }
  }

  return 0
}

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ==================== 按钮角色判断 ====================

/**
 * 判断角色是否需要填写部门
 * @param {string} role - 角色名称
 * @returns {boolean}
 */
function needDepartmentField(role) {
  const roles = constants.getConstantSync('NEED_DEPARTMENT_ROLES')
  return roles ? roles.includes(role) : false
}

/**
 * 判断角色是否需要填写亲属信息
 * @param {string} role - 角色名称
 * @returns {boolean}
 */
function needRelativeField(role) {
  const roles = constants.getConstantSync('NEED_RELATIVE_ROLES')
  return roles ? roles.includes(role) : false
}

/**
 * 获取角色对应的岗位选项
 * @param {string} role - 角色名称
 * @returns {string[]}
 */
function getPositionOptionsByRole(role) {
  const map = constants.getConstantSync('ROLE_POSITION_MAP')
  const defaultPositions = constants.getConstantSync('POSITION_OPTIONS')
  
  if (map && map[role]) {
    return map[role]
  }
  
  return defaultPositions || []
}

// ==================== 导出模块 ====================

module.exports = {
  // 核心时间函数
  getTimezoneOffset,
  toLocalTime,
  
  // 时间格式化函数（全部同步）
  formatDateTime,
  formatDate,
  formatTime,
  formatRelativeTime,
  formatShortDateTime,
  formatDuration,
  getTodayDate,
  getLocalDateString,
  now,
  
  // 通用工具
  normalizeBoolean,
  generateRequestNo,
  getAvatarColor,
  showToast,
  deepClone,
  isEmpty,
  formatLocation,
  compareVersion,
  sleep,
  
  // 角色判断
  needDepartmentField,
  needRelativeField,
  getPositionOptionsByRole
}
