function formatTime(time) {
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
 * 将时间戳转换为巴西利亚时间（GMT-3）的 Date 对象
 * @param {number} timestamp - 时间戳（毫秒）
 * @returns {Date} GMT-3 时区的 Date 对象
 */
function toGMT3Date(timestamp) {
  if (!timestamp) {
    return new Date()
  }

  const date = new Date(timestamp)
  // GMT-3 = UTC - 3小时 = UTC - 180分钟
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000)
  return new Date(utcTime - (3 * 3600000))
}

/**
 * 格式化为巴西利亚时间（GMT-3）的相对时间
 * @param {number} timestamp - 时间戳（毫秒）
 * @returns {string} 格式化后的相对时间字符串
 */
function formatRelativeTimeToGMT3(timestamp) {
  if (!timestamp) {
    return '刚刚'
  }

  const date = toGMT3Date(timestamp)
  const diff = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < hour) {
    return `${Math.max(1, Math.floor(diff / minute))} 分钟前`
  }
  if (diff < day) {
    return `${Math.max(1, Math.floor(diff / hour))} 小时前`
  }

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const dayText = String(date.getDate()).padStart(2, '0')
  return `${month}-${dayText}`
}

/**
 * 格式化为巴西利亚时间（GMT-3）的完整日期时间
 * @param {number} timestamp - 时间戳（毫秒）
 * @returns {string} 格式化后的日期时间字符串（YYYY-MM-DD HH:mm:ss）
 */
function formatDateTimeToGMT3(timestamp) {
  if (!timestamp) {
    return ''
  }

  const date = toGMT3Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 格式化为巴西利亚时间（GMT-3）的简短时间
 * @param {number} timestamp - 时间戳（毫秒）
 * @returns {string} 格式化后的时间字符串
 */
function formatTimeToGMT3(timestamp) {
  if (!timestamp) {
    return '刚刚'
  }

  const date = toGMT3Date(timestamp)
  const diff = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < hour) {
    return `${Math.max(1, Math.floor(diff / minute))} 分钟前`
  }
  if (diff < day) {
    return `${Math.max(1, Math.floor(diff / hour))} 小时前`
  }

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const dayText = String(date.getDate()).padStart(2, '0')
  return `${month}-${dayText}`
}

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

function fib(n) {
  if (n < 1) return 0
  if (n <= 2) return 1
  return fib(n - 1) + fib(n - 2)
}

function formatLeadingZeroNumber(n, digitNum = 2) {
  n = n.toString()
  const needNum = Math.max(digitNum - n.length, 0)
  return new Array(needNum).fill(0).join('') + n
}

function formatDateTime(date, withMs = false) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  const ms = date.getMilliseconds()

  let ret = [year, month, day].map(value => formatLeadingZeroNumber(value, 2)).join('-') +
    ' ' + [hour, minute, second].map(value => formatLeadingZeroNumber(value, 2)).join(':')
  if (withMs) {
    ret += '.' + formatLeadingZeroNumber(ms, 3)
  }
  return ret
}

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

module.exports = {
  formatTime,
  formatLocation,
  fib,
  formatDateTime,
  compareVersion,
  showToast,
  toGMT3Date,
  formatRelativeTimeToGMT3,
  formatDateTimeToGMT3,
  formatTimeToGMT3
}
