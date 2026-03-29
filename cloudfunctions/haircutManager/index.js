/**
 * 理发预约管理云函数
 * 
 * 功能：
 * - getReservationSlots: 获取各日期已预约时段（简化版，前端计算日期和时段列表）
 * - createAppointment: 创建预约
 * - cancelAppointment: 取消预约
 * - getAppointments: 查询理发统计列表
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
 * 解析日期字符串为 Date 对象（本地时间）
 */
function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * 获取节假日列表（多年份）
 * 用于创建预约时校验
 */
async function getHolidays(years) {
  const db = cloud.database()
  const holidayConfigsCollection = db.collection('holiday_configs')
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
 * 获取各日期已预约时段（完整版）
 * 返回完整预约信息，供前端判断"我已预约"和招待员显示理发人
 * 
 * @param {Array} dates - 前端计算并过滤节假日后的日期列表
 * @returns {Object} slotsByDate - 各日期预约详情
 */
async function getReservationSlots(dates) {
  if (!Array.isArray(dates) || dates.length === 0) {
    return success({ slotsByDate: {} })
  }

  // 查询这些日期的所有有效预约和不可预约记录
  const bookedResult = await appointmentsCollection
    .where({
      date: _.in(dates),
      status: _.in(['booked', 'unavailable'])
    })
    .field({ 
      date: true, 
      timeSlot: true, 
      timeSlotDisplay: true,
      appointeeName: true,
      displayName: true,
      isProxy: true,
      bookerId: true,
      status: true
    })
    .get()

  // 按日期分组
  const slotsByDate = {}
  dates.forEach(d => {
    slotsByDate[d] = []
  })

  if (bookedResult.data && bookedResult.data.length > 0) {
    bookedResult.data.forEach(item => {
      if (slotsByDate[item.date]) {
        slotsByDate[item.date].push({
          timeSlot: item.timeSlot,
          timeSlotDisplay: item.timeSlotDisplay,
          status: item.status, // 'booked' 或 'unavailable'
          appointeeName: item.appointeeName,
          displayName: item.displayName,
          isProxy: item.isProxy,
          bookerId: item.bookerId
        })
      }
    })
  }

  return success({ slotsByDate })
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
 * 获取理发统计列表
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

  let startDate, endDate
  if (targetMonth === undefined) {
    // 查询全年
    startDate = `${targetYear}-01-01`
    endDate = `${targetYear + 1}-01-01`
  } else {
    // 查询单月
    startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
    if (targetMonth === 12) {
      endDate = `${targetYear + 1}-01-01`
    } else {
      endDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`
    }
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

/**
 * 设置时段状态（招待员专用）
 * 可将可预约时段设为不可预约，或将不可预约时段恢复为可预约
 */
async function setSlotStatus(openid, date, timeSlot, status) {
  // 验证时段是否有效
  const slotConfig = TIME_SLOTS.find(s => s.start === timeSlot)
  if (!slotConfig) {
    throw new Error('时段无效')
  }

  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('日期格式不正确')
  }

  // 获取用户信息，验证是否为招待员
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  if (user.position !== '招待员') {
    throw new Error('只有招待员可以设置时段状态')
  }

  const now = Date.now()

  if (status === 'unavailable') {
    // 检查是否已有记录（包括已取消的，因为有唯一索引）
    const existingRes = await appointmentsCollection
      .where({
        date,
        timeSlot
      })
      .limit(1)
      .get()

    if (existingRes.data && existingRes.data.length > 0) {
      const existing = existingRes.data[0]
      if (existing.status === 'booked') {
        throw new Error('该时段已被预约')
      } else if (existing.status === 'unavailable') {
        throw new Error('该时段已设为不可预约')
      } else if (existing.status === 'cancelled' || existing.status === 'completed') {
        // 已取消或已完成的记录，更新为不可预约
        await appointmentsCollection.doc(existing._id).update({
          data: {
            status: 'unavailable',
            setBy: user.name,
            updatedAt: now
          }
        })
        return success({}, '已设置为不可预约')
      }
    }

    // 创建新的不可预约记录
    await appointmentsCollection.add({
      data: {
        date,
        timeSlot,
        timeSlotDisplay: slotConfig.display,
        status: 'unavailable',
        setBy: user.name,
        createdAt: now,
        updatedAt: now
      }
    })

    return success({}, '已设置为不可预约')
  } else if (status === 'available') {
    // 查找不可预约记录
    const unavailableRes = await appointmentsCollection
      .where({
        date,
        timeSlot,
        status: 'unavailable'
      })
      .limit(1)
      .get()

    if (!unavailableRes.data || unavailableRes.data.length === 0) {
      throw new Error('该时段不是不可预约状态')
    }

    // 删除不可预约记录
    await appointmentsCollection.doc(unavailableRes.data[0]._id).remove()

    return success({}, '已恢复为可预约')
  } else {
    throw new Error('无效的状态')
  }
}

/**
 * 招待员取消预约（带原因）
 */
async function cancelAppointmentByReceptionist(openid, date, timeSlot, cancelReason) {
  // 验证取消原因
  if (!cancelReason) {
    throw new Error('请选择取消原因')
  }

  // 获取用户信息，验证是否为招待员
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  if (user.position !== '招待员') {
    throw new Error('只有招待员可以取消预约')
  }

  // 查找预约记录
  const appointmentRes = await appointmentsCollection
    .where({
      date,
      timeSlot,
      status: 'booked'
    })
    .limit(1)
    .get()

  if (!appointmentRes.data || appointmentRes.data.length === 0) {
    throw new Error('该时段没有预约记录')
  }

  const appointment = appointmentRes.data[0]
  const now = Date.now()

  // 更新为已取消
  await appointmentsCollection.doc(appointment._id).update({
    data: {
      status: 'cancelled',
      cancelReason,
      cancelledAt: now,
      cancelledBy: user.name,
      updatedAt: now
    }
  })

  return success({}, '取消成功')
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
      case 'getReservationSlots':
        return await getReservationSlots(event.dates)
      
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

      case 'setSlotStatus':
        return await setSlotStatus(openid, event.date, event.timeSlot, event.status)

      case 'cancelAppointmentByReceptionist':
        return await cancelAppointmentByReceptionist(openid, event.date, event.timeSlot, event.cancelReason)

      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}