/**
 * 休假管理云函数
 *
 * 支持的 action：
 *   - initSetup         首次配置（填写日期+剩余配额，初始化 leave_quotas）
 *   - getMyQuotas       获取我的假期配额（含 annualLeaveUsageByYear、任期假有效期）
 *   - calculateDays     计算休假天数（前端实时预览，兼容"其他"类型）
 *   - calculatePlans    计算两种休假方案（先用年休假 / 先用任期假）
 *   - submit            提交休假申请（校验配额+创建记录+启动工作流）
 *   - supplementRecord  补填过往休假记录（直接创建+立即扣减配额）
 *   - getMyRecords      获取我的休假记录（分页）
 *   - getRecordDetail   获取记录详情
 *   - checkExpiry       定时触发：检查到期作废
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 集合引用
const quotasCollection = db.collection('leave_quotas')
const recordsCollection = db.collection('leave_records')
const holidayConfigsCollection = db.collection('holiday_configs')
const usersCollection = db.collection('office_users')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data !== undefined ? data : {} }
}
function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

// ==================== 常量定义 ====================

/** 休假类型 */
const LEAVE_TYPES = {
  ANNUAL: 'annual',           // 年休假
  TERM: 'term',               // 任期假
  COMBO_ANNUAL_TERM: 'combo_annual_term', // 年休假+任期假
  COMBO_TERM_ANNUAL: 'combo_term_annual', // 任期假+年休假
  HOLIDAY: 'holiday',          // 法定节假日
  OTHER: 'other'              // 其他
}

/** 年休假天数规则：按工作年限 */
function getAnnualQuotaByWorkYears(workStartDateStr, targetYear) {
  const workStart = parseLocalDate(workStartDateStr)
  if (!workStart) return { totalDays: 0, reason: 'invalid_work_start_date' }

  const endOfYear = new Date(targetYear, 11, 31)
  const workYears = (endOfYear.getTime() - workStart.getTime()) / (365.25 * 24 * 3600 * 1000)

  if (workYears < 10) return { totalDays: 5 }
  if (workYears <= 20) return { totalDays: 10 }
  return { totalDays: 15 }
}

/** 任期假规则：按到任月数计算可申请次数 */
const TERM_LEAVE_RULES = [
  { round: 1, monthsAfterArrival: 6 },   // 6个月
  { round: 2, monthsAfterArrival: 24 },  // 2年
  { round: 3, monthsAfterArrival: 36 },  // 3年
  { round: 4, monthsAfterArrival: 48 },  // 4年
  { round: 5, monthsAfterArrival: 60 },  // 5年
  { round: 6, monthsAfterArrival: 72 },  // 6年
  { round: 7, monthsAfterArrival: 84 },  // 7年
  { round: 8, monthsAfterArrival: 96 }   // 8年
]

/** 任期假每次天数 */
const TERM_LEAVE_DAYS_PER_ROUND = 20
const TERM_LEAVE_RETURN_BONUS_DAYS = 2  // 回国额外增加的天数

// ==================== 工具函数 ====================

/**
 * 解析纯日期字符串 YYYY-MM-DD 为本地 Date 对象（避免时区问题）
 */
function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const parts = dateStr.split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts.map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d)
}

/**
 * Date 对象转 YYYY-MM-DD 字符串
 */
function formatDateObj(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 计算两个日期之间的自然日天数
 */
function countCalendarDays(startStr, endStr) {
  const start = parseLocalDate(startStr)
  const end = parseLocalDate(endStr)
  if (!start || !end || end < start) return 0
  return Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1
}

/**
 * 计算工作日天数（排除周六日和法定节假日）
 */
async function countWorkDays(startStr, endStr) {
  const start = parseLocalDate(startStr)
  const end = parseLocalDate(endStr)
  if (!start || !end || end < start) return 0

  const years = []
  const startY = start.getFullYear()
  const endY = end.getFullYear()
  for (let y = startY; y <= endY; y++) years.push(y)

  // 获取法定节假日集合
  const holidayDatesSet = await fetchHolidayDates(years)

  let workDayCount = 0
  const current = new Date(start)
  while (current <= end) {
    const dayOfWeek = current.getDay()
    // 排除周六(6)和周日(0)，排除法定节假日
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dStr = formatDateObj(current)
      if (!holidayDatesSet.has(dStr)) {
        workDayCount++
      }
    }
    current.setDate(current.getDate() + 1)
  }
  return workDayCount
}

/**
 * 从 holiday_configs 集合获取指定年份的法定节假日
 */
async function fetchHolidayDates(years) {
  const datesSet = new Set()
  try {
    for (const year of years) {
      const res = await holidayConfigsCollection.where({ year }).limit(1).get()
      if (res.data && res.data.length > 0 && res.data[0].dates) {
        res.data[0].dates.forEach(d => datesSet.add(d))
      }
    }
  } catch (e) {
    console.error('[leaveManager] 获取节假日失败:', e)
  }
  return datesSet
}

/**
 * 获取用户信息
 */
async function getUserInfo(openid) {
  const userRes = await usersCollection.where({ openid, status: 'approved' }).limit(1).get()
  return userRes.data.length > 0 ? userRes.data[0] : null
}

/**
 * 初始化或获取用户配额文档
 */
async function getOrCreateQuotaDoc(openid, userInfo) {
  const quotaRes = await quotasCollection.where({ openid }).limit(1).get()
  if (quotaRes.data && quotaRes.data.length > 0) {
    return quotaRes.data[0]
  }
  return null
}

/**
 * 计算并构建年度年休假配额列表
 * 规则：
 *   - 到任日期当年为 0
 *   - 到任日期第二自然年起开始拥有
 *   - 每个自然年的配额按工作年限计算（<10y=5天, 10-20y=10天, >=20y=15天）
 *   - 有效期至次年3月31日
 */
function buildAnnualLeaveQuotas(workStartDateStr, arrivalDateStr, nowYear) {
  const arrivalYear = parseInt(arrivalDateStr.substring(0, 4), 10)
  const annualLeaves = []

  // 从到任日期的第二年开始算起
  for (let year = arrivalYear + 1; year <= nowYear; year++) {
    const quotaInfo = getAnnualQuotaByWorkYears(workStartDateStr, year)
    annualLeaves.push({
      year,
      extendedTo: `${year + 1}-03-31`,
      totalDays: quotaInfo.totalDays,
      usedDays: 0,
      expiredDays: 0,
      availableDays: quotaInfo.totalDays,
      status: year === nowYear ? 'active' : 'expired'
    })
  }

  // 处理跨年度延期：如果当前在Q1（1-3月），上一年度可能还有未过期的配额
  const currentMonth = new Date().getMonth() + 1
  if (currentMonth <= 3 && nowYear > arrivalYear + 1) {
    const prevYearIndex = annualLeaves.findIndex(a => a.year === nowYear - 1)
    if (prevYearIndex >= 0) {
      annualLeaves[prevYearIndex].status = 'active' // Q1内仍有效
    }
  }

  return annualLeaves
}

/**
 * 构建任期假配额列表
 */
