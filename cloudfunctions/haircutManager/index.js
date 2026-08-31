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
const HAIRCUT_VIEWER_POSITIONS = ['招待员', '会计主管', '会计', '办公室内聘']

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
    return success({ slotsByDate: {}, changedDates: [] })
  }

  // 查询这些日期的所有有效预约和不可预约记录
  const bookedResult = await appointmentsCollection
    .where({
      date: _.in(dates),
      status: _.in(['booked', 'unavailable'])
    })
    .field({
      _id: true,       // 加上这行
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
          _id: item._id,              // 加上这行
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

  // 查询换日标记（临时理发日 + 被换走的源日期）
  const changedResult = await appointmentsCollection
    .where({
      date: _.in(dates),
      status: 'date_changed'
    })
    .field({ date: true, sourceDate: true })
    .get()

  const changedDates = (changedResult.data || []).map(r => r.date)
  const movedSourceDates = (changedResult.data || []).map(r => r.sourceDate).filter(Boolean)

  return success({ slotsByDate, changedDates, movedSourceDates })
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

  // 检查是否为理发日（标准 135 或换日后的临时理发日）
  const dayOfWeek = targetDate.getDay()
  if (![1, 3, 5].includes(dayOfWeek)) {
    // 非标准理发日，检查是否有换日标记
    const markerRes = await appointmentsCollection
      .where({ date, status: 'date_changed' })
      .limit(1)
      .get()
    if (!markerRes.data || markerRes.data.length === 0) {
      throw new Error('该日期非理发日（仅周一、三、五提供理发服务）')
    }
  }

  const now = Date.now()

  // 创建预约记录
  try {
    // 先查询该时段是否已有记录（包括已取消的）
    const existingRes = await appointmentsCollection
      .where({ date, timeSlot })
      .limit(1)
      .get()
    
    if (existingRes.data && existingRes.data.length > 0) {
      // 已有记录，更新为新的预约（复用已取消/已完成的记录）
      const existing = existingRes.data[0]
      
      if (existing.status === 'booked') {
        throw new Error('该时段已被预约')
      }
      if (existing.status === 'unavailable') {
        throw new Error('该时段不可预约')
      }
      
      // status 为 cancelled 或 completed，更新为新预约
      await appointmentsCollection.doc(existing._id).update({
        data: {
          appointeeName: appointeeName.trim(),
          bookerId: openid,
          bookerName,
          isProxy,
          displayName: isProxy ? `${appointeeName.trim()}（${bookerName}）` : appointeeName.trim(),
          status: 'booked',
          cancelReason: _.remove(),    // 清除旧的取消信息
          cancelledAt: _.remove(),
          cancelledBy: _.remove(),
          updatedAt: now
        }
      })
      
      await notifyReceptionists(appointeeName.trim(), date, slotConfig.display, isProxy, bookerName)
      
      return success({
        _id: existing._id,
        message: '预约成功'
      }, '预约成功')
    }
    
    // 没有已有记录，新建
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
    
    await notifyReceptionists(appointeeName.trim(), date, slotConfig.display, isProxy, bookerName)
    
    return success({
      _id: result._id,
      message: '预约成功'
    }, '预约成功')
  } catch (error) {
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
  const isReceptionist = Array.isArray(user.position) && user.position.includes('招待员')
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
 * 获取理发统计列表（支持分页）
 * @param {Object} params - 查询参数
 * @param {number} params.year - 年份（可选）
 * @param {number} params.month - 月份（可选）
 * @param {string} params.sortBy - 排序方式：time(默认) / name
 * @param {number} params.page - 页码（默认1，按时间排序时生效）
 * @param {number} params.pageSize - 每页条数（默认10，按时间排序时生效）
 */
async function getAppointments(openid, params = {}) {
  const {
    year,
    month,
    sortBy = 'time',
    page = 1,
    pageSize = 10
  } = params

  // 验证用户权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  const isAdmin = user.isAdmin === true
  const isLeader = user.role === '馆员' && user.department === '无' && !user.isRestrictedLeader
  const isBanHead = user.role === '馆员' && user.department === '办' && user.isDepartmentHead === true
  const isAllowedPositions = Array.isArray(user.position) && user.position.some(p => HAIRCUT_VIEWER_POSITIONS.includes(p))
  // 管理员、领导、办负责人、其他允许的岗位人员，可以查看理发统计
  const canView = isAdmin || isLeader || isBanHead || isAllowedPositions || user.isExpandedPrivilege === true
  if (!canView) {
    throw new Error('您无权查看理发预约列表')
  }

  // 构建日期范围
  const now = new Date()
  let startDate, endDate

  if (year === undefined && month === undefined) {
    // 无任何限制：查询所有历史记录
    startDate = '2000-01-01'
    endDate = '2099-12-31'
  } else if (year !== undefined && month === undefined) {
    // 指定年份，查全年
    startDate = `${year}-01-01`
    endDate = `${year + 1}-01-01`
  } else {
    // 指定年月，查单月
    const y = year || now.getFullYear()
    const m = month || now.getMonth() + 1
    startDate = `${y}-${String(m).padStart(2, '0')}-01`
    if (m === 12) {
      endDate = `${y + 1}-01-01`
    } else {
      endDate = `${y}-${String(m + 1).padStart(2, '0')}-01`
    }
  }

  // 构建基础查询条件
  const whereCondition = {
    date: _.gte(startDate).and(_.lt(endDate)),
    status: _.in(['booked', 'cancelled', 'completed'])
  }

  // 按时间排序：支持分页，每次返回一页数据
  if (sortBy === 'time') {
    // count 必须带上相同的 where 条件
    const countResult = await appointmentsCollection.where(whereCondition).count()
    const total = countResult.total

    let list = []
    if (total > 0) {
      const result = await appointmentsCollection
        .where(whereCondition)
        .orderBy('date', 'desc')
        .orderBy('timeSlot', 'asc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
      list = result.data || []
    }

    return {
      code: 0,
      message: 'ok',
      data: {
        list,
        total,
        page,
        pageSize,
        hasMore: (page * pageSize) < total
      }
    }
  }

  // 按人员排序：一次性返回全部原始记录（前端按月聚合统计，不需要分页）
  const MAX_LIMIT = 100
  const countResult = await appointmentsCollection.where(whereCondition).count()
  const total = countResult.total
  let list = []
  if (total > 0) {
    const batchTimes = Math.ceil(total / MAX_LIMIT)
    for (let i = 0; i < batchTimes; i++) {
      const batchResult = await appointmentsCollection
        .where(whereCondition)
        .orderBy('date', 'asc')
        .orderBy('timeSlot', 'asc')
        .skip(i * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()
      list = list.concat(batchResult.data || [])
    }
  }

  // 按人员名排序（方便前端聚合）
  list.sort((a, b) => {
    const nameCompare = a.appointeeName.localeCompare(b.appointeeName, 'zh-CN')
    if (nameCompare !== 0) return nameCompare
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare
    return a.timeSlot.localeCompare(b.timeSlot)
  })

  return {
    code: 0,
    message: 'ok',
    data: {
      list,
      total: list.length
    }
  }
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
  if (!(Array.isArray(user.position) && user.position.includes('招待员'))) {
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
  if (!(Array.isArray(user.position) && user.position.includes('招待员'))) {
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

/**
 * 截断文本（微信 thing 类型限制20字）
 */
function truncateText(text, len) {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) : text
}

/**
 * 从 sys_config 读取时区偏移（小时，默认 -3）
 */
async function getTimezoneOffset() {
  try {
    const configRes = await db.collection('sys_config')
      .where({ type: 'timezone', key: 'TIMEZONE_OFFSET' })
      .limit(1)
      .get()
    if (configRes.data && configRes.data.length > 0) {
      const val = configRes.data[0].value
      return val !== undefined && val !== null ? Number(val) : -3
    }
  } catch (e) {
    // 降级使用默认值
  }
  return -3
}

/**
 * 把时间戳转成指定时区的 YYYY-MM-DD 日期字符串
 */
function formatLocalDate(timestamp, offsetHours) {
  const date = new Date(timestamp)
  const utc = date.getTime() + date.getTimezoneOffset() * 60000
  const local = new Date(utc + (offsetHours || 0) * 3600000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`
}

/**
 * 换日（招待员专用）
 * 将源日期的全部预约合并填充到目标日期的空位，并在目标日期标记临时理发日
 */
async function changeDate(openid, sourceDate, targetDate) {
  // 1. 校验招待员权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }
  const user = userResult.data[0]
  if (!(Array.isArray(user.position) && user.position.includes('招待员'))) {
    throw new Error('只有招待员可以换日')
  }

  // 2. 校验日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('日期格式不正确')
  }
  if (sourceDate === targetDate) {
    throw new Error('目标日期不能与源日期相同')
  }

  // 3. 校验目标日期非过去（按本地时区计算「今天」）
  const offsetHours = await getTimezoneOffset()
  const todayStr = formatLocalDate(Date.now(), offsetHours)
  if (targetDate < todayStr) {
    throw new Error('目标日期不能早于今天')
  }

  // 4. 校验目标日期非节假日
  const targetYear = parseInt(targetDate.split('-')[0], 10)
  const holidays = await getHolidays([targetYear])
  if (holidays.includes(targetDate)) {
    throw new Error('目标日期为节假日，不提供理发服务')
  }

  // 5. 查源日期的 booked 记录（按时段排序）
  const sourceBooked = await appointmentsCollection
    .where({ date: sourceDate, status: 'booked' })
    .orderBy('timeSlot', 'asc')
    .get()

  // 6. 查目标日期已占用时段
  const targetOccupied = await appointmentsCollection
    .where({ date: targetDate, status: _.in(['booked', 'unavailable', 'date_changed']) })
    .field({ timeSlot: true })
    .get()
  const occupiedSlots = (targetOccupied.data || []).map(r => r.timeSlot)

  // 7. 计算目标空位（按 TIME_SLOTS 顺序）
  const freeSlots = TIME_SLOTS.map(s => s.start).filter(s => !occupiedSlots.includes(s))

  // 8. 容量检查
  const sourceCount = (sourceBooked.data || []).length
  if (sourceCount > freeSlots.length) {
    throw new Error(`目标日期空位不足（剩 ${freeSlots.length} 个空位，需容纳 ${sourceCount} 个预约）`)
  }

  // 9. 按顺序填充：源预约按时段升序，逐个填到目标空位
  const moves = []
  const nowTs = Date.now()
  for (let i = 0; i < sourceCount; i++) {
    const booking = sourceBooked.data[i]
    const newSlot = freeSlots[i]
    const slotConfig = TIME_SLOTS.find(s => s.start === newSlot)

    await appointmentsCollection.doc(booking._id).update({
      data: {
        date: targetDate,
        timeSlot: newSlot,
        timeSlotDisplay: slotConfig.display,
        movedFromDate: sourceDate,
        movedAt: nowTs,
        updatedAt: nowTs
      }
    })

    moves.push({
      appointeeName: booking.appointeeName,
      bookerId: booking.bookerId,
      oldSlotDisplay: booking.timeSlotDisplay,
      newSlotDisplay: slotConfig.display
    })
  }

  // 10. 删除源日期的 unavailable 记录；查源日期是否本身是临时理发日（追溯最初源日期）
  await appointmentsCollection.where({ date: sourceDate, status: 'unavailable' }).remove()

  const sourceMarkerRes = await appointmentsCollection
    .where({ date: sourceDate, status: 'date_changed' })
    .limit(1)
    .get()
  const originSourceDate = (sourceMarkerRes.data && sourceMarkerRes.data.length > 0)
    ? (sourceMarkerRes.data[0].sourceDate || sourceDate)
    : sourceDate

  // 删除源日期的 date_changed 标记
  await appointmentsCollection.where({ date: sourceDate, status: 'date_changed' }).remove()

  // 11. 写入/更新目标日期的 date_changed 标记（sourceDate 用最初源日期）
  const existingMarker = await appointmentsCollection
    .where({ date: targetDate, status: 'date_changed' })
    .limit(1)
    .get()

  if (existingMarker.data && existingMarker.data.length > 0) {
    await appointmentsCollection.doc(existingMarker.data[0]._id).update({
      data: {
        sourceDate: originSourceDate,
        changedBy: user.name,
        changedAt: nowTs,
        updatedAt: nowTs
      }
    })
  } else {
    await appointmentsCollection.add({
      data: {
        date: targetDate,
        timeSlot: '__date_changed__',
        timeSlotDisplay: '换日标记',
        status: 'date_changed',
        sourceDate: originSourceDate,
        changedBy: user.name,
        changedAt: nowTs,
        createdAt: nowTs,
        updatedAt: nowTs
      }
    })
  }

  // 12. 给被挪动的预约人发订阅消息
  await notifyMovedBookers(moves, targetDate)

  return success({ moves, movedCount: moves.length }, '换日成功')
}

/**
 * 通知被挪动的预约人（订阅消息模板4：未读消息提醒）
 */
async function notifyMovedBookers(moves, targetDate) {
  const templateId = 'mJ1CGM8OvpgomnYy0yot4Kk8hD8S-NH06A6ZDywdpGc'

  for (const move of moves) {
    if (!move.bookerId) continue
    try {
      const timeStr = `${targetDate} ${move.newSlotDisplay.split('~')[0] || ''}`
      await cloud.openapi.subscribeMessage.send({
        touser: move.bookerId,
        templateId,
        page: 'pages/office/haircut/haircut',
        data: {
          thing7: { value: truncateText('理发预约调整', 20) },
          time2: { value: timeStr },
          thing6: { value: truncateText('换日通知', 20) },
          thing3: { value: truncateText(`您的理发预约已改至 ${targetDate} ${move.newSlotDisplay}`, 20) },
          thing4: { value: truncateText('请按新时段前往理发', 20) }
        }
      })
      console.log('[换日通知✓] 已通知:', move.bookerId, move.appointeeName)
    } catch (error) {
      console.warn('[换日通知✗] 发送失败:', move.bookerId, JSON.stringify({
        errcode: error.errcode || error.errCode || 'unknown',
        errmsg: error.errmsg || error.errMsg || error.message
      }))
    }
  }
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

      case 'changeDate':
        return await changeDate(openid, event.sourceDate, event.targetDate)

      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}