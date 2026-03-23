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
  monthly: '每月'
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
  const { title, isAllDay, startDate, endDate, startTime, endTime, type, repeat, location, description } = params

  // 参数校验
  if (!title || !startDate) {
    return fail('标题和开始日期为必填项', 400)
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
  const { scheduleId, ...updateData } = params

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
 */
async function handleGetByDate(params, wxContext) {
  const { date } = params

  if (!date) {
    return fail('日期不能为空', 400)
  }

  const result = await schedulesCollection
    .where({
      startDate: _.lte(date),
      endDate: _.gte(date)
    })
    .orderBy('startTime', 'asc')
    .get()

  // 分离全天和非全天日程
  const allDaySchedules = result.data.filter(item => item.isAllDay)
  const timedSchedules = result.data.filter(item => !item.isAllDay)

  return success({
    all: result.data,
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
 */
async function handleGetScheduleDates(params, wxContext) {
  const { year, month } = params

  if (!year || !month) {
    return fail('年份和月份不能为空', 400)
  }

  // 计算月份范围
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  // 查询该月份内的所有日程
  const result = await schedulesCollection
    .where({
      startDate: _.lt(endDate),
      endDate: _.gte(startDate)
    })
    .field({
      startDate: true,
      endDate: true
    })
    .get()

  // 提取所有有日程的日期
  const dateSet = new Set()
  
  result.data.forEach(schedule => {
    const start = new Date(schedule.startDate)
    const end = new Date(schedule.endDate)
    
    // 遍历日程覆盖的所有日期
    const current = new Date(start)
    while (current <= end) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
      // 只添加在查询月份内的日期
      if (dateStr >= startDate && dateStr < endDate) {
        dateSet.add(dateStr)
      }
      current.setDate(current.getDate() + 1)
    }
  })

  return success({
    dates: Array.from(dateSet).sort()
  })
}