function buildTermLeaveQuotas(arrivalDateStr) {
  const termLeaves = []
  TERM_LEAVE_RULES.forEach(rule => {
    termLeaves.push({
      round: rule.round,
      eligibleDate: '', // 由 initSetup 时根据 arrivalDate 计算
      totalDays: TERM_LEAVE_DAYS_PER_ROUND,
      usedDays: 0,
      availableDays: TERM_LEAVE_DAYS_PER_ROUND,
      used: false,
      usedRecordId: null,
      isReturnToHome: null,
      expiryDate: '',          // [NEW] 有效期截止
      publicExpenseUsed: false, // [NEW] 该轮次是否已使用过公费机会
      returnToHomeUsed: false   // [NEW] 该轮次是否已使用过回国+2天机会
    })
  })
  return termLeaves
}

/**
 * 计算任期假有效期
 * 规则：第X次任期假有效期至第X+1任期年的最后一天
 * 例如：比如一个人2019-10-06到任，那他第1次任期假有效期是第2任期年（2020-10-06~2021-10-05）的最后一天（即2021-10-05）
 */
function buildExpiryDate(arrivalDateStr, round) {
  const arrival = parseLocalDate(arrivalDateStr)
  if (!arrival) return ''
  // 第X次任期假有效期至第X+1任期年的最后一天
  // 第X+1任期年 = 到任日期 + (X+1)*12个月 - 1天
  const expiry = new Date(arrival)
  expiry.setMonth(expiry.getMonth() + (round + 1) * 12)
  expiry.setDate(expiry.getDate() - 1)  // 减1天=任期年最后一天
  const y = expiry.getFullYear()
  const m = String(expiry.getMonth() + 1).padStart(2, '0')
  const d = String(expiry.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 获取某年已使用年休假/任期假的休假次数
 * 统计口径：以休假开始日期的年份统计
 */
function getLeaveUsageCountForYear(quota, year) {
  if (!quota.annualLeaveUsageByYear) return 0
  const record = quota.annualLeaveUsageByYear[String(year)]
  return record ? record.count : 0
}

/**
 * 获取活跃的年休假配额列表（按年份升序，未过期且有余额）
 */
function getActiveAnnualLeaves(quota) {
  if (!quota.annualLeaves) return []
  const today = formatDateObj(new Date())
  return quota.annualLeaves
    .filter(a => a.availableDays > 0 && a.extendedTo >= today)
    .sort((a, b) => a.year - b.year)
}

/**
 * 获取活跃的任期假配额列表（按轮次升序，未过期且有余额）
 */
function getActiveTermLeaves(quota) {
  if (!quota.termLeaves) return []
  const today = formatDateObj(new Date())
  return quota.termLeaves
    .filter(t => {
      if (t.used) return false
      const avail = t.availableDays !== undefined ? t.availableDays : TERM_LEAVE_DAYS_PER_ROUND
      if (avail <= 0) return false
      // 检查是否过期
      if (t.expiryDate && t.expiryDate < today) return false
      // 检查是否已到可申请日期
      if (t.eligibleDate && t.eligibleDate > today) return false
      return true
    })
    .sort((a, b) => a.round - b.round)
}

/**
 * 计算年休假配额消耗覆盖的日历天数
 * 从 currentCursor 日期开始，消耗 workDaysCount 个工作日配额，
 * 返回覆盖的日历天数和新的日期游标
 * @param {string} startCursor - 开始日期 YYYY-MM-DD
 * @param {number} workDaysCount - 要消耗的工作日配额天数
 * @param {Set} holidayDatesSet - 节假日日期集合
 * @returns {{ coveredCalendarDays: number, endCursor: string }}
 */
function calculateAnnualCoverage(startCursor, workDaysCount, holidayDatesSet) {
  let cursor = parseLocalDate(startCursor)
  let remaining = workDaysCount
  let coveredDays = 0

  while (remaining > 0) {
    const dayOfWeek = cursor.getDay()
    const dateStr = formatDateObj(cursor)
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHoliday = holidayDatesSet.has(dateStr)

    if (!isWeekend && !isHoliday) {
      remaining--
    }
    coveredDays++
    cursor.setDate(cursor.getDate() + 1)
  }

  // cursor 现在指向最后一个工作日的下一天，回退一天得到实际覆盖的最后日期
  cursor.setDate(cursor.getDate() - 1)
  return {
    coveredCalendarDays: coveredDays,
    endCursor: formatDateObj(cursor)
  }
}

/**
 * 根据方案的实际消耗类型动态生成标签
 * - 只用年休假 → "使用年休假"
 * - 只用任期假 → "使用任期假"
 * - 二者都用 → "先用年休假，再用任期假" 或 "先用任期假，再用年休假"
 * - 二者都没用 → "使用法定节假日和公休日" 等
 */
function buildPlanLabel(plan) {
  const hasAnnual = plan.consumed && plan.consumed.some(c => c.type === 'annual')
  const hasTerm = plan.consumed && plan.consumed.some(c => c.type === 'term')
  const hasConsumed = plan.consumed && plan.consumed.length > 0

  if (hasConsumed && hasAnnual && hasTerm) {
    // 两者都用了，根据消耗顺序决定标签
    const firstType = plan.consumed[0].type
    if (firstType === 'annual') return '先用年休假，再用任期假'
    return '先用任期假，再用年休假'
  }
  if (hasConsumed && hasAnnual && !hasTerm) return '使用年休假'
  if (hasConsumed && hasTerm && !hasAnnual) return '使用任期假'

  // 没有消耗配额，只用法定节假日和/或公休日
  const parts = []
  if (plan.holidayCoveredDays > 0) parts.push('法定节假日')
  if (plan.weekendCoveredDays > 0) parts.push('公休日')
  if (parts.length > 0) return '使用' + parts.join('和')
  return '无需配额'
}

/**
 * 核心算法：计算两种方案的配额消耗
 * 
 * 方案A（先用年休假）：去年年假 → 今年年假 → 前一次任期假 → 当次任期假
 * 方案B（先用任期假）：前一次任期假 → 当次任期假 → 去年年假 → 今年年假
 * 
 * 关键规则：
 * - 年休假按工作日消耗，1配额日=1个日历工作日，但跳过周末和节假日
 * - 任期假按自然日连续消耗
 * - 第2次休假必须消耗所有剩余配额
 * - 任期假回国+2天和公费使用受"机会制"限制
 */
async function calculatePlanConsumption(startDate, endDate, isReturnToHome, quota) {
  const neededCalendarDays = countCalendarDays(startDate, endDate)
  if (neededCalendarDays <= 0) return { planA: null, planB: null }

  // 获取节假日数据
  const startY = parseLocalDate(startDate).getFullYear()
  const endY = parseLocalDate(endDate).getFullYear()
  const years = []
  for (let y = startY; y <= endY; y++) years.push(y)
  const holidayDatesSet = await fetchHolidayDates(years)

  // 获取活跃配额
  const activeAnnual = getActiveAnnualLeaves(quota)
  const activeTerm = getActiveTermLeaves(quota)

  // 检查是否为第2次（必须全部用完）
  const startYear = parseLocalDate(startDate).getFullYear()
  const usageCount = getLeaveUsageCountForYear(quota, startYear)
  const isSecondLeave = usageCount >= 1 // 已有1次，本次为第2次

  // 计算从 startCursor 到 endDate 之间剩余的工作日数
  function countWorkDaysBetween(startStr, endStr, holidaySet) {
    let cursor = parseLocalDate(startStr)
    const end = parseLocalDate(endStr)
    if (!cursor || !end || cursor > end) return 0
    let count = 0
    while (cursor <= end) {
      const dow = cursor.getDay()
      const dStr = formatDateObj(cursor)
      if (dow !== 0 && dow !== 6 && !holidaySet.has(dStr)) {
        count++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return count
  }

  // 计算单个方案
  function computePlan(poolOrder) {
    const consumed = []
    let currentCursor = startDate
    let totalCoveredDays = 0
    let returnBonusUsedInThisLeave = false // 同一次休假中，+2天机会只能使用一次

    // 计算用户选择的日期范围总日历天数
    const totalCalendarDays = countCalendarDays(startDate, endDate)

    for (const item of poolOrder) {
      // 检查游标是否已超过用户选择的结束日期
      if (parseLocalDate(currentCursor) > parseLocalDate(endDate)) break

      if (item.type === 'annual') {
        // 计算从当前游标到用户选择的 endDate 之间还有多少工作日
        const remainingWorkDays = countWorkDaysBetween(currentCursor, endDate, holidayDatesSet)
        if (remainingWorkDays <= 0) break

        const consumeDays = Math.min(item.availableDays, remainingWorkDays)
        if (consumeDays <= 0) continue

        // 计算年休假消耗 consumeDays 个工作日覆盖的日历天数
        const coverage = calculateAnnualCoverage(currentCursor, consumeDays, holidayDatesSet)
        consumed.push({
          type: 'annual',
          year: item.year,
          consumeDays,           // 消耗的配额天数（工作日）
          coveredCalendarDays: coverage.coveredCalendarDays,
          startDate: currentCursor,
          endDate: coverage.endCursor
        })
        totalCoveredDays += coverage.coveredCalendarDays
        // 更新游标：指向覆盖结束日期的下一天
        const nextCursor = parseLocalDate(coverage.endCursor)
        nextCursor.setDate(nextCursor.getDate() + 1)
        currentCursor = formatDateObj(nextCursor)
      } else if (item.type === 'term') {
        // 任期假天数：包含回国+2天机会
        // 规则：同一次休假中+2天机会只能使用一次，优先使用轮次较小的（y-1次优先于y次）
        let availableTermDays = item.availableDays
        let canUseReturnBonus = false
        if (!item.returnToHomeUsed && isReturnToHome && !returnBonusUsedInThisLeave) {
          canUseReturnBonus = true
          availableTermDays += TERM_LEAVE_RETURN_BONUS_DAYS
        }

        // 计算从当前游标到用户选择的 endDate 之间还有多少日历天
        const remainingCalendarDays = countCalendarDays(currentCursor, endDate)
        if (remainingCalendarDays <= 0) break

        const consumeDays = Math.min(availableTermDays, remainingCalendarDays)
        if (consumeDays <= 0) continue

        // 任期假从 currentCursor 开始，按自然日连续消耗
        const termStartCursor = parseLocalDate(currentCursor)
        const termEndDate = new Date(termStartCursor)
        termEndDate.setDate(termEndDate.getDate() + consumeDays - 1)

        // 判断本次消耗中是否使用了回国+2天
        const usedReturnBonus = canUseReturnBonus && consumeDays > item.availableDays
        if (usedReturnBonus) {
          returnBonusUsedInThisLeave = true // 标记+2天机会已在本休假中使用
        }
        const actualTermQuotaConsumed = usedReturnBonus
          ? Math.min(item.availableDays, consumeDays) // 不含+2天的配额消耗
          : consumeDays

        consumed.push({
          type: 'term',
          round: item.round,
          consumeDays: actualTermQuotaConsumed,
          coveredCalendarDays: consumeDays,
          startDate: currentCursor,
          endDate: formatDateObj(termEndDate),
          usedReturnBonus,
          canUsePublicExpense: !item.publicExpenseUsed // 公费是否可用
        })
        totalCoveredDays += consumeDays
        // 更新游标
        const nextCursor = new Date(termEndDate)
        nextCursor.setDate(nextCursor.getDate() + 1)
        currentCursor = formatDateObj(nextCursor)
      }
    }

    // canCover: currentCursor 已超过 endDate，或者从 currentCursor 到 endDate 之间没有更多工作日需要覆盖
    const canCover = currentCursor > endDate ||
                     countWorkDaysBetween(currentCursor, endDate, holidayDatesSet) === 0

    // 如果是第2次休假，校验是否消耗了所有剩余配额
    let mustUseAllSatisfied = true
    if (isSecondLeave && canCover) {
      // 计算方案中未消耗的年休假和任期假剩余
      let remainingAnnual = 0
      let remainingTerm = 0
      const consumedAnnualYears = new Set(consumed.filter(c => c.type === 'annual').map(c => c.year))
      const consumedTermRounds = new Set(consumed.filter(c => c.type === 'term').map(c => c.round))

      activeAnnual.forEach(a => {
        const consumedItem = consumed.find(c => c.type === 'annual' && c.year === a.year)
        const left = consumedItem ? a.availableDays - consumedItem.consumeDays : a.availableDays
        remainingAnnual += left
      })
      activeTerm.forEach(t => {
        const consumedItem = consumed.find(c => c.type === 'term' && c.round === t.round)
        const left = consumedItem ? t.availableDays - consumedItem.consumeDays : t.availableDays
        remainingTerm += left
      })

      if (remainingAnnual > 0 || remainingTerm > 0) {
        mustUseAllSatisfied = false
      }
    }

    // 计算实际覆盖的日历天数
    // 当 canCover 为 true 时，整个日期范围都被覆盖（配额+法定节假日+公休日）
    // 当 canCover 为 false 时，只计算配额消耗覆盖的范围
    let actualCoveredDays = 0
    if (canCover) {
      actualCoveredDays = neededCalendarDays
    } else if (consumed.length > 0) {
      const firstStart = consumed[0].startDate
      const lastEnd = consumed[consumed.length - 1].endDate
      actualCoveredDays = countCalendarDays(firstStart, lastEnd)
    }

    // 统计未被年休假/任期假覆盖的日期中，法定节假日和公休日的天数
    let holidayCoveredDays = 0
    let weekendCoveredDays = 0
    // 确定"未被配额覆盖"的日期范围
    let uncoveredStart = startDate
    let uncoveredEnd = endDate
    if (consumed.length > 0) {
      // consumed 中的配额覆盖范围：从 consumed[0].startDate 到 consumed[consumed.length-1].endDate
      // 需要统计 consumed 覆盖范围内以及之外的法定节假日/公休日
      // 简化：统计整个日期范围内的法定节假日和公休日天数
    }
    // 统计整个日期范围内的法定节假日天数和公休日天数
    let rangeCursor = parseLocalDate(startDate)
    const rangeEnd = parseLocalDate(endDate)
    while (rangeCursor <= rangeEnd) {
      const dow = rangeCursor.getDay()
      const dStr = formatDateObj(rangeCursor)
      const isWeekend = dow === 0 || dow === 6
      const isHoliday = holidayDatesSet.has(dStr)
      if (isHoliday) {
        holidayCoveredDays++
      } else if (isWeekend) {
        weekendCoveredDays++
      }
      rangeCursor.setDate(rangeCursor.getDate() + 1)
    }

    return {
      canCover,
      mustUseAllSatisfied: isSecondLeave ? mustUseAllSatisfied : true,
      consumed,
      totalCoveredDays: actualCoveredDays,
      holidayCoveredDays,
      weekendCoveredDays,
      uncoveredDays: canCover ? 0 : countCalendarDays(consumed.length > 0 ? consumed[consumed.length - 1].endDate : startDate, endDate) - 1
    }
  }

  // 构建有序配额池
  const poolA = [
    ...activeAnnual.map(a => ({ type: 'annual', ...a })),
    ...activeTerm.map(t => ({ type: 'term', ...t }))
  ]
  const poolB = [
    ...activeTerm.map(t => ({ type: 'term', ...t })),
    ...activeAnnual.map(a => ({ type: 'annual', ...a }))
  ]

  const planA = computePlan(poolA)
  // 当没有可用任期假时，方案B等同于方案A，不生成
  const planB = activeTerm.length > 0 ? computePlan(poolB) : null

  // 添加方案标签（根据实际消耗类型动态生成）
  if (planA) {
    planA.label = buildPlanLabel(planA)
    planA.planKey = 'A'
  }
  if (planB) {
    planB.label = buildPlanLabel(planB)
    planB.planKey = 'B'
  }

  return { planA, planB, isSecondLeave, usageCount }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, params } = event

  console.log(`[leaveManager] action=${action}, openid=${openid}`)

  try {
    switch (action) {

      // ========== initSetup: 首次配置 ==========
      case 'initSetup': {
        const {
          workStartDate, arrivalDate,
          annualRemainingCurrent, annualRemainingPrev,
          termRemainingCurrent, termRemainingPrev,
          maxTermRound, needPrevAnnual, needPrevTerm,
          prevTermReturnToHome, prevTermPublicExpense,
          currentTermReturnToHome, currentTermPublicExpense
        } = params || {}
        if (!workStartDate || !arrivalDate) return fail('请填写参加工作日期和到任日期', 400)

        const userInfo = await getUserInfo(openid)
        if (!userInfo) return fail('未找到用户信息', 403)

        const nowYear = new Date().getFullYear()
        const arrivalYear = parseInt(arrivalDate.substring(0, 4), 10)

        // 构建年休假配额
        const annualQuotas = buildAnnualLeaveQuotas(workStartDate, arrivalDate, nowYear)

        // 如果到任今年，年休假配额为空，不需要处理
        if (arrivalYear === nowYear) {
          // 到任当年无年休假，annualQuotas 应为空
        } else {
          // 按年度精确分配剩余天数
          // 如果 needPrevAnnual（Q1 + 到任年份 <= x-2），分别设置 x-1 和 x 年
          if (needPrevAnnual) {
            const prevYearQuota = annualQuotas.find(a => a.year === nowYear - 1)
            const currentYearQuota = annualQuotas.find(a => a.year === nowYear)
            if (prevYearQuota) {
              const prevRemaining = Math.min(annualRemainingPrev || 0, prevYearQuota.totalDays)
              prevYearQuota.usedDays = prevYearQuota.totalDays - prevRemaining
              prevYearQuota.availableDays = prevRemaining
            }
            if (currentYearQuota) {
              const curRemaining = Math.min(annualRemainingCurrent || 0, currentYearQuota.totalDays)
              currentYearQuota.usedDays = currentYearQuota.totalDays - curRemaining
              currentYearQuota.availableDays = curRemaining
            }
          } else {
            // 只需填写 x 年剩余
            const currentYearQuota = annualQuotas.find(a => a.year === nowYear)
            if (currentYearQuota) {
              const curRemaining = Math.min(annualRemainingCurrent || 0, currentYearQuota.totalDays)
              currentYearQuota.usedDays = currentYearQuota.totalDays - curRemaining
              currentYearQuota.availableDays = curRemaining
            }
          }

          // 处理已过期年度：标记为 expired
          annualQuotas.forEach(a => {
            if (a.status === 'expired' && a.availableDays > 0) {
              a.expiredDays = a.availableDays
              a.usedDays += a.availableDays
              a.availableDays = 0
            }
          })
        }

        // 构建任期假配额
        const termQuotas = buildTermLeaveQuotas(arrivalDate)

        // 根据到任日期计算每个任期假的 eligibleDate 和 expiryDate
        const arrival = parseLocalDate(arrivalDate)
        TERM_LEAVE_RULES.forEach((rule, i) => {
          if (termQuotas[i]) {
            const eligible = new Date(arrival)
            eligible.setMonth(eligible.getMonth() + rule.monthsAfterArrival)
            termQuotas[i].eligibleDate = formatDateObj(eligible)
            termQuotas[i].expiryDate = buildExpiryDate(arrivalDate, rule.round)
          }
        })

        // 按天数初始化任期假
        const effectiveMaxRound = maxTermRound || 0
        for (let i = 0; i < termQuotas.length; i++) {
          const round = termQuotas[i].round
          if (round > effectiveMaxRound) {
            // 还未到任满对应月数，保持默认可用
            continue
          }
          if (needPrevTerm && round === effectiveMaxRound - 1) {
            // 第 y-1 次任期假：用户填写剩余天数
            const prevRemaining = Math.min(termRemainingPrev || 0, TERM_LEAVE_DAYS_PER_ROUND)
            termQuotas[i].usedDays = TERM_LEAVE_DAYS_PER_ROUND - prevRemaining
            termQuotas[i].availableDays = prevRemaining
            if (prevRemaining <= 0) {
              termQuotas[i].used = true
            }
            // 设置回国+2天和公费使用状态
            termQuotas[i].isReturnToHome = !!prevTermReturnToHome
            termQuotas[i].returnToHomeUsed = !!prevTermReturnToHome
            termQuotas[i].publicExpenseUsed = !!prevTermPublicExpense
          } else if (round === effectiveMaxRound) {
            // 第 y 次任期假：用户填写剩余天数
            const curRemaining = Math.min(termRemainingCurrent || 0, TERM_LEAVE_DAYS_PER_ROUND)
            termQuotas[i].usedDays = TERM_LEAVE_DAYS_PER_ROUND - curRemaining
            termQuotas[i].availableDays = curRemaining
            if (curRemaining <= 0) {
              termQuotas[i].used = true
            }
            // 设置回国+2天和公费使用状态
            termQuotas[i].isReturnToHome = !!currentTermReturnToHome
            termQuotas[i].returnToHomeUsed = !!currentTermReturnToHome
            termQuotas[i].publicExpenseUsed = !!currentTermPublicExpense
          } else if (round < effectiveMaxRound - 1) {
            // 更早的任期假轮次（round < y-1），标记为已用完
            termQuotas[i].used = true
            termQuotas[i].usedDays = TERM_LEAVE_DAYS_PER_ROUND
            termQuotas[i].availableDays = 0
            termQuotas[i].isReturnToHome = true
            termQuotas[i].returnToHomeUsed = true
            termQuotas[i].publicExpenseUsed = true
          }
        }

        const now = Date.now()
        const quotaData = {
          openid,
          name: userInfo.name || '',
          workStartDate,
          arrivalDate,
          isConfigured: true,
          annualLeaves: annualQuotas,
          termLeaves: termQuotas,
          annualLeaveUsageByYear: {},  // [NEW] 每年使用次数追踪，按需填充
          totalAnnualUsed: annualQuotas.reduce((sum, a) => sum + a.usedDays, 0),
          totalTermUsed: termQuotas.filter(t => t.used).length,
          createdAt: now,
          updatedAt: now
        }

        // 检查是否已有配额文档
        const existing = await getOrCreateQuotaDoc(openid, userInfo)
        if (existing) {
          await quotasCollection.doc(existing._id).update({ data: quotaData })
        } else {
          await quotasCollection.add({ data: quotaData })
        }

        return success(quotaData, '首次配置完成')
      }

      // ========== getMyQuotas: 获取我的假期配额 ==========
      case 'getMyQuotas': {
        const quota = await getOrCreateQuotaDoc(openid, {})
        if (!quota) return success(null)

        // 补充任期假 expiryDate（兼容旧数据）
        if (quota.termLeaves && quota.arrivalDate) {
          quota.termLeaves.forEach(t => {
            if (!t.expiryDate) {
              t.expiryDate = buildExpiryDate(quota.arrivalDate, t.round)
            }
            if (t.publicExpenseUsed === undefined) {
              t.publicExpenseUsed = false
            }
            if (t.returnToHomeUsed === undefined) {
              t.returnToHomeUsed = false
            }
          })
        }

        // 确保 annualLeaveUsageByYear 存在
        if (!quota.annualLeaveUsageByYear) {
          quota.annualLeaveUsageByYear = {}
        }

        // 构建余额卡片信息
        const nowYear = new Date().getFullYear()
        const activeAnnual = getActiveAnnualLeaves(quota)
        const activeTerm = getActiveTermLeaves(quota)

        const annualTotalAvailable = activeAnnual.reduce((sum, a) => sum + a.availableDays, 0)
        const termTotalAvailable = activeTerm.reduce((sum, t) => sum + (t.availableDays || 0), 0)

        // 当前年份已使用次数
        const usageCountThisYear = getLeaveUsageCountForYear(quota, nowYear)

        const quotaSummary = {
          year: nowYear,
          annual: {
            totalAvailable: annualTotalAvailable,
            details: activeAnnual.map(a => ({
              year: a.year,
              availableDays: a.availableDays,
              totalDays: a.totalDays,
              extendedTo: a.extendedTo,
              status: a.status
            }))
          },
          term: {
            totalAvailable: termTotalAvailable,
            details: activeTerm.map(t => ({
              round: t.round,
              availableDays: t.availableDays,
              totalDays: t.totalDays,
              expiryDate: t.expiryDate || '',
              publicExpenseUsed: !!t.publicExpenseUsed,
              returnToHomeUsed: !!t.returnToHomeUsed,
              canUsePublicExpense: !t.publicExpenseUsed,
              canUseReturnBonus: !t.returnToHomeUsed
            }))
          },
          usageCountThisYear,
          canApplyThisYear: usageCountThisYear < 2,
          isSecondMustUseAll: usageCountThisYear >= 1
        }

        return success({ quota, quotaSummary })
      }

      // ========== calculateDays: 计算休假天数（前端预览，兼容"其他"类型）==========
      case 'calculateDays': {
        const { startDate, endDate, leaveType, isReturnToHome } = params || {}
        if (!startDate || !endDate) return fail('请选择起止日期', 400)

        const calendarDays = countCalendarDays(startDate, endDate)
        const workDays = await countWorkDays(startDate, endDate)

        const result = {
          calendarDays,
          workDays,
          leaveType,
          startDate,
          endDate,
          isReturnToHome: !!isReturnToHome
        }

        // 任期假天数（含回国路程假）
        if (leaveType === LEAVE_TYPES.TERM) {
          result.termTotalDays = isReturnToHome ? (calendarDays + TERM_LEAVE_RETURN_BONUS_DAYS) : calendarDays
        }

        return success(result)
      }

      // ========== calculatePlans: 计算两种休假方案 ==========
      case 'calculatePlans': {
        const { startDate, endDate, isReturnToHome } = params || {}
        if (!startDate || !endDate) return fail('请选择起止日期', 400)

        const quota = await getOrCreateQuotaDoc(openid, {})
        if (!quota || !quota.isConfigured) return fail('请先完成休假信息首次配置', 403)

        // 检查每年两次限制
        const startYear = parseLocalDate(startDate).getFullYear()
        const usageCount = getLeaveUsageCountForYear(quota, startYear)
        if (usageCount >= 2) {
          return fail(`${startYear}年已使用${usageCount}次年休假/任期假，无法再申请`, 400)
        }

        // 计算两种方案
        const { planA, planB, isSecondLeave } = await calculatePlanConsumption(
          startDate, endDate, !!isReturnToHome, quota
        )

        // 只返回能覆盖的方案
        const availablePlans = []
        if (planA && planA.canCover && planA.mustUseAllSatisfied) {
          availablePlans.push(planA)
        }
        if (planB && planB.canCover && planB.mustUseAllSatisfied) {
          availablePlans.push(planB)
        }

        // 如果是第2次休假但不满足"全部用完"要求，也要返回那些方案但标记问题
        if (isSecondLeave) {
          if (planA && planA.canCover && !planA.mustUseAllSatisfied) {
            planA.secondLeaveWarning = '第2次休假必须消耗所有剩余年休假和任期假'
            availablePlans.push(planA)
          }
          if (planB && planB.canCover && !planB.mustUseAllSatisfied) {
            planB.secondLeaveWarning = '第2次休假必须消耗所有剩余年休假和任期假'
            availablePlans.push(planB)
          }
        }

        // 自动选中逻辑：只有一个方案时自动选中
        const autoSelected = availablePlans.length === 1 ? availablePlans[0].planKey : null

        // 任期假公费和回国+2天可用性提示
        const activeTermLeaves = getActiveTermLeaves(quota)
        const termAvailability = activeTermLeaves.map(t => ({
          round: t.round,
          availableDays: t.availableDays,
          expiryDate: t.expiryDate || '',
          publicExpenseUsed: !!t.publicExpenseUsed,
          returnToHomeUsed: !!t.returnToHomeUsed,
          canUsePublicExpense: !t.publicExpenseUsed,
          canUseReturnBonus: !t.returnToHomeUsed
        }))

        return success({
          availablePlans,
          autoSelected,
          isSecondLeave,
          usageCount,
          termAvailability,
          startDate,
          endDate,
          isReturnToHome: !!isReturnToHome
        })
      }

      // ========== submit: 提交休假申请 ==========
      case 'submit': {
        const formData = params || {}
        const quota = await getOrCreateQuotaDoc(openid, {})
        if (!quota || !quota.isConfigured) return fail('请先完成休假信息首次配置', 403)

        // === 分支1：方案提交（selectedPlan 存在时） ===
        if (formData.selectedPlan) {
          const { startDate, endDate, isReturnToHome, selectedPlan, expenseType } = formData
          if (!startDate || !endDate) return fail('请选择起止日期', 400)
          if (!selectedPlan) return fail('请选择休假方案', 400)

          // 检查每年两次限制
          const startYear = parseLocalDate(startDate).getFullYear()
          const usageCount = getLeaveUsageCountForYear(quota, startYear)
          if (usageCount >= 2) {
            return fail(`${startYear}年已使用${usageCount}次年休假/任期假，无法再申请`, 400)
          }

          // 重新计算方案确保数据一致性
          const { planA, planB, isSecondLeave } = await calculatePlanConsumption(
            startDate, endDate, !!isReturnToHome, quota
          )

          // 找到选中的方案
          let selectedPlanData = null
          if (selectedPlan === 'A' && planA && planA.canCover) selectedPlanData = planA
          if (selectedPlan === 'B' && planB && planB.canCover) selectedPlanData = planB

          if (!selectedPlanData) {
            return fail('所选方案无法覆盖休假日期，请重新选择', 400)
          }

          // 第2次休假必须全部用完校验
          if (isSecondLeave && !selectedPlanData.mustUseAllSatisfied) {
            return fail('第2次休假必须消耗所有剩余年休假和任期假', 400)
          }

          // 公费校验：只有涉及任期假且该轮次公费未使用时才能选公费
          const termConsumed = selectedPlanData.consumed.filter(c => c.type === 'term')
          const isPublicExpense = expenseType === 'public'
          if (isPublicExpense && termConsumed.length > 0) {
            // 检查方案中消耗的任期假轮次是否可用公费
            const canUsePublic = termConsumed.some(c => c.canUsePublicExpense)
            if (!canUsePublic) {
              return fail('所涉及的任期假轮次已使用过公费机会，无法再选公费', 400)
            }
          } else if (isPublicExpense && termConsumed.length === 0) {
            return fail('只有涉及任期假的休假才能选公费', 400)
          }

          // 判断休假类型
          const hasAnnual = selectedPlanData.consumed.some(c => c.type === 'annual')
          const hasTerm = selectedPlanData.consumed.some(c => c.type === 'term')
          let leaveType, leaveTypeName
          if (hasAnnual && hasTerm) {
            leaveType = selectedPlan === 'A' ? LEAVE_TYPES.COMBO_ANNUAL_TERM : LEAVE_TYPES.COMBO_TERM_ANNUAL
            leaveTypeName = selectedPlan === 'A' ? '组合假（年休假+任期假）' : '组合假（任期假+年休假）'
          } else if (hasAnnual) {
            leaveType = LEAVE_TYPES.ANNUAL
            leaveTypeName = '年休假'
          } else if (hasTerm) {
            leaveType = LEAVE_TYPES.TERM
            leaveTypeName = '任期假'
          } else {
            return fail('无法确定休假类型', 400)
          }

          const userInfo = await getUserInfo(openid)
          if (!userInfo) return fail('未找到用户信息', 403)
          const now = Date.now()

          // 查询过往休假记录
          const pastRecordsRes = await recordsCollection
            .where({
              applicantOpenid: openid,
              status: _.in(['approved', 'supplemented'])
            })
            .orderBy('createdAt', 'asc')
            .limit(50)
            .get()
          const pastLeaveRecords = (pastRecordsRes.data || []).map(r => ({
            leaveType: r.leaveTypeName || '-',
            startDate: r.startDate,
            endDate: r.endDate,
            days: r.totalDays,
            expenseType: r.expenseType === 'public' ? '公费' : '自费',
            location: r.leaveLocation || ''
          }))

          // 计算总天数
          const calendarDays = countCalendarDays(startDate, endDate)
          const workDays = hasAnnual ? selectedPlanData.consumed.filter(c => c.type === 'annual').reduce((s, c) => s + c.consumeDays, 0) : 0

          // 创建主记录
          const recordData = {
            applicantOpenid: openid,
            applicantName: userInfo.name || '',
            applicantDepartment: userInfo.department || '',
            recordSource: 'application',
            leaveType,
            leaveTypeName,
            otherTypeName: '',
            startDate,
            endDate,
            totalDays: calendarDays,
            workDays,
            isReturnToHome: !!isReturnToHome,
            termLeaveRound: hasTerm ? termConsumed[0].round : null,
            parentId: null,
            comboOrder: null,
            expenseType: isPublicExpense ? 'public' : 'self',
            leaveLocation: formData.leaveLocation || '',
            leaveRoute: formData.leaveRoute || '',
            proposedFlights: formData.proposedFlights || '',
            isTransferringBenefit: !!formData.isTransferringBenefit,
            transferredCount: formData.transferredCount || 0,
            needsVisaAssistance: !!formData.needsVisaAssistance,
            otherNotes: formData.otherNotes || '',
            orderId: '',
            orderNo: '',
            status: 'pending_approval',
            reason: formData.reason || '',
            remark: '',
            selectedPlan,          // [NEW] 选中的方案
            planConsumedQuota: selectedPlanData.consumed,  // [NEW] 方案配额消耗明细
            createdAt: now,
            updatedAt: now
          }

          const addRes = await recordsCollection.add({ data: recordData })
          const recordId = addRes._id

          // 启动工作流审批
          try {
            const workflowRes = await cloud.callFunction({
              name: 'workflowEngine',
              data: {
                action: 'submitOrder',
                orderType: 'leave_application',
                businessData: {
                  recordId,
                  applicantId: openid,
                  applicantName: userInfo.name || '',
                  applicantDepartment: userInfo.department || '',
                  leaveType,
                  leaveTypeName,
                  startDate,
                  endDate,
                  totalDays: calendarDays,
                  workDays,
                  selectedPlan,
                  planConsumedQuota: selectedPlanData.consumed,
                  isReturnToHome: !!isReturnToHome,
                  expenseType: isPublicExpense ? 'public' : 'self',
                  leaveLocation: formData.leaveLocation || '',
                  leaveRoute: formData.leaveRoute || '',
                  proposedFlights: formData.proposedFlights || '',
                  reason: formData.reason || '',
                  pastLeaveRecords
                }
              }
            })

            if (workflowRes.result && workflowRes.result.code === 0) {
              const orderId = workflowRes.result.data.orderId
              await recordsCollection.doc(recordId).update({
                data: { orderId, orderNo: workflowRes.result.data.orderNo || '', updatedAt: now }
              })
              return success({ recordId, orderId }, '提交成功，等待审批')
            } else {
              await recordsCollection.doc(recordId).update({
                data: { status: 'workflow_failed', updatedAt: now }
              })
              return fail(workflowRes.result?.message || '工作流启动失败', 500)
            }
          } catch (error) {
            console.error('[leaveManager] 工作流启动失败:', error)
            await recordsCollection.doc(recordId).update({
              data: { status: 'workflow_failed', updatedAt: now }
            })
            return fail('工作流启动失败，请重试', 500)
          }
        }

        // === 分支2："其他"类型提交（无 selectedPlan） ===
        if (formData.leaveType === LEAVE_TYPES.OTHER || formData.leaveType === LEAVE_TYPES.HOLIDAY) {
          const validationResult = validateAndCalculateQuota(formData, quota)
          if (!validationResult.valid) return fail(validationResult.reason, 400)

          const userInfo = await getUserInfo(openid)
          if (!userInfo) return fail('未找到用户信息', 403)
          const now = Date.now()

          const leaveTypeNameMap = {
            [LEAVE_TYPES.HOLIDAY]: '法定节假日',
            [LEAVE_TYPES.OTHER]: formData.otherTypeName || '其他'
          }

          // 查询过往休假记录
          const pastRecordsRes = await recordsCollection
            .where({
              applicantOpenid: openid,
              status: _.in(['approved', 'supplemented'])
            })
            .orderBy('createdAt', 'asc')
            .limit(50)
            .get()
          const pastLeaveRecords = (pastRecordsRes.data || []).map(r => ({
            leaveType: r.leaveTypeName || '-',
            startDate: r.startDate,
            endDate: r.endDate,
            days: r.totalDays,
            expenseType: r.expenseType === 'public' ? '公费' : '自费',
            location: r.leaveLocation || ''
          }))

          const recordData = {
            applicantOpenid: openid,
            applicantName: userInfo.name || '',
            applicantDepartment: userInfo.department || '',
            recordSource: 'application',
            leaveType: formData.leaveType,
            leaveTypeName: leaveTypeNameMap[formData.leaveType] || '其他',
            otherTypeName: formData.otherTypeName || '',
            startDate: formData.startDate,
            endDate: formData.endDate,
            totalDays: formData.totalDays || countCalendarDays(formData.startDate, formData.endDate),
            workDays: formData.workDays || 0,
            isReturnToHome: false,
            termLeaveRound: null,
            parentId: null,
            comboOrder: null,
            expenseType: formData.expenseType || 'self',
            leaveLocation: formData.leaveLocation || '',
            leaveRoute: formData.leaveRoute || '',
            proposedFlights: formData.proposedFlights || '',
            isTransferringBenefit: false,
            transferredCount: 0,
            needsVisaAssistance: false,
            otherNotes: formData.otherNotes || '',
            orderId: '',
            orderNo: '',
            status: 'pending_approval',
            reason: formData.reason || '',
            remark: '',
            createdAt: now,
            updatedAt: now
          }

          const addRes = await recordsCollection.add({ data: recordData })
          const recordId = addRes._id

          // 启动工作流审批
          try {
            const workflowRes = await cloud.callFunction({
              name: 'workflowEngine',
              data: {
                action: 'submitOrder',
                orderType: 'leave_application',
                businessData: {
                  recordId,
                  applicantId: openid,
                  applicantName: userInfo.name || '',
                  applicantDepartment: userInfo.department || '',
                  ...formData,
                  pastLeaveRecords
                }
              }
            })

            if (workflowRes.result && workflowRes.result.code === 0) {
              const orderId = workflowRes.result.data.orderId
              await recordsCollection.doc(recordId).update({
                data: { orderId, orderNo: workflowRes.result.data.orderNo || '', updatedAt: now }
              })
              return success({ recordId, orderId }, '提交成功，等待审批')
            } else {
              await recordsCollection.doc(recordId).update({
                data: { status: 'workflow_failed', updatedAt: now }
              })
              return fail(workflowRes.result?.message || '工作流启动失败', 500)
            }
          } catch (error) {
            console.error('[leaveManager] 工作流启动失败:', error)
            await recordsCollection.doc(recordId).update({
              data: { status: 'workflow_failed', updatedAt: now }
            })
            return fail('工作流启动失败，请重试', 500)
          }
        }

        // 既没有 selectedPlan 也不是 其他/法定节假日 类型
        return fail('请先选择休假方案', 400)
      }

      // ========== supplementRecord: 补填过往记录 ==========
      case 'supplementRecord': {
        const { startDate, endDate, leaveComposition, expenseType, leaveLocation, remark } = params || {}

        if (!startDate || !endDate) return fail('请选择休假日期', 400)
        if (!leaveComposition) return fail('请填写假期构成', 400)

        const quota = await getOrCreateQuotaDoc(openid, {})
        if (!quota || !quota.isConfigured) return fail('请先完成休假信息首次配置', 403)

        const userInfo = await getUserInfo(openid)
        if (!userInfo) return fail('未找到用户信息', 403)

        const now = Date.now()
        const calendarDays = countCalendarDays(startDate, endDate)
        const workDays = await countWorkDays(startDate, endDate)

        const leaveTypeNameMap = {
          [LEAVE_TYPES.ANNUAL]: '年休假',
          [LEAVE_TYPES.TERM]: '任期假',
          [LEAVE_TYPES.OTHER]: '其他'
        }

        // 创建补填记录（status = supplemented）
        const supplementData = {
          applicantOpenid: openid,
          applicantName: userInfo.name || '',
          applicantDepartment: userInfo.department || '',
          recordSource: 'supplemented',
          leaveType: 'other',
          leaveTypeName: leaveComposition || '补填记录',
          otherTypeName: '',
          startDate,
          endDate,
          totalDays: calendarDays,
          workDays,
          isReturnToHome: false,
          termLeaveRound: null,
          parentId: null,
          comboOrder: null,
          expenseType: expenseType || 'self',
          leaveLocation: leaveLocation || '',
          leaveRoute: '',
          proposedFlights: '',
          isTransferringBenefit: false,
          transferredCount: 0,
          needsVisaAssistance: false,
          otherNotes: remark || '',
          orderId: '',
          orderNo: '',
          status: 'supplemented',
          reason: '',
          remark: remark || '',
          supplementedDays: calendarDays,
          createdAt: now,
          updatedAt: now
        }

        await recordsCollection.add({ data: supplementData })

        // 补填记录仅作记录保存，不自动扣减配额

        return success(null, '补填成功')
      }

      // ========== getMyRecords: 获取我的休假记录 ==========
      case 'getMyRecords': {
        const { page = 1, pageSize = 20 } = params || {}

        const countRes = await recordsCollection
          .where({ applicantOpenid: openid })
          .count()
        const total = countRes.total

        const listRes = await recordsCollection
          .where({ applicantOpenid: openid })
          .orderBy('createdAt', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        const list = (listRes.data || []).map(formatRecordItem)

        return success({
          list,
          hasMore: page * pageSize < total,
          total,
          page
        })
      }

      // ========== getRecordDetail: 获取记录详情 ==========
      case 'getRecordDetail': {
        const { recordId } = params || {}
        if (!recordId) return fail('缺少记录ID', 400)

        const res = await recordsCollection.doc(recordId).get()
        if (!res.data) return fail('记录不存在', 404)

        const record = formatRecordItem(res.data)

        // 如果是组合假，加载子记录
        if (record.parentId === recordId) {
          const subRes = await recordsCollection
            .where({ parentId: recordId, comboOrder: 2 })
            .limit(1)
            .get()
          if (subRes.data && subRes.data.length > 0) {
            record.subRecord = formatRecordItem(subRes.data[0])
          }
        }

        // 查询审批日志（通过 orderId 关联 workflow_logs）
        let logs = []
        if (record.orderId) {
          try {
            const logsCollection = db.collection('workflow_logs')
            const logsRes = await logsCollection
              .where({ orderId: record.orderId })
              .orderBy('createdAt', 'asc')
              .limit(100)
              .get()
            logs = logsRes.data || []
          } catch (logError) {
            console.error('查询审批日志失败:', logError.message || logError)
          }
        }
        record.logs = logs

        return success(record)
      }

      // ========== checkExpiry: 到期作废检查 ==========
      case 'checkExpiry': {
        const today = new Date()
        const currentMonth = today.getMonth() + 1 // 1-12
        const currentYear = today.getFullYear()

        // 仅在4月1日及之后执行（因为有效期截止3月31日）
        if (currentMonth < 4) {
          return success(null, '不在作废执行窗口期内')
        }

        // 查找所有需要检查的配额文档
        const allQuotas = await quotasCollection.get()
        let processed = 0

        for (const quota of allQuotas.data) {
          if (!quota.annualLeaves) continue

          for (const annual of quota.annualLeaves) {
            if (annual.extendedTo && annual.status === 'active') {
              // 检查是否已过期
              if (annual.extendedTo < formatDateObj(today)) {
                // 作废未使用的天数
                if (annual.availableDays > 0) {
                  annual.expiredDays += annual.availableDays
                  annual.usedDays += annual.availableDays
                  annual.availableDays = 0
                  annual.status = 'expired'
                  processed++
                }
              }
            }
          }

          // 更新配额文档
          await quotasCollection.doc(quota._id).update({
            data: {
              annualLeaves: quota.annualLeaves,
              updatedAt: Date.now()
            }
          })
        }

        return success({ processed }, `到期作废检查完成，处理了 ${processed} 条`)
      }

      default:
        return fail(`未知 action: ${action}`, 400)
    }
  } catch (error) {
    console.error('[leaveManager] 操作失败:', error)
    return fail(error.message || '服务异常', 500)
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化记录项
 */
function formatRecordItem(item) {
  const statusTextMap = {
    pending_approval: '待审批',
    approved: '已通过',
    rejected: '已驳回',
    cancelled: '已取消',
    terminated: '已中止',
    expired: '已过期',
    supplemented: '补填',
    workflow_failed: '提交失败'
  }
  return {
    ...item,
    statusText: statusTextMap[item.status] || item.status,
    createdAtText: item.createdAt ? formatTimestamp(item.createdAt) : ''
  }
}

/**
 * 格式化时间戳为 YYYY-MM-DD HH:mm:ss
 */
function formatTimestamp(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${dd} ${h}:${min}:${s}`
}

/**
 * 校验并计算配额是否足够
 */
function validateAndCalculateQuota(formData, quota) {
  const { leaveType, startDate, endDate, isReturnToHome } = formData

  if (!leaveType || !startDate || !endDate) {
    return { valid: false, reason: '请完整填写休假类型和日期' }
  }

  const calendarDays = countCalendarDays(startDate, endDate)

  switch (leaveType) {
    case LEAVE_TYPES.ANNUAL: {
      const availableAnnual = getAvailableAnnualDays(quota)
      const neededWorkDays = countCalendarDays(startDate, endDate) // 前端会传 workDays
      if (neededWorkDays > availableAnnual) {
        return { valid: false, reason: '不符合休假天数：年休假余额不足' }
      }
      break
    }
    case LEAVE_TYPES.TERM: {
      const availableTermRounds = getAvailableTermRounds(quota)
      if (availableTermRounds < 1) {
        return { valid: false, reason: '不符合休假天数：任期假次数不足' }
      }
      // 检查天数是否足够
      let termAvailable = 0
      if (quota.termLeaves) {
        quota.termLeaves.forEach(t => {
          if (!t.used) {
            const avail = t.availableDays !== undefined ? t.availableDays : TERM_LEAVE_DAYS_PER_ROUND
            termAvailable += avail
          }
        })
      }
      const neededDays = isReturnToHome ? calendarDays + TERM_LEAVE_RETURN_BONUS_DAYS : calendarDays
      if (neededDays > termAvailable) {
        return { valid: false, reason: '不符合休假天数：任期假天数不足' }
      }
      // 检查单次天数限制
      if (isReturnToHome && calendarDays > (TERM_LEAVE_DAYS_PER_ROUND + TERM_LEAVE_RETURN_BONUS_DAYS)) {
        return { valid: false, reason: '不符合休假天数：超出单次任期假最大天数' }
      }
      if (!isReturnToHome && calendarDays > TERM_LEAVE_DAYS_PER_ROUND) {
        return { valid: false, reason: '不符合休假天数：超出单次任期假最大天数' }
      }
      break
    }
    case LEAVE_TYPES.HOLIDAY:
      // 法定节假日不占配额
      break
    case LEAVE_TYPES.OTHER:
      // 其他类型不校验配额
      break
    default:
      break
  }

  return { valid: true }
}

/** 获取可用年休假总天数 */
function getAvailableAnnualDays(quota) {
  if (!quota.annualLeaves) return 0
  return quota.annualLeaves.reduce((sum, a) => sum + (a.availableDays || 0), 0)
}

/** 获取可用任期假次数（兼容新旧数据结构） */
function getAvailableTermRounds(quota) {
  if (!quota.termLeaves) return 0
  return quota.termLeaves.filter(t => {
    if (t.used) return false
    // 新结构：检查 availableDays
    if (t.availableDays !== undefined) return t.availableDays > 0
    // 旧结构：used=false 即可用
    return true
  }).length
}

/** 补填记录时扣减配额 */
async function deductQuotaForSupplement(openid, leaveType, calendarDays, workDays) {
  const quotaRes = await quotasCollection.where({ openid }).limit(1).get()
  if (!quotaRes.data || quotaRes.data.length === 0) return
  const quota = quotaRes.data[0]
  const now = Date.now()

  if (leaveType === LEAVE_TYPES.ANIMAL || leaveType === LEAVE_TYPES.ANNUAL) {
    // 扣减年休假（从最早的 active 配额中扣）
    if (quota.annualLeaves) {
      let remaining = workDays
      for (const annual of quota.annualLeaves) {
        if (remaining <= 0) break
        if (annual.status === 'active' && annual.availableDays > 0) {
          const deduct = Math.min(remaining, annual.availableDays)
          annual.usedDays += deduct
          annual.availableDays -= deduct
          remaining -= deduct
        }
      }
      quota.totalAnnualUsed += (workDays - remaining)
    }
  } else if (leaveType === LEAVE_TYPES.TERM) {
    // 扣减任期假天数
    if (quota.termLeaves) {
      let remaining = calendarDays
      for (const term of quota.termLeaves) {
        if (remaining <= 0) break
        if (term.used) continue
        const avail = term.availableDays !== undefined ? term.availableDays : TERM_LEAVE_DAYS_PER_ROUND
        if (avail > 0) {
          const deduct = Math.min(remaining, avail)
          term.usedDays = (term.usedDays || 0) + deduct
          term.availableDays = avail - deduct
          if (term.availableDays <= 0) {
            term.used = true
            quota.totalTermUsed++
          }
          remaining -= deduct
        }
      }
    }
  }

  await quotasCollection.doc(quota._id).update({
    data: {
      annualLeaves: quota.annualLeaves,
      termLeaves: quota.termLeaves,
      totalAnnualUsed: quota.totalAnnualUsed,
      totalTermUsed: quota.totalTermUsed,
      updatedAt: now
    }
  })
}

/** 更新配额时间戳 */
async function updateQuotaTimestamp(openid) {
  const quotaRes = await quotasCollection.where({ openid }).limit(1).get()
  if (quotaRes.data && quotaRes.data.length > 0) {
    await quotasCollection.doc(quotaRes.data[0]._id).update({
      data: { updatedAt: Date.now() }
    })
  }
}
