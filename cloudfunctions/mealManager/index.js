/**
 * 工作餐与副食云函数
 *
 * 工作餐状态管理架构（事件溯源 + 缓存）：
 *   - meal_adjustments 是状态真相（source of truth）
 *   - meal_subscriptions 是花名册 + 状态缓存，由 computeCurrentStatus 推导写入
 *   - 未来日期的调整不会提前生效，只在实际日期到达后影响状态
 *   - suspend 结束后自动恢复（无需定时器，推导时自动判断）
 *
 * 工作餐相关 action:
 *   - getMyMealStatus:      获取当前用户工作餐订阅状态（从调整记录推导）
 *   - saveMealStatus:       保存/更新首次入伙信息（创建花名册 + 调整记录）
 *   - submitMealAdjustment: 提交工作餐调整（仅写调整记录，缓存自动刷新）
 *   - getAdjustmentList:    获取调整记录列表（管理端）
 *   - getMyAdjustments:     获取当前用户的调整历史
 *
 * 副食征订相关 action:
 *   - getSideDishOrders:        获取副食征订单列表（含已截止的），附带当前用户预订状态
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
const holidayConfigsCollection = db.collection('holiday_configs')

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
 * 通过事件溯源从调整记录推导真实状态，同时刷新缓存
 */
async function getMyMealStatus(openid) {
  try {
    const derived = await refreshSubscriptionCache(openid)
    if (!derived._subscription) {
      return success(null)
    }

    // 返回推导后的状态（合并到花名册上）
    return success({
      ...derived._subscription,
      status: derived.status,
      isEnrolled: derived.isEnrolled,
      mealCount: derived.mealCount
    })
  } catch (error) {
    console.error('获取餐食状态失败:', error)
    return fail(error.message || '获取餐食状态失败')
  }
}

/**
 * 保存/更新首次入伙状态
 * params: { isEnrolled: boolean, mealCount: number }
 * 创建花名册记录 + 调整记录，然后刷新缓存
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
      const prevIsEnrolled = existing.data[0].isEnrolled
      const prevMealCount = existing.data[0].mealCount || 0

      // 更新花名册（入伙信息 + 基本信息）
      await subscriptionsCollection.doc(existing.data[0]._id).update({
        data: {
          isEnrolled,
          mealCount: isEnrolled ? (mealCount || 1) : 0,
          updatedAt: now
        }
      })

      // 入伙状态变化时，记录调整（保持事件溯源一致性）
      if (isEnrolled && !prevIsEnrolled) {
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
      } else if (!isEnrolled && prevIsEnrolled) {
        await adjustmentsCollection.add({
          data: {
            openid,
            name: userInfo.name || '',
            adjustmentType: 'withdraw',
            startDate: '',
            endDate: null,
            count: prevMealCount,
            monthKey: formatMonthKey(now),
            createdAt: now
          }
        })
      }

      // 刷新缓存：从调整记录推导真实状态
      const derived = await refreshSubscriptionCache(openid)
      return success({
        ...existing.data[0],
        status: derived.status,
        isEnrolled: derived.isEnrolled,
        mealCount: derived.mealCount,
        updatedAt: now
      })
    } else {
      // 新建花名册记录
      const newRecord = {
        openid,
        name: userInfo.name || '',
        role: userInfo.role || '',
        position: Array.isArray(userInfo.position) ? userInfo.position : (userInfo.position ? [userInfo.position] : []),
        isEnrolled,
        mealCount: isEnrolled ? (mealCount || 1) : 0,
        status: isEnrolled ? 'active' : 'none',
        createdAt: now,
        updatedAt: now
      }
      const addRes = await subscriptionsCollection.add({ data: newRecord })
      newRecord._id = addRes._id

      // 首次入伙，记录调整
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
 * 仅写入 meal_adjustments 记录，真实状态由 computeCurrentStatus 推导
 */
