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

// ==================== 核心时间处理函数 ====================

/**
 * 获取时区偏移量（同步版本，从缓存中读取）
 * @returns {number} 时区偏移量（小时），默认 -3（圣保罗时区）
 */
function getTimezoneOffset() {
  // 从 app 的缓存中获取
  try {
    const app = getApp()
    const offset = app.getConstantSync('TIMEZONE_OFFSET')
    return offset !== undefined && offset !== null ? offset : -3
  } catch (e) {
    return -3
  }
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
 * 手动解析纯日期字符串为本地时间 Date 对象
 * 
 * ⚠️ 重要：JavaScript 时区陷阱
 * - `new Date('YYYY-MM-DD')` 会将纯日期解析为 UTC 午夜 00:00
 * - 在 UTC-3 时区，UTC 午夜会转换为前一天的 21:00，导致日期错误！
 * - 此函数使用本地时间构造，确保在任何时区都能正确解析日期
 * 
 * @param {string} dateStr - 纯日期字符串，支持格式：
 *   - 'YYYY-MM-DD'（推荐）
 *   - 'YYYY/MM/DD'
 *   - 'YYYY.MM.DD'
 * @returns {Date} 本地时间 Date 对象
 * @example
 * // ✅ 正确用法
 * const date = parseLocalDate('2026-03-23')
 * console.log(date.getDate())  // 总是返回 23
 * 
 * // ❌ 错误用法（时区陷阱）
 * const date = new Date('2026-03-23')
 * // 在 UTC-3 时区，getDate() 可能返回 22！
 */
function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return new Date()
  }
  
  // 支持多种分隔符：- / .
  const parts = dateStr.split(/[-\/.]/).map(Number)
  
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.warn('parseLocalDate: 无效的日期格式', dateStr)
    return new Date()
  }
  
  const [year, month, day] = parts
  
  // 使用本地时间构造 Date，避免时区问题
  // 注意：Date 构造函数的月份从 0 开始
  return new Date(year, month - 1, day)
}

/**
 * 格式化 Date 对象为日期字符串（YYYY-MM-DD）
 * 用于日期遍历循环中生成日期字符串
 * @param {Date} date - Date 对象
 * @returns {string} 日期字符串
 */
function formatDateObj(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 解析日期字符串为年月日数字对象
 * 用于传递给第三方日历组件（如 @lspriv/wx-calendar）
 * 避免组件内部使用 new Date(string) 导致时区偏移问题
 * 
 * ⚠️ 第三方组件时间处理范式（重要！）
 * - @lspriv/wx-calendar 的 marks 字段：
 *   - ❌ 错误：使用 { date: 'YYYY-MM-DD' } → 组件内部 new Date(string) → 时区偏移
 *   - ✅ 正确：使用 { year: 2026, month: 3, day: 23 } → 组件内部 new Date(year, month-1, day) → 无时区问题
 * 
 * @param {string} dateStr - 纯日期字符串（YYYY-MM-DD）
 * @returns {{year: number, month: number, day: number}} 年月日对象
 */
function parseDateParts(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  }
  
  const parts = dateStr.split(/[-\/.]/).map(Number)
  
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.warn('parseDateParts: 无效的日期格式', dateStr)
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  }
  
  return { year: parts[0], month: parts[1], day: parts[2] }
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
  try {
    const app = getApp()
    const visibilityMap = app.getConstantSync('ROLE_FIELD_VISIBILITY')
    if (visibilityMap && visibilityMap[role]) {
      return visibilityMap[role].showDepartment === true
    }
  } catch (e) {}
  return false
}

/**
 * 判断角色是否需要填写亲属信息
 * @param {string} role - 角色名称
 * @returns {boolean}
 */
function needRelativeField(role) {
  try {
    const app = getApp()
    const roles = app.getConstantSync('NEED_RELATIVE_ROLES')
    return roles ? roles.includes(role) : false
  } catch (e) {
    return false
  }
}

// ==================== 云存储图片缓存 ====================

/**
 * 加载云存储图片（优先使用本地持久缓存）
 * 
 * 核心流程：检查本地缓存 → 有效则直接使用 → 无效则从云存储下载 → saveFile 持久保存 → 兜底使用临时链接
 * 
 * 版本控制：通过 config.CACHE_VERSION 管理缓存失效。
 *           当 CACHE_VERSION 变更时，本地缓存路径会变化，自动触发重新下载。
 * 
 * @param {Object} page - Page 实例（this）
 * @param {string} dataKey - data 中存储图片路径的键名（如 'bgImageUrl'）
 * @param {string} cloudFileID - 云存储文件 ID（如 'cloud://xxx/images/br1.jpg'）
 * @param {string} cacheFileName - 本地缓存文件名（如 'bg_home.jpg'），不同图片必须不同
 * @returns {Promise<string>} 最终使用的图片路径
 */
function loadCachedCloudImage(page, dataKey, cloudFileID, cacheFileName) {
  const config = require('../config.js')
  // 版本号纳入路径，CACHE_VERSION 变更时自动失效旧缓存
  const version = config.CACHE_VERSION || '1'
  const cacheDir = `${wx.env.USER_DATA_PATH}/cache`
  const versionDir = `${cacheDir}/${version}`
  const cachePath = `${versionDir}/${cacheFileName}`

  const fs = wx.getFileSystemManager()

  // 1. 检查本地缓存文件是否存在且有效
  try {
    const stat = fs.statSync(cachePath)
    if (stat.size > 0) {
      page.setData({ [dataKey]: cachePath })
      return Promise.resolve(cachePath)
    }
  } catch (e) {
    // 文件不存在，继续下载流程
  }

  // 2. 确保版本目录存在
  try { fs.mkdirSync(versionDir, true) } catch (e) {}

  // 3. 从云存储下载到临时文件，再保存为持久文件
  return new Promise((resolve, reject) => {
    wx.cloud.downloadFile({
      fileID: cloudFileID,
      success: (downloadRes) => {
        try {
          fs.saveFileSync(downloadRes.tempFilePath, cachePath)
          page.setData({ [dataKey]: cachePath })
          resolve(cachePath)
        } catch (saveErr) {
          console.error('保存缓存文件失败:', saveErr)
          // saveFile 失败，尝试直接使用临时文件
          page.setData({ [dataKey]: downloadRes.tempFilePath })
          resolve(downloadRes.tempFilePath)
        }
      },
      fail: (downloadErr) => {
        console.error('下载云存储图片失败:', downloadErr)
        // 4. 兜底：使用 getTempFileURL 临时链接
        wx.cloud.getTempFileURL({
          fileList: [cloudFileID],
          success: (urlRes) => {
            if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
              const tempURL = urlRes.fileList[0].tempFileURL
              page.setData({ [dataKey]: tempURL })
              resolve(tempURL)
            } else {
              reject(new Error('获取临时链接失败'))
            }
          },
          fail: (urlErr) => {
            console.error('获取临时链接兜底失败:', urlErr)
            reject(urlErr)
          }
        })
      }
    })
  })
}

// ==================== 导出模块 ====================

module.exports = {
  // 核心时间函数
  getTimezoneOffset,
  toLocalTime,
  
  // 日期解析函数（时区安全）
  parseLocalDate,
  parseDateParts,
  formatDateObj,
  
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

  // 云存储图片缓存
  loadCachedCloudImage
}
