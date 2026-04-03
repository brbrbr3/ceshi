/**
 * 餐食管理云函数
 * 
 * action 列表:
 *   - getMyMealStatus:      获取当前用户工作餐订阅状态
 *   - saveMealStatus:       保存/更新首次入伙信息
 *   - submitMealAdjustment: 提交工作餐调整（停餐/退伙/入伙）
 *   - getAdjustmentList:    获取调整记录列表（管理端）
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

// ==================== 主入口 ====================

exports.main = async (event, context) => {
  const { action, params = {} } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const userInfo = event.userInfo || {}

  console.log(`mealManager action: ${action}, openid: ${openid}`)

  switch (action) {
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

    default:
      return fail(`未知操作: ${action}`, 400)
  }
}
