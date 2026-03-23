/**
 * 日程管理云函数
 * 处理日程的增删改查操作
 */

const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()
const _ = db.command

// 集合引用
const schedulesCollection = db.collection('calendar_schedules')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}
function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

// 日程类型配置
const SCHEDULE_TYPES = {
  meeting: { name: '会议', color: '#3B82F6' },
  training: { name: '培训', color: '#10B981' },
  visit: { name: '会见', color: '#8B5CF6' },
  banquet: { name: '宴请', color: '#F59E0B' },
  other: { name: '其他', color: '#6B7280' }
}

// 重复类型
const REPEAT_TYPES = {
  none: '不重复',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  workdayDaily: '工作日每天',
  workdayWeekly: '工作日每周'
}

/**
 * 获取当年的最后一天日期字符串
 */
function getYearEnd(year) {
  return `${year}-12-31`
}

/**
 * 解析日期字符串为 Date 对象（本地时间）
 * 避免时区陷阱：不使用 new Date('YYYY-MM-DD')
 */
function parseLocalDate(dateStr) {
  const parts = dateStr.split(/[-/.]/)
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
}

/**
 * 格式化 Date 对象为 YYYY-MM-DD 字符串
 */
function formatDateObj(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 判断是否为工作日
 * @param {string} dateStr 日期字符串 YYYY-MM-DD
 * @param {Set<string>} holidayDates 节假日日期集合
 * @returns {boolean}
 */
function isWorkday(dateStr, holidayDates) {
  const date = parseLocalDate(dateStr)
  const dayOfWeek = date.getDay() // 0=周日, 6=周六
  
  // 周末非工作日
  if (dayOfWeek === 0 || dayOfWeek === 6) return false
  
  // 节假日非工作日
  if (holidayDates && holidayDates.has(dateStr)) return false
  
  return true
}

/**
 * 判断日程是否在指定日期出现（处理重复日程）
 * @param {Object} schedule 日程对象
 * @param {string} targetDate 目标日期 YYYY-MM-DD
 * @param {Set<string>} holidayDates 节假日日期集合
 * @returns {boolean}
 */
function shouldAppearOnDate(schedule, targetDate, holidayDates) {
  // 非重复日程：检查日期范围
  if (schedule.repeat === 'none') {
    return targetDate >= schedule.startDate && targetDate <= schedule.endDate
  }
  
  // 重复日程：检查截止日期
  if (schedule.repeatEndDate && targetDate > schedule.repeatEndDate) {
    return false
  }
  
  // 检查是否在开始日期之前
  if (targetDate < schedule.startDate) {
    return false
  }
  
  const target = parseLocalDate(targetDate)
  const start = parseLocalDate(schedule.startDate)
  
  // 根据重复类型判断
  switch (schedule.repeat) {
    case 'daily':
      // 每天重复
      return true
      
    case 'weekly':
      // 每周同星期几重复
      return target.getDay() === start.getDay()
      
    case 'monthly':
      // 每月同日期重复
      return target.getDate() === start.getDate()
      
    case 'workdayDaily':
      // 工作日每天重复
      return isWorkday(targetDate, holidayDates)
      
    case 'workdayWeekly':
      // 工作日每周重复：同星期几且为工作日
      return target.getDay() === start.getDay() && isWorkday(targetDate, holidayDates)
      
    default:
      return false
  }
}

/**
 * 获取节假日配置缓存
 * 使用闭包实现简单缓存
 */
const holidayConfigCache = {}

async function getHolidayConfig(year) {
  if (holidayConfigCache[year]) {
    return holidayConfigCache[year]
  }
  
  const holidayConfigsCollection = db.collection('holiday_configs')
  const result = await holidayConfigsCollection
    .where({ year: Number(year) })
    .get()
  
  const dates = result.data && result.data.length > 0 
    ? new Set(result.data[0].dates || [])
    : new Set()
  
  holidayConfigCache[year] = dates
  return dates
}

exports.main = async (event, context) => {
  const { action, params } = event
  const wxContext = cloud.getWXContext()

  try {
    switch (action) {
      case 'create':
        return await handleCreate(params, wxContext)
      case 'update':
        return await handleUpdate(params, wxContext)
      case 'delete':
        return await handleDelete(params, wxContext)
      case 'getByDate':
        return await handleGetByDate(params, wxContext)
      case 'getByDateRange':
        return await handleGetByDateRange(params, wxContext)
      case 'getScheduleDates':
        return await handleGetScheduleDates(params, wxContext)
      case 'getTypes':
        return success({ types: SCHEDULE_TYPES, repeats: REPEAT_TYPES })
      default:
        return fail('未知的操作类型', 400)
    }
  } catch (error) {
    console.error('日程操作失败:', error)
    return fail(error.message || '操作失败')
  }
}

/**
 * 创建日程
 */
async function handleCreate(params, wxContext) {
  const { title, isAllDay, startDate, endDate, startTime, endTime, type, repeat, repeatEndDate, location, description } = params

  // 参数校验
  if (!title || !startDate) {
    return fail('标题和开始日期为必填项', 400)
  }

  // 重复日程必须设置截止日期
  if (repeat && repeat !== 'none') {
    if (!repeatEndDate) {
      return fail('重复日程必须设置截止日期', 400)
    }
    
    // 验证截止日期范围
    const currentYear = new Date().getFullYear()
    const maxEndDate = getYearEnd(currentYear)
    
    if (repeatEndDate < startDate) {
      return fail('截止日期不能早于开始日期', 400)
    }
    if (repeatEndDate > maxEndDate) {
      return fail(`截止日期不能超过${maxEndDate}`, 400)
    }
  }

  const typeConfig = SCHEDULE_TYPES[type] || SCHEDULE_TYPES.other

  const schedule = {
    title,
    isAllDay: isAllDay || false,
    startDate,
    endDate: endDate || startDate,
    startTime: isAllDay ? null : startTime,
    endTime: isAllDay ? null : endTime,
    type,
    typeName: typeConfig.name,
    color: typeConfig.color,
    repeat: repeat || 'none',
    repeatEndDate: repeat && repeat !== 'none' ? repeatEndDate : null,
    location: location || '',
    description: description || '',
    creatorId: wxContext.OPENID,
    creatorName: params.creatorName || '未知用户',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const result = await schedulesCollection.add({ data: schedule })

  return success({
    _id: result._id,
    ...schedule
  }, '创建成功')
}

/**
 * 更新日程
 */
async function handleUpdate(params, wxContext) {
  const { scheduleId, repeatEndDate, ...updateData } = params

  if (!scheduleId) {
    return fail('日程ID不能为空', 400)
  }

  // 检查权限
  const scheduleDoc = await schedulesCollection.doc(scheduleId).get()
  if (!scheduleDoc.data) {
    return fail('日程不存在', 404)
  }

  if (scheduleDoc.data.creatorId !== wxContext.OPENID) {
    return fail('无权限修改此日程', 403)
  }

  // 处理重复日程的截止日期
  const newRepeat = updateData.repeat !== undefined ? updateData.repeat : scheduleDoc.data.repeat
  
  if (newRepeat && newRepeat !== 'none') {
    // 重复日程必须设置截止日期
    if (!repeatEndDate) {
      return fail('重复日程必须设置截止日期', 400)
    }
    
    // 验证截止日期范围
    const currentYear = new Date().getFullYear()
    const maxEndDate = getYearEnd(currentYear)
    const startDate = updateData.startDate || scheduleDoc.data.startDate
    
    if (repeatEndDate < startDate) {
      return fail('截止日期不能早于开始日期', 400)
    }
    if (repeatEndDate > maxEndDate) {
      return fail(`截止日期不能超过${maxEndDate}`, 400)
    }
    
    updateData.repeatEndDate = repeatEndDate
  } else {
    // 非重复日程，清空截止日期
    updateData.repeatEndDate = null
  }

  // 更新类型配置
  if (updateData.type) {
    const typeConfig = SCHEDULE_TYPES[updateData.type] || SCHEDULE_TYPES.other
    updateData.typeName = typeConfig.name
    updateData.color = typeConfig.color
  }

  // 处理全天日程
  if (updateData.isAllDay) {
    updateData.startTime = null
    updateData.endTime = null
  }

  updateData.updatedAt = Date.now()

  await schedulesCollection.doc(scheduleId).update({
    data: updateData
  })

  return success(null, '更新成功')
}

/**
 * 删除日程
 */
async function handleDelete(params, wxContext) {
  const { scheduleId } = params

  if (!scheduleId) {
    return fail('日程ID不能为空', 400)
  }

  // 检查权限
  const scheduleDoc = await schedulesCollection.doc(scheduleId).get()
  if (!scheduleDoc.data) {
    return fail('日程不存在', 404)
  }

  if (scheduleDoc.data.creatorId !== wxContext.OPENID) {
    return fail('无权限删除此日程', 403)
  }

  await schedulesCollection.doc(scheduleId).remove()

  return success(null, '删除成功')
}

/**
 * 按日期查询日程
 * 处理重复日程的计算逻辑
 */
async function handleGetByDate(params, wxContext) {
  const { date } = params

  if (!date) {
    return fail('日期不能为空', 400)
  }

  // 获取当年节假日配置
  const year = parseInt(date.split('-')[0])
  const holidayDates = await getHolidayConfig(year)

  // 查询所有可能相关的日程
  // 1. 非重复日程：startDate <= date <= endDate
  // 2. 重复日程：startDate <= date（后续再判断是否在当天出现）
  const result = await schedulesCollection
    .where({
      startDate: _.lte(date)
    })
    .orderBy('startTime', 'asc')
    .get()

  // 过滤并处理日程
  const allSchedules = []
  
  for (const schedule of result.data) {
    // 检查日程是否在当天出现
    if (shouldAppearOnDate(schedule, date, holidayDates)) {
      allSchedules.push(schedule)
    }
  }

  // 分离全天和非全天日程
  const allDaySchedules = allSchedules.filter(item => item.isAllDay)
  const timedSchedules = allSchedules.filter(item => !item.isAllDay)

  return success({
    all: allSchedules,
    allDay: allDaySchedules,
    timed: timedSchedules
  })
}

/**
 * 按日期范围查询日程
 */
async function handleGetByDateRange(params, wxContext) {
  const { startDate, endDate } = params

  if (!startDate || !endDate) {
    return fail('开始日期和结束日期不能为空', 400)
  }

  const result = await schedulesCollection
    .where({
      startDate: _.lte(endDate),
      endDate: _.gte(startDate)
    })
    .orderBy('startDate', 'asc')
    .orderBy('startTime', 'asc')
    .get()

  return success({
    list: result.data,
    total: result.data.length
  })
}

/**
 * 获取指定月份范围内有日程的日期列表
 * 用于日历标记
 * 支持重复日程计算
 */
async function handleGetScheduleDates(params, wxContext) {
  const { year, month } = params

  if (!year || !month) {
    return fail('年份和月份不能为空', 400)
  }

  // 计算月份范围（日历组件可能显示前后月份的日期，所以扩大查询范围）
  const monthStartDate = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const monthEndDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  // 获取节假日配置（支持跨年：同时获取当前年和下一年）
  const holidayDatesSet = new Set()
  const currentYearHolidays = await getHolidayConfig(year)
  currentYearHolidays.forEach(d => holidayDatesSet.add(d))
  
  // 如果跨年，也获取下一年的节假日配置
  if (nextYear !== year) {
    const nextYearHolidays = await getHolidayConfig(nextYear)
    nextYearHolidays.forEach(d => holidayDatesSet.add(d))
  }

  // 查询所有可能相关的日程
  // 重复日程可能从很早开始，所以只限制 startDate < monthEndDate
  const result = await schedulesCollection
    .where({
      startDate: _.lt(monthEndDate)
    })
    .get()

  // 提取所有有日程的日期
  const dateSet = new Set()
  
  // 遍历月份内的每一天
  const currentMonthStart = parseLocalDate(monthStartDate)
  const currentMonthEnd = parseLocalDate(monthEndDate)
  
  // 按日程遍历
  result.data.forEach(schedule => {
    if (schedule.repeat === 'none') {
      // 非重复日程：遍历日程覆盖的所有日期
      const start = parseLocalDate(schedule.startDate)
      const end = parseLocalDate(schedule.endDate || schedule.startDate)
      
      const current = new Date(start)
      while (current <= end) {
        const dateStr = formatDateObj(current)
        // 只添加在查询月份内的日期
        if (dateStr >= monthStartDate && dateStr < monthEndDate) {
          dateSet.add(dateStr)
        }
        current.setDate(current.getDate() + 1)
      }
    } else {
      // 重复日程：计算在月份内的出现日期
      const scheduleStart = parseLocalDate(schedule.startDate)
      const repeatEnd = schedule.repeatEndDate ? parseLocalDate(schedule.repeatEndDate) : currentMonthEnd
      const effectiveEnd = repeatEnd < currentMonthEnd ? repeatEnd : currentMonthEnd
      
      // 从日程开始日期或月份开始日期（取较大者）开始遍历
      const iterStart = scheduleStart > currentMonthStart ? scheduleStart : new Date(currentMonthStart)
      
      const current = new Date(iterStart)
      while (current <= effectiveEnd) {
        const dateStr = formatDateObj(current)
        
        if (dateStr >= monthStartDate && dateStr < monthEndDate) {
          // 使用合并后的节假日集合判断
          if (shouldAppearOnDate(schedule, dateStr, holidayDatesSet)) {
            dateSet.add(dateStr)
          }
        }
        
        current.setDate(current.getDate() + 1)
      }
    }
  })

  return success({
    dates: Array.from(dateSet).sort()
  })
}
