/**
 * 农历计算工具模块
 * 提供农历日期计算、节气判断等功能
 */

// 农历数据 1900-2100 年
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520
]

// 天干
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']

// 地支
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

// 生肖
const SHENG_XIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']

// 农历月份
const LUNAR_MONTH = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']

// 农历日期
const LUNAR_DAY = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']

// 节气数据（每两个字节代表一年的24节气，1900-2100年）
const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
]

// 节气计算用表（基于1900年小寒为1月6日）
const SOLAR_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014,
  128867, 150921, 173149, 195551, 218072, 240693,
  263343, 285989, 308563, 331033, 353350, 375494,
  397447, 419210, 440795, 462224, 483532, 504758
]

/**
 * 返回农历y年一整年的总天数
 */
function getLunarYearDays(y) {
  let sum = 348
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0
  }
  return sum + getLeapMonthDays(y)
}

/**
 * 返回农历y年闰月的天数
 */
function getLeapMonthDays(y) {
  if (getLeapMonth(y)) {
    return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29
  }
  return 0
}

/**
 * 返回农历y年闰哪个月 1-12 , 没闰返回 0
 */
function getLeapMonth(y) {
  return LUNAR_INFO[y - 1900] & 0xf
}

/**
 * 返回农历y年m月的总天数
 */
function getLunarMonthDays(y, m) {
  return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29
}

/**
 * 公历转农历
 * @param {number} year 公历年
 * @param {number} month 公历月 (1-12)
 * @param {number} day 公历日
 * @returns {Object} 农历信息
 */
function solarToLunar(year, month, day) {
  // 参数校验
  if (year < 1900 || year > 2100) {
    return { error: '年份超出范围(1900-2100)' }
  }
  if (month < 1 || month > 12) {
    return { error: '月份无效' }
  }
  if (day < 1 || day > 31) {
    return { error: '日期无效' }
  }

  // 计算与1900年1月31日相差的天数
  const baseDate = new Date(1900, 0, 31)
  const targetDate = new Date(year, month - 1, day)
  let offset = Math.floor((targetDate - baseDate) / 86400000)

  // 用offset减去每个农历年的天数，算出当前农历年
  let lunarYear = 1900
  let yearDays = 0
  while (lunarYear < 2101 && offset > 0) {
    yearDays = getLunarYearDays(lunarYear)
    offset -= yearDays
    lunarYear++
  }
  if (offset < 0) {
    offset += yearDays
    lunarYear--
  }

  // 计算农历月
  let lunarMonth = 1
  let leapMonth = getLeapMonth(lunarYear)
  let isLeap = false
  let monthDays = 0

  while (lunarMonth < 13 && offset > 0) {
    // 闰月
    if (leapMonth > 0 && lunarMonth === (leapMonth + 1) && !isLeap) {
      --lunarMonth
      isLeap = true
      monthDays = getLeapMonthDays(lunarYear)
    } else {
      monthDays = getLunarMonthDays(lunarYear, lunarMonth)
    }

    // 解除闰月
    if (isLeap && lunarMonth === (leapMonth + 1)) {
      isLeap = false
    }

    offset -= monthDays
    lunarMonth++
  }

  if (offset < 0) {
    offset += monthDays
    --lunarMonth
  }

  // 重新判断闰月
  if (leapMonth > 0 && lunarMonth === leapMonth + 1) {
    if (isLeap) {
      isLeap = false
    } else {
      isLeap = true
    }
  }

  const lunarDay = offset + 1

  // 计算天干地支
  const ganIndex = (lunarYear - 4) % 10
  const zhiIndex = (lunarYear - 4) % 12

  return {
    lunarYear: lunarYear,
    lunarMonth: lunarMonth,
    lunarDay: lunarDay,
    isLeap: isLeap,
    yearGanZhi: TIAN_GAN[ganIndex] + DI_ZHI[zhiIndex],
    shengXiao: SHENG_XIAO[zhiIndex],
    lunarMonthName: (isLeap ? '闰' : '') + LUNAR_MONTH[lunarMonth - 1] + '月',
    lunarDayName: LUNAR_DAY[lunarDay - 1],
    displayText: LUNAR_DAY[lunarDay - 1] // 用于日历显示
  }
}

