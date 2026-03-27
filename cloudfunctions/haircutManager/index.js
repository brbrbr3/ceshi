/**
 * 理发预约管理云函数
 * 
 * 功能：
 * - getDisplayDates: 获取可显示日期列表（含节假日状态）
 * - getAvailableSlots: 获取指定日期可用时段
 * - createAppointment: 创建预约
 * - cancelAppointment: 取消预约
 * - getAppointments: 查询本月预约列表
 * - getMyAppointments: 获取我的预约记录
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 集合引用
const appointmentsCollection = db.collection('haircut_appointments')
const holidayConfigsCollection = db.collection('holiday_configs')
const usersCollection = db.collection('office_users')

// 时段配置
const TIME_SLOTS = [
  { start: '14:30', end: '15:00', display: '14:30~15:00' },
  { start: '15:00', end: '15:30', display: '15:00~15:30' },
  { start: '15:30', end: '16:00', display: '15:30~16:00' },
  { start: '16:00', end: '16:30', display: '16:00~16:30' },
  { start: '16:30', end: '17:00', display: '16:30~17:00' },
  { start: '17:00', end: '17:30', display: '17:00~17:30' },
  { start: '17:30', end: '18:00', display: '17:30~18:00' }
]

// 取消原因
const CANCEL_REASONS = [
  '当日招待员因有事未能理发',
  '预约人没来理发'
]

// 可查看理发预约的岗位
const HAIRCUT_VIEWER_POSITIONS = ['招待员', '会计主管', '会计', '内聘']

// 统一返回格式
function success(data, message) {
  return {
    code: 0,
    message: message || 'ok',
    data: data || {}
  }
}

function fail(message, code, data) {
  return {
    code: code || 500,
    message: message || '服务异常',
    data: data || null
  }
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 解析日期字符串为 Date 对象（本地时间）
 */
function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * 判断某天是否禁用全部时段（当日14:20后）
 */
function isDayFullyDisabled(dateStr) {
  const now = new Date()
  const todayStr = formatDate(now)
  
  // 非当日，不禁用
  if (dateStr !== todayStr) return false
  
  // 检查当前时间是否已过14:20
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentTime = currentHour * 60 + currentMinute
  const disableTime = 14 * 60 + 20 // 14:20
  
  return currentTime >= disableTime
}

/**
 * 获取节假日列表（多年份）
 */
async function getHolidays(years) {
  const holidays = []
  
  for (const year of years) {
    const result = await holidayConfigsCollection
      .where({ year: Number(year) })
      .get()
    
    if (result.data && result.data.length > 0) {
      holidays.push(...result.data[0].dates)
    }
  }
  
  return holidays
}

/**
 * 获取可显示日期列表
 */
async function getDisplayDates() {
  const now = new Date()
  const todayStr = formatDate(now)
  
  // 判断是否应该显示下周（周五18:00后）
  const shouldShowNextWeek = (() => {
    const dayOfWeek = now.getDay() // 0=周日, 5=周五
    if (dayOfWeek !== 5) return false
    const currentHour = now.getHours()
    return currentHour >= 18
  })()
  
  // 计算需要查询的年份
  const years = new Set()
  years.add(now.getFullYear())
  
  // 计算起始日期
  let startDate = new Date(now)
  if (shouldShowNextWeek) {
    // 跳到下周
    startDate.setDate(startDate.getDate() + 3)
    startDate.setHours(0, 0, 0, 0)
  }
  
  years.add(startDate.getFullYear())
  
  // 获取节假日配置
  const holidays = await getHolidays([...years])
  
  // 遍历接下来的14天，找出最多7个理发日
  const dates = []
  const tempDate = new Date(startDate)
  
  while (dates.length < 7) {
    const dateStr = formatDate(tempDate)
    const dayOfWeek = tempDate.getDay()
    
    // 只收集周一、三、五
    if ([1, 3, 5].includes(dayOfWeek)) {
      const isHoliday = holidays.includes(dateStr)
      const isFullyDisabled = isDayFullyDisabled(dateStr)
      
      dates.push({
        date: dateStr,
        dayOfWeek: ['日', '一', '二', '三', '四', '五', '六'][dayOfWeek],
        isHoliday,
        isToday: dateStr === todayStr,
        isDisabled: isHoliday || isFullyDisabled,
        disableReason: isHoliday ? '今日为节假日，不提供理发服务' : 
                       isFullyDisabled ? '当前时间已过预约截止时间（当日14:20）' : ''
      })
    }
    
    tempDate.setDate(tempDate.getDate() + 1)
  }
  
  return success({
    dates,
    shouldShowNextWeek
  })
}

