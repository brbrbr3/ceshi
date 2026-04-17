/**
 * 休假管理云函数
 *
 * 支持的 action：
 *   - initSetup         首次配置（填写日期+剩余配额，初始化 leave_quotas）
 *   - getMyQuotas       获取我的假期配额
 *   - calculateDays     计算休假天数（前端实时预览）
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
  { round: 1, monthsAfterArrival: 6 },
  { round: 2, monthsAfterArrival: 24 },  // 2年
  { round: 3, monthsAfterArrival: 36 },  // 3年
  { round: 4, monthsAfterArrival: 48 },  // 4年
  { round: 5, monthsAfterArrival: 60 }   // 5年
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
  const currentMonth = new Date(nowYear, 1 /* Feb=month index 1*/, 0).getMonth() + 1
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
      used: false,
      usedRecordId: null,
      isReturnToHome: null
    })
  })
  return termLeaves
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
        const { workStartDate, arrivalDate, initialAnnualRemaining, initialTermRemaining } = params || {}
        if (!workStartDate || !arrivalDate) return fail('请填写参加工作日期和到任日期', 400)

        const userInfo = await getUserInfo(openid)
        if (!userInfo) return fail('未找到用户信息', 403)

        const nowYear = new Date().getFullYear()

        // 构建年休假配额
        const annualQuotas = buildAnnualLeaveQuotas(workStartDate, arrivalDate, nowYear)

        // 总应休天数
        const totalShouldHave = annualQuotas.reduce((sum, a) => sum + a.totalDays, 0)
        // 已用天数 = 应有 - 剩余
        const usedFromInput = Math.max(0, totalShouldHave - (initialAnnualRemaining || 0))

        // 分配已用天数到各年度（从最早的年度开始扣除）
        let remainingUsed = usedFromInput
        annualQuotas.forEach((a, i) => {
          if (remainingUsed > 0 && a.status === 'active') {
            const deduct = Math.min(remainingUsed, a.availableDays)
            a.usedDays = deduct
            a.availableDays -= deduct
            remainingUsed -= deduct
          } else if (a.status === 'expired') {
            // 过期年度如果还有剩余，说明之前没休完，标记为 expired
            a.expiredDays = a.availableDays
            a.usedDays += a.availableDays
            a.availableDays = 0
          }
        })

        // 构建任期假配额
        const termQuotas = buildTermLeaveQuotas(arrivalDateStr)

        // 根据到任日期计算每个任期假的 eligibleDate
        const arrival = parseLocalDate(arrivalDate)
        TERM_LEAVE_RULES.forEach((rule, i) => {
          if (termQuotas[i]) {
            const eligible = new Date(arrival)
            eligible.setMonth(eligible.getMonth() + rule.monthsAfterArrival)
            termQuotas[i].eligibleDate = formatDateObj(eligible)

            // 如果已经超过该轮次的 eligibleDate 且用户填了剩余次数
            // 则标记前面的轮次为已使用
            const remainingRounds = initialTermRemaining || 0
            if (i < (TERM_LEAVE_RULES.length - remainingRounds)) {
              termQuotas[i].used = true
              termQuotas[i].isReturnToHome = false
            }
          }
        })

        const now = Date.now()
        const quotaData = {
          openid,
          name: userInfo.name || '',
          workStartDate,
          arrivalDate,
          isConfigured: true,
          initialAnnualRemaining: initialAnnualRemaining || 0,
          initialTermRemaining: initialTermRemaining || 0,
          annualLeaves: annualQuotas,
          termLeaves: termQuotas,
          totalAnnualUsed: usedFromInput,
          totalTermUsed: Math.max(0, (TERM_LEAVE_RULES.length) - (initialTermRemaining || 0)),
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
        return success(quota)
      }

      // ========== calculateDays: 计算休假天数（前端预览）==========
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

        // 组合假特殊处理
        if (leaveType === LEAVE_TYPES.COMBO_ANNUAL_TERM ||
            leaveType === LEAVE_TYPES.COMBO_TERM_ANNUAL) {
          result.comboHint = leaveType === LEAVE_TYPES.COMBO_ANNUAL_TERM
            ? `先休${workDays}个工作日年休假，再连续${calendarDays}自然日任期假`
            : `先连续${calendarDays}自然日任期假，再休${workDays}个工作日年休假`
        }

        // 任期假天数（含回国路程假）
        if (leaveType === LEAVE_TYPES.TERM ||
            leaveType === LEAVE_TYPES.COMBO_ANNUAL_TERM ||
            leaveType === LEAVE_TYPES.COMBO_TERM_ANNUAL) {
          result.termTotalDays = isReturnToHome ? (calendarDays + TERM_LEAVE_RETURN_BONUS_DAYS) : calendarDays
        }

        return success(result)
      }

      // ========== submit: 提交休假申请 ==========
      case 'submit': {
        const formData = params || {}
        const quota = await getOrCreateQuotaDoc(openid, {})
        if (!quota || !quota.isConfigured) return fail('请先完成休假信息首次配置', 403)

        // 校验配额
        const validationResult = validateAndCalculateQuota(formData, quota)
        if (!validationResult.valid) return fail(validationResult.reason, 400)

        const userInfo = await getUserInfo(openid)
        if (!userInfo) return fail('未找到用户信息', 403)

        const now = Date.now()
        const leaveTypeNameMap = {
          [LEAVE_TYPES.ANNUAL]: '年休假',
          [LEAVE_TYPES.TERM]: '任期假',
          [LEAVE_TYPES.COMBO_ANNUAL_TERM]: '组合假（年休假+任期假）',
          [LEAVE_TYPES.COMBO_TERM_ANUAL]: '组合假（任期假+年休假）',
          [LEAVE_TYPES.HOLIDAY]: '法定节假日',
          [LEAVE_TYPES.OTHER]: formData.otherTypeName || '其他'
        }

        // 查询所有过往休假记录（用于工单携带）
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

        // 创建 leave_record
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
          isReturnToHome: !!formData.isReturnToHome,
          termLeaveRound: formData.termLeaveRound || null,
          parentId: null,
          comboOrder: null,
          expenseType: formData.expenseType || 'public',
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
          createdAt: now,
          updatedAt: now
        }

        const addRes = await recordsCollection.add({ data: recordData })
        const recordId = addRes._id

        // 组合假：创建第二条子记录
        let subRecordId = null
        if ((formData.leaveType === LEAVE_TYPES.COMBO_ANNUAL_TERM ||
             formData.leaveType === LEAVE_TYPES.COMBO_TERM_ANNUAL) &&
            formData.comboEndDate && formData.comboStartDate) {
          const subRecord = { ...recordData }
          subRecord.parentId = recordId
          subRecord.comboOrder = 2
          subRecord.startDate = formData.comboStartDate
          subRecord.endDate = formData.comboEndDate
          subRecord.totalDays = countCalendarDays(formData.comboStartDate, formData.comboEndDate)
          delete subRecord._id

          const subAddRes = await recordsCollection.add({ data: subRecord })
          subRecordId = subAddRes._id

          // 更新主记录
          await recordsCollection.doc(recordId).update({
            data: {
              parentId: recordId, // 主记录指向自身
              comboOrder: 1,
              updatedAt: now
            }
          })

          // 更新子记录 parentId
          await recordsCollection.doc(subRecordId).update({
            data: { parentId: recordId }
          })
        }

        // 启动工作流审批
        try {
          const workflowRes = await cloud.callFunction({
            name: 'workflowEngine',
            data: {
              action: 'submitOrder',
              orderType: 'leave_application',
              businessData: {
                recordId,
                subRecordId,
                applicantOpenid: openid,
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
            // 回滚
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

      // ========== supplementRecord: 补填过往记录 ==========
      case 'supplementRecord': {
        const { startDate, endDate, leaveType, expenseType, leaveLocation, remark } = params || {}

        if (!startDate || !endDate) return fail('请选择休假日期', 400)
        if (!leaveType) return fail('请选择假期类型', 400)

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
          leaveType: leaveType,
          leaveTypeName: leaveTypeNameMap[leaveType] || '其他',
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

        // 立即扣减配额
        await deductQuotaForSupplement(openid, leaveType, calendarDays, workDays)

        // 更新 quota 的 updatedAt
        await updateQuotaTimestamp(openid)

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
    expired: '已过期',
    supplemented: '补填'
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
      const neededRounds = 1
      if (availableTermRounds < neededRounds) {
        return { valid: false, reason: '不符合休假天数：任期假次数不足' }
      }
      // 检查连休限制
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

/** 获取可用任期假次数 */
function getAvailableTermRounds(quota) {
  if (!quota.termLeaves) return 0
  return quota.termLeaves.filter(t => !t.used).length
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
    // 扣减一次任期假
    if (quota.termLeaves) {
      for (const term of quota.termLeaves) {
        if (!term.used) {
          term.used = true
          quota.totalTermUsed++
          break
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
