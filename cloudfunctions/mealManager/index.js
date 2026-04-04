/**
 * 餐食管理云函数
 *
 * 工作餐相关 action:
 *   - getMyMealStatus:      获取当前用户工作餐订阅状态
 *   - saveMealStatus:       保存/更新首次入伙信息
 *   - submitMealAdjustment: 提交工作餐调整（停餐/退伙/入伙）
 *   - getAdjustmentList:    获取调整记录列表（管理端）
 *   - getMyAdjustments:     获取当前用户的调整历史
 *
 * 副食征订相关 action:
 *   - getSideDishOrders:        获取有效副食征订单列表
 *   - createSideDishOrder:     创建新副食征订单
 *   - bookSideDish:            提交/修改/取消副食预订
 *   - getSideDishBookings:     获取某征订单的所有预订记录（管理端）
 *   - getMySideDishBookings:   获取当前用户的预订汇总
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 集合引用
const subscriptionsCollection = db.collection('meal_subscriptions')
const adjustmentsCollection = db.collection('meal_adjustments')
const sideDishOrdersCollection = db.collection('side_dish_orders')
const sideDishBookingsCollection = db.collection('side_dish_bookings')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data !== undefined ? data : {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 获取当前用户的工作餐订阅状态
 * 返回 null 表示从未设置过（需弹首次入伙窗）
 */
async function getMyMealStatus(openid) {
  try {
    const res = await subscriptionsCollection.where({ openid }).get()
    if (res.data && res.data.length > 0) {
      return success(res.data[0])
    }
    return success(null)
  } catch (error) {
    console.error('获取餐食状态失败:', error)
    return fail(error.message || '获取餐食状态失败')
  }
}

/**
 * 保存/更新首次入伙状态
 * params: { isEnrolled: boolean, mealCount: number }
 */
async function saveMealStatus(openid, userInfo, params) {
  try {
    const { isEnrolled, mealCount } = params

    if (typeof isEnrolled !== 'boolean') {
      return fail('请选择是否入伙', 400)
    }

    if (isEnrolled && (!mealCount || mealCount < 1)) {
      return fail('订餐份数至少为1', 400)
    }

    if (!isEnrolled && mealCount > 0) {
      return fail('未入伙时不需要填写份数', 400)
    }

    // 查询是否已有记录
    const existing = await subscriptionsCollection.where({ openid }).get()
    const now = Date.now()

    if (existing.data && existing.data.length > 0) {
      // 更新现有记录
      const updateData = {
        isEnrolled,
        mealCount: isEnrolled ? (mealCount || 1) : 0,
        status: isEnrolled ? 'active' : 'none',
        updatedAt: now
      }
      await subscriptionsCollection.doc(existing.data[0]._id).update({ data: updateData })

      // 如果是重新入伙，记录一条调整
      if (isEnrolled) {
        await adjustmentsCollection.add({
          data: {
            openid,
            name: userInfo.name || '',
            adjustmentType: 'enroll',
            startDate: '',
            endDate: null,
            count: mealCount || 1,
            monthKey: formatMonthKey(now),
            createdAt: now
          }
        })
      }

      const updated = await subscriptionsCollection.doc(existing.data[0]._id).get()
      return success(updated.data)
    } else {
      // 新建记录
      const newRecord = {
        openid,
        name: userInfo.name || '',
        role: userInfo.role || '',
        position: userInfo.position || '',
        isEnrolled,
        mealCount: isEnrolled ? (mealCount || 1) : 0,
        status: isEnrolled ? 'active' : 'none',
        createdAt: now,
        updatedAt: now
      }
      const addRes = await subscriptionsCollection.add({ data: newRecord })
      newRecord._id = addRes._id

      // 记录首次入伙调整
      if (isEnrolled) {
        await adjustmentsCollection.add({
          data: {
            openid,
            name: userInfo.name || '',
            adjustmentType: 'enroll',
            startDate: '',
            endDate: null,
            count: mealCount || 1,
            monthKey: formatMonthKey(now),
            createdAt: now
          }
        })
      }

      return success(newRecord)
    }
  } catch (error) {
    console.error('保存餐食状态失败:', error)
    return fail(error.message || '保存失败')
  }
}

/**
 * 提交工作餐调整
 * params: { adjustmentType, startDate, endDate?, count }
 */