/**
 * 计算某年的第n个节气日期
 * @param {number} year 公历年
 * @param {number} n 节气序号 (0-23)
 * @returns {Date} 节气日期
 */
function getSolarTermDate(year, n) {
  // 基于1900年1月6日小寒
  const baseDate = new Date(1900, 0, 6, 2, 5, 0)
  const targetTime = baseDate.getTime() + SOLAR_TERM_INFO[n] * 60000
  
  // 年份修正
  const yearOffset = (year - 1900) * 365.2422 * 24 * 60 * 60000
  const adjustedTime = targetTime + yearOffset
  
  return new Date(adjustedTime)
}

/**
 * 获取某日期的节气
 * @param {number} year 公历年
 * @param {number} month 公历月 (1-12)
 * @param {number} day 公历日
 * @returns {string|null} 节气名称或null
 */
function getSolarTerm(year, month, day) {
  // 每个月有两个节气
  const termIndex1 = (month - 1) * 2      // 上旬节气
  const termIndex2 = (month - 1) * 2 + 1  // 下旬节气

  const termDate1 = getSolarTermDate(year, termIndex1)
  const termDate2 = getSolarTermDate(year, termIndex2)

  if (termDate1.getDate() === day) {
    return SOLAR_TERMS[termIndex1]
  }
  if (termDate2.getDate() === day) {
    return SOLAR_TERMS[termIndex2]
  }

  return null
}

/**
 * 获取某日期的完整信息（包含农历和节气）
 * @param {number} timestamp 时间戳
 * @returns {Object} 完整日期信息
 */
function getDateInfo(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  const lunar = solarToLunar(year, month, day)
  const solarTerm = getSolarTerm(year, month, day)

  // 如果是节气，显示节气名称；否则显示农历日期
  const displayText = solarTerm || lunar.displayText

  return {
    year: year,
    month: month,
    day: day,
    weekday: date.getDay(), // 0=周日
    lunar: lunar,
    solarTerm: solarTerm,
    displayText: displayText
  }
}

/**
 * 农历计算缓存
 */
const lunarCache = new Map()

/**
 * 带缓存的农历计算
 * @param {number} year 
 * @param {number} month 
 * @param {number} day 
 * @returns {Object}
 */
function getCachedLunar(year, month, day) {
  const key = `${year}-${month}-${day}`
  if (lunarCache.has(key)) {
    return lunarCache.get(key)
  }
  const result = solarToLunar(year, month, day)
  // 限制缓存大小
  if (lunarCache.size > 1000) {
    const firstKey = lunarCache.keys().next().value
    lunarCache.delete(firstKey)
  }
  lunarCache.set(key, result)
  return result
}

/**
 * 带缓存的节气计算
 */
const termCache = new Map()

function getCachedSolarTerm(year, month, day) {
  const key = `${year}-${month}-${day}`
  if (termCache.has(key)) {
    return termCache.get(key)
  }
  const result = getSolarTerm(year, month, day)
  if (termCache.size > 1000) {
    const firstKey = termCache.keys().next().value
    termCache.delete(firstKey)
  }
  termCache.set(key, result)
  return result
}

/**
 * 获取带缓存的日期信息（用于日历渲染）
 * @param {number} timestamp 时间戳
 * @returns {Object}
 */
function getDateInfoCached(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  const lunar = getCachedLunar(year, month, day)
  const solarTerm = getCachedSolarTerm(year, month, day)

  return {
    year: year,
    month: month,
    day: day,
    weekday: date.getDay(),
    lunar: lunar,
    solarTerm: solarTerm,
    displayText: solarTerm || lunar.displayText
  }
}

module.exports = {
  solarToLunar,
  getSolarTerm,
  getDateInfo,
  getDateInfoCached,
  getCachedLunar,
  getCachedSolarTerm,
  TIAN_GAN,
  DI_ZHI,
  SHENG_XIAO,
  LUNAR_MONTH,
  LUNAR_DAY,
  SOLAR_TERMS
}
