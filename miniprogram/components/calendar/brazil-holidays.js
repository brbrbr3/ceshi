/**
 * 巴西节假日数据模块
 * 提供巴西联邦法定节假日查询功能
 */

/**
 * 固定日期的联邦法定节假日
 * 格式: { month, day, name, nameCN }
 */
const FIXED_HOLIDAYS = [
  { month: 1, day: 1, name: 'Confraternização Universal', nameCN: '元旦' },
  { month: 4, day: 21, name: 'Tiradentes', nameCN: '蒂拉登特斯日' },
  { month: 5, day: 1, name: 'Dia do Trabalho', nameCN: '劳动节' },
  { month: 9, day: 7, name: 'Independência do Brasil', nameCN: '独立日' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida', nameCN: '阿帕雷西达圣母日' },
  { month: 11, day: 2, name: 'Finados', nameCN: '亡灵节' },
  { month: 11, day: 15, name: 'Proclamação da República', nameCN: '共和国宣言日' },
  { month: 12, day: 25, name: 'Natal', nameCN: '圣诞节' }
]

/**
 * 计算复活节日期（使用高斯算法）
 * @param {number} year 年份
 * @returns {Date} 复活节日期
 */
function calculateEaster(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  
  return new Date(year, month, day)
}

/**
 * 获取基于复活节的移动节日
 * @param {number} year 年份
 * @returns {Array} 移动节日列表
 */
function getMovableHolidays(year) {
  const easter = calculateEaster(year)
  const holidays = []
  
  // 狂欢节：复活节前47天（周二）
  const carnaval = new Date(easter)
  carnaval.setDate(easter.getDate() - 47)
  holidays.push({
    date: formatDateKey(carnaval.getFullYear(), carnaval.getMonth() + 1, carnaval.getDate()),
    name: 'Carnaval',
    nameCN: '狂欢节',
    type: 'movable'
  })
  
  // 受难日：复活节前2天（周五）
  const goodFriday = new Date(easter)
  goodFriday.setDate(easter.getDate() - 2)
  holidays.push({
    date: formatDateKey(goodFriday.getFullYear(), goodFriday.getMonth() + 1, goodFriday.getDate()),
    name: 'Sexta-feira Santa',
    nameCN: '受难日',
    type: 'movable'
  })
  
  // 圣体节：复活节后60天
  const corpusChristi = new Date(easter)
  corpusChristi.setDate(easter.getDate() + 60)
  holidays.push({
    date: formatDateKey(corpusChristi.getFullYear(), corpusChristi.getMonth() + 1, corpusChristi.getDate()),
    name: 'Corpus Christi',
    nameCN: '圣体节',
    type: 'movable'
  })
  
  return holidays
}

/**
 * 格式化日期键
 * @param {number} year 
 * @param {number} month 
 * @param {number} day 
 * @returns {string} YYYY-MM-DD 格式
 */
function formatDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 节假日缓存
 */
const holidayCache = new Map()

/**
 * 获取某年的所有节假日
 * @param {number} year 年份
 * @returns {Array} 节假日列表
 */
function getYearHolidays(year) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year)
  }
  
  const holidays = []
  
  // 添加固定节假日
  FIXED_HOLIDAYS.forEach(h => {
    holidays.push({
      date: formatDateKey(year, h.month, h.day),
      name: h.name,
      nameCN: h.nameCN,
      type: 'fixed'
    })
  })
  
  // 添加移动节假日
  holidays.push(...getMovableHolidays(year))
  
  // 按日期排序
  holidays.sort((a, b) => a.date.localeCompare(b.date))
  
  // 限制缓存大小
  if (holidayCache.size > 10) {
    const firstKey = holidayCache.keys().next().value
    holidayCache.delete(firstKey)
  }
  holidayCache.set(year, holidays)
  
  return holidays
}

/**
 * 获取某日期的节假日信息
 * @param {number} year 年份
 * @param {number} month 月份 (1-12)
 * @param {number} day 日期
 * @returns {Object|null} 节假日信息或null
 */
function getHoliday(year, month, day) {
  const dateKey = formatDateKey(year, month, day)
  const holidays = getYearHolidays(year)
  return holidays.find(h => h.date === dateKey) || null
}

/**
 * 获取某月的所有节假日
 * @param {number} year 年份
 * @param {number} month 月份 (1-12)
 * @returns {Array} 节假日列表
 */
function getMonthHolidays(year, month) {
  const holidays = getYearHolidays(year)
  const monthStr = String(month).padStart(2, '0')
  return holidays.filter(h => h.date.startsWith(`${year}-${monthStr}`))
}

/**
 * 检查某日期是否为节假日
 * @param {number} year 年份
 * @param {number} month 月份 (1-12)
 * @param {number} day 日期
 * @returns {boolean}
 */
function isHoliday(year, month, day) {
  return getHoliday(year, month, day) !== null
}

/**
 * 获取日期的节假日显示文本
 * @param {number} year 年份
 * @param {number} month 月份 (1-12)
 * @param {number} day 日期
 * @returns {string} 节假日名称（中文）或空字符串
 */
function getHolidayDisplayText(year, month, day) {
  const holiday = getHoliday(year, month, day)
  return holiday ? holiday.nameCN : ''
}

module.exports = {
  FIXED_HOLIDAYS,
  getYearHolidays,
  getHoliday,
  getMonthHolidays,
  isHoliday,
  getHolidayDisplayText,
  calculateEaster,
  formatDateKey
}