async function submitMealAdjustment(openid, userInfo, params) {
  try {
    const { adjustmentType, startDate, endDate, count } = params

    if (!['suspend', 'withdraw', 'enroll'].includes(adjustmentType)) {
      return fail('无效的调整类型', 400)
    }

    if (!startDate && adjustmentType !== 'enroll') {
      return fail('请选择开始日期', 400)
    }

    if (!count || count < 1) {
      return fail('份数必须大于0', 400)
    }

    // 查询当前订阅状态（enroll 类型允许无记录，会自动创建）
    const subRes = await subscriptionsCollection.where({ openid }).get()
    const subscription = subRes.data && subRes.data.length > 0 ? subRes.data[0] : null

    // 非 enroll 类型必须有现有记录
    if (!subscription && adjustmentType !== 'enroll') {
      return fail('请先设置工作餐状态', 400)
    }

    const now = Date.now()

    // enroll 且无记录时，直接创建订阅记录
    if (!subscription && adjustmentType === 'enroll') {
      const newSubRecord = {
        openid,
        name: userInfo.name || '',
        role: userInfo.role || '',
        position: userInfo.position || '',
        isEnrolled: true,
        mealCount: count,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
      const addSubRes = await subscriptionsCollection.add({ data: newSubRecord })
      newSubRecord._id = addSubRes._id

      // 创建入伙调整记录
      const record = {
        openid,
        name: userInfo.name || '',
        adjustmentType: 'enroll',
        startDate: '',
        endDate: null,
        count,
        monthKey: formatMonthKey(now),
        createdAt: now
      }
      const addAdjRes = await adjustmentsCollection.add({ data: record })
      record._id = addAdjRes._id
      return success(record)
    }

    // 根据类型做业务校验（不含时间判断，由前端处理）
    switch (adjustmentType) {
      case 'suspend':
        if (!subscription.isEnrolled) {
          return fail('当前未入伙，无法停餐', 400)
        }
        if (count > subscription.mealCount) {
          return fail(`停餐份数不能超过已订餐份数(${subscription.mealCount})`, 400)
        }
        break

      case 'withdraw':
        if (!subscription.isEnrolled) {
          return fail('当前未入伙，无法退伙', 400)
        }
        if (count > subscription.mealCount) {
          return fail(`退伙份数不能超过已订餐份数(${subscription.mealCount})`, 400)
        }
        break

      case 'enroll':
        // 未入伙→入伙，无需额外校验
        break
    }

    // 创建调整记录
    const record = {
      openid,
      name: userInfo.name || '',
      adjustmentType,
      startDate: startDate || '',
      endDate: endDate || null,
      count,
      monthKey: formatMonthKey(now),
      createdAt: now
    }
    const addRes = await adjustmentsCollection.add({ data: record })
    record._id = addRes._id

    // 更新订阅状态
    let newStatus = subscription.status
    let updateData = { updatedAt: now }

    switch (adjustmentType) {
      case 'suspend':
        newStatus = 'suspended'
        break
      case 'withdraw':
        newStatus = 'withdrawn'
        updateData.isEnrolled = false
        updateData.mealCount = 0
        break
      case 'enroll':
        newStatus = 'active'
        updateData.isEnrolled = true
        updateData.mealCount = count
        break
    }
    updateData.status = newStatus

    await subscriptionsCollection.doc(subscription._id).update({ data: updateData })

    return success(record)
  } catch (error) {
    console.error('提交调整失败:', error)
    return fail(error.message || '提交失败')
  }
}

/**
 * 获取调整记录列表（管理端）
 * 按提交时间倒序，支持分页
 */
async function getAdjustmentList(params) {
  try {
    const { page = 1, pageSize = 20 } = params
    const skip = (page - 1) * pageSize

    const [countRes, listRes] = await Promise.all([
      adjustmentsCollection.count(),
      adjustmentsCollection
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
    ])

    return success({
      list: listRes.data,
      total: countRes.total,
      hasMore: skip + listRes.data.length < countRes.total
    })
  } catch (error) {
    console.error('获取调整列表失败:', error)
    return fail(error.message || '获取列表失败')
  }
}

/**
 * 获取当前用户的工作餐调整历史记录（按时间倒序）
 */
async function getMyAdjustments(openid) {
  try {
    const [countRes, listRes] = await Promise.all([
      adjustmentsCollection.where({ openid }).count(),
      adjustmentsCollection.where({ openid }).orderBy('createdAt', 'desc').limit(20).get()
    ])

    return success({
      list: listRes.data || [],
      total: countRes.total,
      hasMore: countRes.total > 20
    })
  } catch (error) {
    console.error('获取调整历史失败:', error)
    return fail(error.message || '获取调整历史失败')
  }
}
function formatMonthKey(timestamp) {
  const d = new Date(timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function getTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ==================== 副食征订相关函数 ====================

/**
 * 获取有效副食征订单列表
 * 返回所有未截止的征订单，同时附带当前用户的预订状态
 */
async function getSideDishOrders(openid) {
  try {
    const today = getTodayStr()

    // 查询所有有效（未截止）或今天及以后的征订单
    const listRes = await sideDishOrdersCollection
      .where(_.or([
        { status: 'active', deadline: _.gte(today) },
        { status: 'active', deadline: _.gt(today) }
      ]))
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()

    let orders = listRes.data || []

    // 批量更新已过期的征订单状态
    const expiredIds = orders.filter(o => o.deadline < today).map(o => o._id)
    if (expiredIds.length > 0) {
      for (const id of expiredIds) {
        await sideDishOrdersCollection.doc(id).update({
          data: { status: 'expired', updatedAt: Date.now() }
        })
      }
      // 重新查询（排除已过期的）
      const freshRes = await sideDishOrdersCollection
        .where({ status: 'active', deadline: _.gte(today) })
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
      orders = freshRes.data || []
    }

    // 查询当前用户的所有有效预订
    const bookingRes = await sideDishBookingsCollection
      .where({ openid, status: 'booked' })
      .get()
    const myBookings = bookingRes.data || []
    const myBookingMap = {}
    myBookings.forEach(b => { myBookingMap[b.orderId] = b })

    // 组装返回数据：每个征订单附加当前用户的预订信息
    const result = orders.map(order => {
      const myBooking = myBookingMap[order._id]
      return {
        ...order,
        myBookedCount: myBooking ? myBooking.count : 0,
        myBookingId: myBooking ? myBooking._id : ''
      }
    })

    return success(result)
  } catch (error) {
    console.error('获取副食征订单失败:', error)
    return fail(error.message || '获取征订单失败')
  }
}

/**
 * 创建新的副食征订单
 * params: { title, description, maxCount, deadline }
 */
async function createSideDishOrder(openid, userInfo, params) {
  try {
    const { title, description, maxCount, deadline } = params

    if (!title || !title.trim()) {
      return fail('请输入征订标题', 400)
    }

    if (!description || !description.trim()) {
      return fail('请输入副食详情', 400)
    }

    if (!maxCount || maxCount < 1) {
      return fail('最大预订份数至少为1', 400)
    }

    if (!deadline) {
      return fail('请选择截止日期', 400)
    }

    // 校验截止日期不能早于今天
    const today = getTodayStr()
    if (deadline < today) {
      return fail('截止日期不能早于今天', 400)
    }

    const now = Date.now()
    const newOrder = {
      title: title.trim(),
      description: description.trim(),
      maxCount,
      deadline,
      creatorOpenid: openid,
      creatorName: userInfo.name || '',
      status: 'active',
      totalBookedCount: 0,
      createdAt: now,
      updatedAt: now
    }

    const addRes = await sideDishOrdersCollection.add({ data: newOrder })
    newOrder._id = addRes._id

    return success(newOrder)
  } catch (error) {
    console.error('创建副食征订单失败:', error)
    return fail(error.message || '创建征订单失败')
  }
}

/**
 * 提交/修改/取消副食预订
 * params: { orderId, action: 'book'|'cancel', count? }
 * - book: 提交或修改预订份数（幂等：同一用户对同一征订单只有一条有效记录）
 * - cancel: 取消预订（将 status 改为 cancelled）
 */
async function bookSideDish(openid, params) {
  try {
    const { orderId, action, count } = params

    if (!orderId) {
      return fail('缺少征订单ID', 400)
    }

    if (!['book', 'cancel'].includes(action)) {
      return fail('无效的操作类型', 400)
    }

    // 查询征订单
    const orderRes = await sideDishOrdersCollection.doc(orderId).get()
    if (!orderRes.data) {
      return fail('征订单不存在', 404)
    }

    const order = orderRes.data

    // 检查是否已截止
    const today = getTodayStr()
    if (order.deadline < today || order.status === 'expired') {
      return fail('该征订单已截止，无法操作', 400)
    }

    if (action === 'book') {
      if (!count || count < 1) {
        return fail('预订份数至少为1', 400)
      }

      const maxAllowed = order.maxCount * 2
      if (count > maxAllowed) {
        return fail(`每人最多可预订${maxAllowed}份`, 400)
      }

      // 查询是否已有有效预订
      const existingRes = await sideDishBookingsCollection
        .where({ orderId, openid, status: 'booked' })
        .get()
      const existing = existingRes.data && existingRes.data.length > 0 ? existingRes.data[0] : null

      const now = Date.now()

      if (existing) {
        // 更新现有预订
        await sideDishBookingsCollection.doc(existing._id).update({
          data: { count, updatedAt: now }
        })
      } else {
        // 新建预订记录
        await sideDishBookingsCollection.add({
          data: {
            orderId,
            openid,
            name: params.bookerName || '',
            count,
            status: 'booked',
            createdAt: now,
            updatedAt: now
          }
        })
      }

      // 更新征订单的 totalBookedCount 冗余字段
      await refreshTotalBookedCount(orderId)

      return success({ orderId, count, action: 'booked' })
    } else if (action === 'cancel') {
      // 查找有效预订
      const existingRes = await sideDishBookingsCollection
        .where({ orderId, openid, status: 'booked' })
        .get()
      const existing = existingRes.data && existingRes.data.length > 0 ? existingRes.data[0] : null

      if (!existing) {
        return fail('未找到有效的预订记录', 404)
      }

      // 取消预订（标记为 cancelled）
      const now = Date.now()
      await sideDishBookingsCollection.doc(existing._id).update({
        data: { status: 'cancelled', updatedAt: now }
      })

      // 更新 totalBookedCount
      await refreshTotalBookedCount(orderId)

      return success({ orderId, action: 'cancelled' })
    }
  } catch (error) {
    console.error('副食预订操作失败:', error)
    return fail(error.message || '预订操作失败')
  }
}

/**
 * 刷新征订单的总预订份数（冗余字段）
 */
async function refreshTotalBookedCount(orderId) {
  try {
    const countRes = await sideDishBookingsCollection
      .where({ orderId, status: 'booked' })
      .count()
    // 使用 aggregate 统计总份数
    const listRes = await sideDishBookingsCollection
      .where({ orderId, status: 'booked' })
      .field({ count: true })
      .get()
    const total = (listRes.data || []).reduce((sum, b) => sum + (b.count || 0), 0)

    await sideDishOrdersCollection.doc(orderId).update({
      data: { totalBookedCount: total, updatedAt: Date.now() }
    })
  } catch (e) {
    console.error('刷新totalBookedCount失败:', e)
  }
}

/**
 * 获取某征订单的所有有效预订记录（管理端用）
 * params: { orderId }
 */
async function getSideDishBookings(params) {
  try {
    const { orderId } = params

    if (!orderId) {
      return fail('缺少征订单ID', 400)
    }

    // 同时获取征订单信息和预订列表
    const [orderRes, bookingsRes] = await Promise.all([
      sideDishOrdersCollection.doc(orderId).get(),
      sideDishBookingsCollection
        .where({ orderId, status: 'booked' })
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get()
    ])

    if (!orderRes.data) {
      return fail('征订单不存在', 404)
    }

    const bookings = bookingsRes.data || []
    const totalCount = bookings.reduce((sum, b) => sum + (b.count || 0), 0)

    return success({
      order: orderRes.data,
      bookings,
      summary: {
        totalPeople: bookings.length,
        totalCount
      }
    })
  } catch (error) {
    console.error('获取预订明细失败:', error)
    return fail(error.message || '获取预订明细失败')
  }
}

/**
 * 获取当前用户的副食预订汇总（用于列表显示"已预订X份"）
 */
async function getMySideDishBookings(openid) {
  try {
    const res = await sideDishBookingsCollection
      .where({ openid, status: 'booked' })
      .field({ orderId: true, count: true, createdAt: true })
      .get()

    const bookings = res.data || []

    // 按 orderId 分组
    const map = {}
    bookings.forEach(b => { map[b.orderId] = b.count })

    return success(map)
  } catch (error) {
    console.error('获取我的副食预订失败:', error)
    return fail(error.message || '获取预订信息失败')
  }
}

// ==================== 主入口 ====================

exports.main = async (event, context) => {
  const { action, params = {} } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const userInfo = event.userInfo || {}

  console.log(`mealManager action: ${action}, openid: ${openid}`)

  switch (action) {
    // ========== 工作餐相关 ==========
    case 'getMyMealStatus':
      return await getMyMealStatus(openid)

    case 'getMyAdjustments':
      return await getMyAdjustments(openid)

    case 'saveMealStatus':
      return await saveMealStatus(openid, userInfo, params)

    case 'submitMealAdjustment':
      return await submitMealAdjustment(openid, userInfo, params)

    case 'getAdjustmentList':
      return await getAdjustmentList(params)

    // ========== 副食征订相关 ==========
    case 'getSideDishOrders':
      return await getSideDishOrders(openid)

    case 'createSideDishOrder':
      return await createSideDishOrder(openid, userInfo, params)

    case 'bookSideDish':
      return await bookSideDish(openid, { ...params, bookerName: userInfo.name || '' })

    case 'getSideDishBookings':
      return await getSideDishBookings(params)

    case 'getMySideDishBookings':
      return await getMySideDishBookings(openid)

    default:
      return fail(`未知操作: ${action}`, 400)
  }
}