/**
 * 获取指定日期可用时段
 */
async function getAvailableSlots(date) {
  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('日期格式不正确')
  }
  
  const now = new Date()
  const todayStr = formatDate(now)
  
  // 检查是否为周一、三、五
  const targetDate = parseLocalDate(date)
  const dayOfWeek = targetDate.getDay()
  if (![1, 3, 5].includes(dayOfWeek)) {
    return success({
      date,
      slots: [],
      message: '今日非理发日（仅周一、三、五提供理发服务）'
    })
  }
  
  // 检查节假日
  const year = targetDate.getFullYear()
  const holidays = await getHolidays([year])
  if (holidays.includes(date)) {
    return success({
      date,
      slots: [],
      message: '今日为节假日，不提供理发服务'
    })
  }
  
  // 检查当日14:20后禁用
  const isFullyDisabled = isDayFullyDisabled(date)
  if (isFullyDisabled) {
    return success({
      date,
      slots: [],
      message: '当前时间已过预约截止时间（当日14:20）'
    })
  }
  
  // 查询已预约的时段
  const bookedRes = await appointmentsCollection
    .where({
      date,
      status: 'booked'
    })
    .get()
  
  const bookedSlots = new Set(bookedRes.data.map(item => item.timeSlot))
  
  // 构建时段列表
  const slots = TIME_SLOTS.map(slot => ({
    ...slot,
    isBooked: bookedSlots.has(slot.start)
  }))
  
  return success({
    date,
    slots,
    message: ''
  })
}

/**
 * 创建预约
 */
async function createAppointment(openid, appointmentData) {
  const { date, timeSlot, appointeeName } = appointmentData
  
  // 验证必填字段
  if (!date || !timeSlot || !appointeeName) {
    throw new Error('请填写完整的预约信息')
  }
  
  // 验证时段是否有效
  const slotConfig = TIME_SLOTS.find(s => s.start === timeSlot)
  if (!slotConfig) {
    throw new Error('时段无效')
  }
  
  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('日期格式不正确')
  }
  
  // 获取用户信息
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }
  
  const user = userResult.data[0]
  if (user.status !== 'approved') {
    throw new Error('用户状态异常，请重新登录')
  }
  
  const bookerName = user.name
  
  // 检查是否为代约
  const isProxy = appointeeName.trim() !== bookerName.trim()
  
  // 检查当日14:20后是否还能预约
  if (isDayFullyDisabled(date)) {
    throw new Error('当前时间已过预约截止时间（当日14:20）')
  }
  
  // 检查节假日
  const targetDate = parseLocalDate(date)
  const year = targetDate.getFullYear()
  const holidays = await getHolidays([year])
  if (holidays.includes(date)) {
    throw new Error('该日期为节假日，不提供理发服务')
  }
  
  // 检查是否为理发日
  const dayOfWeek = targetDate.getDay()
  if (![1, 3, 5].includes(dayOfWeek)) {
    throw new Error('该日期非理发日（仅周一、三、五提供理发服务）')
  }
  
  const now = Date.now()
  
  // 创建预约记录
  try {
    const result = await appointmentsCollection.add({
      data: {
        date,
        timeSlot,
        timeSlotDisplay: slotConfig.display,
        appointeeName: appointeeName.trim(),
        bookerId: openid,
        bookerName,
        isProxy,
        displayName: isProxy ? `${appointeeName.trim()}（${bookerName}）` : appointeeName.trim(),
        status: 'booked',
        createdAt: now,
        updatedAt: now
      }
    })
    
    // 发送推送通知给招待员
    await notifyReceptionists(appointeeName.trim(), date, slotConfig.display, isProxy, bookerName)
    
    return success({
      _id: result._id,
      message: '预约成功'
    }, '预约成功')
  } catch (error) {
    // 检查是否为唯一索引冲突
    if (error.message && error.message.includes('duplicate key')) {
      throw new Error('该时段已被预约，请选择其他时段')
    }
    throw new Error('创建预约失败: ' + error.message)
  }
}

/**
 * 通知招待员
 */