async function submitMealAdjustment(openid, userInfo, params) {
  try {
    const { adjustmentType, startDate, endDate, count } = params

    if (!['suspend', 'withdraw', 'enroll', 'extra'].includes(adjustmentType)) {
      return fail('无效的调整类型', 400)
    }

    if (!startDate && adjustmentType !== 'enroll' && adjustmentType !== 'extra') {
      return fail('请选择开始日期', 400)
    }

    if (!count || count < 1) {
      return fail('份数必须大于0', 400)
    }

    // 推导当前真实状态（用于业务校验）
    const derived = await computeCurrentStatus(openid)

    // enroll 且无订阅记录时，先创建花名册
    if (!derived._subscription && adjustmentType === 'enroll') {
      const now = Date.now()
      const newSubRecord = {
        openid,
        name: userInfo.name || '',
        role: userInfo.role || '',
        position: Array.isArray(userInfo.position) ? userInfo.position : (userInfo.position ? [userInfo.position] : []),
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

      // 刷新缓存
      await refreshSubscriptionCache(openid)
      return success(record)
    }

    // 非 enroll/extra 类型必须有现有订阅记录
    if (!derived._subscription) {
      return fail('请先设置工作餐状态', 400)
    }

    // 根据推导状态做业务校验
    switch (adjustmentType) {
      case 'suspend':
        if (!derived.isEnrolled) {
          return fail('当前未入伙，无法停餐', 400)
        }
        if (count > derived.mealCount) {
          return fail(`停餐份数不能超过已订餐份数(${derived.mealCount})`, 400)
        }
        break

      case 'withdraw':
        if (!derived.isEnrolled) {
          return fail('当前未入伙，无法退伙', 400)
        }
        if (count > derived.mealCount) {
          return fail(`退伙份数不能超过已订餐份数(${derived.mealCount})`, 400)
        }
        break

      case 'enroll':
        // 未入伙→入伙，无需额外校验
        break

      case 'extra':
        if (!derived.isEnrolled) {
          return fail('当前未入伙，无法加餐', 400)
        }
        if (count < 1) {
          return fail('加餐份数至少为1', 400)
        }
        break
    }

    const now = Date.now()

    // 创建调整记录（仅写入 meal_adjustments，不直接更新订阅状态）
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

    // 刷新订阅缓存（从调整记录推导最新状态）
    await refreshSubscriptionCache(openid)

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

    const enriched = await enrichSuspendWorkdayCount(listRes.data)

    return success({
      list: enriched,
      total: countRes.total,
      hasMore: skip + enriched.length < countRes.total
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

    const enriched = await enrichSuspendWorkdayCount(listRes.data || [])

    return success({
      list: enriched,
      total: countRes.total,
      hasMore: countRes.total > 20
    })
  } catch (error) {
    console.error('获取调整历史失败:', error)
    return fail(error.message || '获取调整历史失败')
  }
}

/**
 * 获取工作餐统计信息（管理端）
 * 统计当前订餐人数/份数、临时停餐人数/份数
 */
async function getMealStats() {
  try {
    const [enrolledRes, suspendedRes] = await Promise.all([
      subscriptionsCollection.where({ isEnrolled: true }).get(),
      subscriptionsCollection.where({ status: 'suspended' }).get()
    ])

    const enrolledList = enrolledRes.data || []
    const suspendedList = suspendedRes.data || []

    return success({
      enrolledPeople: enrolledList.length,
      enrolledCount: enrolledList.reduce((sum, s) => sum + (s.mealCount || 0), 0),
      suspendedPeople: suspendedList.length,
      suspendedCount: suspendedList.reduce((sum, s) => sum + (s.mealCount || 0), 0)
    })
  } catch (error) {
    console.error('获取餐食统计失败:', error)
    return fail(error.message || '获取统计失败')
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

/**
 * 获取指定年份的节假日配置
 * 返回 { year: [dates] } 映射
 */
async function getHolidayConfigs(years) {
  if (!years || years.length === 0) return {}
  const res = await holidayConfigsCollection
    .where({ year: _.in(years) })
    .get()
  const map = {}
  ;(res.data || []).forEach(doc => {
    map[doc.year] = doc.dates || []
  })
  return map
}

/**
 * 将 Date 对象格式化为 YYYY-MM-DD
 */
function formatDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 计算日期区间内的工作日数量
 * 工作日 = 非周末 且 不在节假日集合中
 */
function countWorkdays(startDate, endDate, holidayDatesSet) {
  if (!startDate || !endDate) return 0
  let count = 0
  const current = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    const dayOfWeek = current.getDay()
    const dateStr = formatDateStr(current)
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDatesSet.has(dateStr)) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }
  return count
}

/**
 * 为 suspend 类型的调整记录补充 workdayCount 字段
 * 从 holiday_configs 查询节假日，计算停餐区间内的工作日数量
 */
async function enrichSuspendWorkdayCount(list) {
  const suspendRecords = list.filter(
    item => item.adjustmentType === 'suspend' && item.startDate && item.endDate
  )
  if (suspendRecords.length === 0) return list

  // 收集涉及的年份
  const years = new Set()
  suspendRecords.forEach(r => {
    years.add(r.startDate.substring(0, 4))
    years.add(r.endDate.substring(0, 4))
  })

  const holidayMap = await getHolidayConfigs([...years])

  // 构建节假日集合
  const allHolidayDates = new Set()
  Object.values(holidayMap).forEach(dates => {
    dates.forEach(d => allHolidayDates.add(d))
  })

  return list.map(item => {
    if (item.adjustmentType === 'suspend' && item.startDate && item.endDate) {
      return { ...item, workdayCount: countWorkdays(item.startDate, item.endDate, allHolidayDates) }
    }
    return item
  })
}

/**
 * 从调整记录推导用户当前真实状态（事件溯源）
 * meal_adjustments 是状态真相，meal_subscriptions 仅缓存花名册
 *
 * 核心逻辑：
 * 1. 以订阅记录的初始入伙信息为起点
 * 2. 按 createdAt 顺序回放所有已生效的调整记录
 * 3. suspend 特殊处理：只有今天在 [startDate, endDate] 区间内才标记为 suspended
 * 4. 未来日期的调整（startDate > 今天）被跳过，不会提前生效
 */
async function computeCurrentStatus(openid) {
  // 获取花名册记录
  const subRes = await subscriptionsCollection.where({ openid }).get()
  const subscription = subRes.data && subRes.data.length > 0 ? subRes.data[0] : null

  if (!subscription) {
    return { status: 'none', isEnrolled: false, mealCount: 0, _subscription: null }
  }

  // 获取所有调整记录，按创建时间排序
  const adjRes = await adjustmentsCollection
    .where({ openid })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get()
  const adjustments = adjRes.data || []

  const today = getTodayStr()

  // 初始状态：来自花名册的入伙信息
  let currentStatus = subscription.isEnrolled ? 'active' : 'none'
  let currentMealCount = subscription.mealCount || 0
  let currentIsEnrolled = subscription.isEnrolled || false

  // 回放所有调整记录
  for (const adj of adjustments) {
    const effectiveDate = adj.startDate || ''

    // 跳过尚未生效的未来调整
    if (effectiveDate && effectiveDate > today) continue

    switch (adj.adjustmentType) {
      case 'enroll':
        currentStatus = 'active'
        currentIsEnrolled = true
        currentMealCount = adj.count
        break

      case 'withdraw':
        currentStatus = 'withdrawn'
        currentIsEnrolled = false
        currentMealCount = 0
        break

      case 'extra':
        currentStatus = 'active'
        currentIsEnrolled = true
        currentMealCount += adj.count
        break

      case 'suspend':
        // 只有今天在停餐区间内才标记为 suspended
        if (adj.startDate <= today && (!adj.endDate || adj.endDate >= today)) {
          currentStatus = 'suspended'
          // isEnrolled 和 mealCount 保留（暂停语义，不改变基础状态）
        }
        // 停餐期已过或未开始 → 不影响当前状态
        break
    }
  }

  return {
    status: currentStatus,
    isEnrolled: currentIsEnrolled,
    mealCount: currentMealCount,
    _subscription: subscription
  }
}

/**
 * 刷新订阅缓存：从调整记录推导当前状态，同步写入 meal_subscriptions
 * meal_subscriptions 的 status/isEnrolled/mealCount 仅供快速查询使用
 * 真实状态始终由 computeCurrentStatus 从 meal_adjustments 推导
 */
async function refreshSubscriptionCache(openid) {
  const derived = await computeCurrentStatus(openid)
  if (!derived._subscription) return derived

  const subscription = derived._subscription

  // 仅在缓存与推导结果不一致时更新
  if (subscription.status !== derived.status ||
      subscription.isEnrolled !== derived.isEnrolled ||
      subscription.mealCount !== derived.mealCount) {
    const now = Date.now()
    await subscriptionsCollection.doc(subscription._id).update({
      data: {
        status: derived.status,
        isEnrolled: derived.isEnrolled,
        mealCount: derived.mealCount,
        cachedAt: now,
        updatedAt: now
      }
    })
  }

  return derived
}

// ==================== 副食征订相关函数 ====================

/**
 * 获取副食征订单列表
 * 返回所有征订单（含已截止的），同时附带当前用户的预订状态
 * 自动将过了deadline但仍为active状态的征订单标记为expired
 */
async function getSideDishOrders(openid) {
  try {
    const today = getTodayStr()

    // 查询所有征订单（不限状态和截止日期）
    const listRes = await sideDishOrdersCollection
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()

    let orders = listRes.data || []

    // 批量更新已过期但仍为 active 状态的征订单
    const expiredIds = orders
      .filter(o => o.status === 'active' && o.deadline < today)
      .map(o => o._id)

    if (expiredIds.length > 0) {
      for (const id of expiredIds) {
        await sideDishOrdersCollection.doc(id).update({
          data: { status: 'expired', updatedAt: Date.now() }
        })
      }
      // 更新内存中的状态
      orders = orders.map(o => {
        if (expiredIds.includes(o._id)) {
          return { ...o, status: 'expired' }
        }
        return o
      })
    }

    // 查询当前用户的所有有效预订
    const bookingRes = await sideDishBookingsCollection
      .where({ openid, status: 'booked' })
      .get()
    const myBookings = bookingRes.data || []
    const myBookingMap = {}
    myBookings.forEach(b => { myBookingMap[b.orderId] = b })

    // 组装返回数据：每个征订单附加当前用户的预订信息和过期标记
    const result = orders.map(order => {
      const myBooking = myBookingMap[order._id]
      return {
        ...order,
        isExpired: order.status === 'expired' || order.deadline < today,
        myBookedCount: myBooking ? myBooking.count : 0,
        myBookedItems: myBooking ? (myBooking.items || []) : [],
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
 * params: { title, description, categories: [{ name, maxCount }], deadline }
 * categories 支持多类别征订，每个类别有独立的名称和最大预订份数/人
 */
async function createSideDishOrder(openid, userInfo, params) {
  try {
    const { title, description, categories, deadline } = params

    if (!title || !title.trim()) {
      return fail('请输入征订标题', 400)
    }

    if (!description || !description.trim()) {
      return fail('请输入副食详情', 400)
    }

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return fail('请至少添加一个类别', 400)
    }

    // 校验每个类别
    const nameSet = new Set()
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i]
      if (!cat.name || !cat.name.trim()) {
        return fail(`第${i + 1}个类别名称不能为空`, 400)
      }
      if (nameSet.has(cat.name.trim())) {
        return fail(`类别名称"${cat.name.trim()}"重复`, 400)
      }
      nameSet.add(cat.name.trim())
      if (!cat.maxCount || cat.maxCount < 1) {
        return fail(`类别"${cat.name.trim()}"的最大预订份数至少为1`, 400)
      }
    }

    if (!deadline) {
      return fail('请选择截止日期', 400)
    }

    // 校验截止日期不能早于今天
    const today = getTodayStr()
    if (deadline < today) {
      return fail('截止日期不能早于今天', 400)
    }

    // 生成带 id 的 categories，计算总 maxCount
    const now = Date.now()
    const processedCategories = categories.map((cat, index) => ({
      id: `cat_${now}_${index}`,
      name: cat.name.trim(),
      maxCount: cat.maxCount
    }))
    const maxCount = processedCategories.reduce((sum, cat) => sum + cat.maxCount, 0)

    const newOrder = {
      title: title.trim(),
      description: description.trim(),
      maxCount,
      categories: processedCategories,
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
 * params: { orderId, action: 'book'|'cancel', items?: [{ categoryId, count }] }
 * - book: 提交或修改预订（幂等：同一用户对同一征订单只有一条有效记录）
 * - cancel: 取消预订（将 status 改为 cancelled）
 * items: 按类别预订，每个类别独立的份数
 */
async function bookSideDish(openid, params) {
  try {
    const { orderId, action, items } = params

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
      // 校验 items
      if (!items || !Array.isArray(items) || items.length === 0) {
        return fail('请至少预订一个类别', 400)
      }

      const orderCategories = order.categories || []
      const categoryMap = {}
      orderCategories.forEach(cat => { categoryMap[cat.id] = cat })

      const seenCategoryIds = new Set()
      for (const item of items) {
        if (!item.categoryId) {
          return fail('缺少类别ID', 400)
        }
        if (!categoryMap[item.categoryId]) {
          return fail(`类别ID ${item.categoryId} 不存在于该征订单中`, 400)
        }
        if (seenCategoryIds.has(item.categoryId)) {
          return fail('同一类别不可重复提交', 400)
        }
        seenCategoryIds.add(item.categoryId)

        if (!item.count || item.count < 1) {
          return fail(`类别"${categoryMap[item.categoryId].name}"的预订份数至少为1`, 400)
        }
        const maxAllowed = categoryMap[item.categoryId].maxCount * 2
        if (item.count > maxAllowed) {
          return fail(`类别"${categoryMap[item.categoryId].name}"每人最多可预订${maxAllowed}份`, 400)
        }
      }

      const totalCount = items.reduce((sum, item) => sum + item.count, 0)

      // 构建 items 数组（含 categoryName 冗余）
      const enrichedItems = items.map(item => ({
        categoryId: item.categoryId,
        categoryName: categoryMap[item.categoryId].name,
        count: item.count
      }))

      // 查询是否已有有效预订
      const existingRes = await sideDishBookingsCollection
        .where({ orderId, openid, status: 'booked' })
        .get()
      const existing = existingRes.data && existingRes.data.length > 0 ? existingRes.data[0] : null

      const now = Date.now()

      if (existing) {
        // 更新现有预订
        await sideDishBookingsCollection.doc(existing._id).update({
          data: { count: totalCount, items: enrichedItems, updatedAt: now }
        })
      } else {
        // 新建预订记录
        await sideDishBookingsCollection.add({
          data: {
            orderId,
            openid,
            name: params.bookerName || '',
            count: totalCount,
            items: enrichedItems,
            status: 'booked',
            createdAt: now,
            updatedAt: now
          }
        })
      }

      // 更新征订单的 totalBookedCount 冗余字段
      await refreshTotalBookedCount(orderId)

      return success({ orderId, count: totalCount, items: enrichedItems, action: 'booked' })
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

    // 按类别汇总
    const categorySummaries = []
    if (orderRes.data && orderRes.data.categories) {
      orderRes.data.categories.forEach(cat => {
        let catCount = 0
        bookings.forEach(b => {
          if (b.items && Array.isArray(b.items)) {
            const item = b.items.find(i => i.categoryId === cat.id)
            if (item) catCount += item.count
          }
        })
        categorySummaries.push({
          categoryId: cat.id,
          categoryName: cat.name,
          count: catCount
        })
      })
    }

    return success({
      order: orderRes.data,
      bookings,
      summary: {
        totalPeople: bookings.length,
        totalCount,
        categorySummaries
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

    case 'getMealStats':
      return await getMealStats()

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