async function notifyReceptionists(appointeeName, date, timeSlotDisplay, isProxy, bookerName) {
  try {
    // 查询所有招待员
    const receptionistsRes = await usersCollection
      .where({
        position: '招待员',
        status: 'approved'
      })
      .get()
    
    if (!receptionistsRes.data || receptionistsRes.data.length === 0) {
      return
    }
    
    // 发送订阅消息
    const message = isProxy 
      ? `【理发预约】${appointeeName}（由${bookerName}代约）预约了 ${date} ${timeSlotDisplay} 的理发服务`
      : `【理发预约】${appointeeName} 预约了 ${date} ${timeSlotDisplay} 的理发服务`
    
    // 这里可以调用微信订阅消息接口
    // 由于需要用户订阅才能发送，这里仅记录日志
    console.log('通知招待员:', message)
    
    // 实际项目中可以使用 cloud.openapi.subscribeMessage.send
    // 需要先让招待员订阅消息模板
  } catch (error) {
    console.error('通知招待员失败:', error)
  }
}

/**
 * 取消预约
 */
async function cancelAppointment(openid, appointmentId, cancelReason) {
  // 获取预约记录
  const appointmentRes = await appointmentsCollection.doc(appointmentId).get()
  if (!appointmentRes.data) {
    throw new Error('预约记录不存在')
  }
  
  const appointment = appointmentRes.data
  
  // 检查预约状态
  if (appointment.status !== 'booked') {
    throw new Error('该预约已取消或已完成')
  }
  
  // 获取当前用户信息
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }
  
  const user = userResult.data[0]
  const isReceptionist = user.position === '招待员'
  const isOwner = appointment.bookerId === openid
  
  // 权限检查：只有预约创建者或招待员可以取消
  if (!isOwner && !isReceptionist) {
    throw new Error('无权取消此预约')
  }
  
  // 招待员取消他人预约需要填写原因
  if (!isOwner && isReceptionist && !cancelReason) {
    throw new Error('请选择取消原因')
  }
  
  const now = Date.now()
  
  await appointmentsCollection.doc(appointmentId).update({
    data: {
      status: 'cancelled',
      cancelReason: cancelReason || '用户主动取消',
      cancelledAt: now,
      cancelledBy: user.name,
      updatedAt: now
    }
  })
  
  return success({}, '取消成功')
}

/**
 * 获取本月预约列表
 */
async function getAppointments(openid, params = {}) {
  const { year, month, sortBy = 'time' } = params
  
  // 验证用户权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }
  
  const user = userResult.data[0]
  if (!HAIRCUT_VIEWER_POSITIONS.includes(user.position)) {
    throw new Error('您无权查看理发预约列表')
  }
  
  // 构建日期范围
  const now = new Date()
  const targetYear = year || now.getFullYear()
  const targetMonth = month !== undefined ? month : now.getMonth() + 1
  
  const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
  let endDate
  if (targetMonth === 12) {
    endDate = `${targetYear + 1}-01-01`
  } else {
    endDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`
  }
  
  // 查询预约记录
  const result = await appointmentsCollection
    .where({
      date: _.gte(startDate).and(_.lt(endDate)),
      status: _.in(['booked', 'cancelled', 'completed'])
    })
    .orderBy('date', 'asc')
    .orderBy('timeSlot', 'asc')
    .get()
  
  let list = result.data || []
  
  // 按人员排序
  if (sortBy === 'name') {
    list.sort((a, b) => {
      const nameCompare = a.appointeeName.localeCompare(b.appointeeName, 'zh-CN')
      if (nameCompare !== 0) return nameCompare
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.timeSlot.localeCompare(b.timeSlot)
    })
  }
  
  return success({
    list,
    total: list.length,
    year: targetYear,
    month: targetMonth
  })
}

/**
 * 获取我的预约记录
 */
async function getMyAppointments(openid, page = 1, pageSize = 20) {
  const countRes = await appointmentsCollection
    .where({ bookerId: openid })
    .count()
  
  const dataRes = await appointmentsCollection
    .where({ bookerId: openid })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return success({
    list: dataRes.data || [],
    total: countRes.total,
    page,
    pageSize
  })
}

/**
 * 获取取消原因列表
 */
function getCancelReasons() {
  return success({
    reasons: CANCEL_REASONS
  })
}

// 云函数入口
exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  const action = event && event.action

  try {
    switch (action) {
      case 'getDisplayDates':
        return await getDisplayDates()
      
      case 'getAvailableSlots':
        return await getAvailableSlots(event.date)
      
      case 'createAppointment':
        return await createAppointment(openid, event.appointmentData)
      
      case 'cancelAppointment':
        return await cancelAppointment(openid, event.appointmentId, event.cancelReason)
      
      case 'getAppointments':
        return await getAppointments(openid, event.params)
      
      case 'getMyAppointments':
        return await getMyAppointments(openid, event.page, event.pageSize)
      
      case 'getCancelReasons':
        return getCancelReasons()
      
      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}