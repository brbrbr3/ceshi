// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 集合引用
const tripReportsCollection = db.collection('trip_reports')
const usersCollection = db.collection('office_users')
const notificationsCollection = db.collection('notifications')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 外出报备云函数
 * 
 * 支持的 action：
 * - depart: 外出报备
 * - return: 返回报备
 * - getActiveTrip: 获取当前未返回的出行
 * - getMyTrips: 获取我的出行记录列表
 * - getAllTrips: 获取所有出行记录（Dashboard用）
 * - getStatistics: 获取统计数据（Dashboard用）
 * - checkOvertime: 检查超时并发送通知
 * - getHistory: 获取历史记录（目的地和同行人）
 */
exports.main = async (event, context) => {
  const { action, params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      case 'depart':
        return await handleDepart(openid, params)
      case 'return':
        return await handleReturn(openid, params)
      case 'getActiveTrip':
        return await getActiveTrip(openid)
      case 'getMyTrips':
        return await getMyTrips(openid, params)
      case 'getAllTrips':
        return await getAllTrips(params)
      case 'getStatistics':
        return await getStatistics(params)
      case 'checkOvertime':
        return await checkOvertime()
      case 'getHistory':
        return await getHistory(openid)
      default:
        return fail('未知的操作类型', 400)
    }
  } catch (error) {
    console.error('操作失败:', error)
    return fail(error.message)
  }
}

/**
 * 外出报备
 * 支持同行人代报备功能：
 * - 解析同行人姓名（空格分隔）
 * - 查询匹配的注册用户
 * - 为匹配的同行人创建代报备记录
 */
async function handleDepart(openid, params) {
  const { destination, companions, plannedReturnAt, travelMode } = params

  // 参数校验
  if (!destination || !plannedReturnAt || !travelMode) {
    return fail('缺少必填参数', 400)
  }

  // 检查是否有未返回的出行
  const activeTrip = await tripReportsCollection
    .where({
      _openid: openid,
      status: 'out'
    })
    .limit(1)
    .get()

  if (activeTrip.data && activeTrip.data.length > 0) {
    return fail('您有未返回的出行记录，请先报备返回', 400)
  }

  // 获取当前用户信息
  const userRes = await usersCollection
    .where({ openid })
    .limit(1)
    .get()

  const currentUser = userRes.data && userRes.data[0]
  const currentUserName = currentUser ? currentUser.name : '未知用户'
  const currentUserDepartment = currentUser ? currentUser.department : ''
  const now = Date.now()

  // 解析同行人姓名（空格分隔）
  const companionNames = companions ? companions.split(/\s+/).filter(Boolean) : []

  // 为当前用户创建外出记录
  const tripData = {
    _openid: openid,
    userName: currentUserName,
    department: currentUserDepartment,
    destination,
    companions: companions || '',
    plannedReturnAt,
    travelMode,
    departAt: now,
    returnAt: null,
    status: 'out',
    overtimeNotified: false,
    createdByOpenid: null,  // 自己报备，无代报备来源
    createdByName: null,
    createdAt: now,
    updatedAt: now
  }

  const result = await tripReportsCollection.add({ data: tripData })

  // 处理同行人代报备
  const companionResults = {
    matched: [],      // 匹配成功的同行人
    notMatched: [],   // 未匹配的同行人
    alreadyOut: []    // 已有未返回记录的同行人
  }

  if (companionNames.length > 0) {
    try {
      // 查询匹配的注册用户（精确匹配姓名）
      const matchedUsersRes = await usersCollection
        .where({
          name: _.in(companionNames),
          status: 'approved'
        })
        .field({ openid: true, name: true, department: true })
        .get()

      const matchedUsers = matchedUsersRes.data || []

      for (const matchedUser of matchedUsers) {
        // 排除自己
        if (matchedUser.openid === openid) {
          continue
        }

        // 检查该用户是否已有未返回的报备
        const existingTrip = await tripReportsCollection
          .where({
            _openid: matchedUser.openid,
            status: 'out'
          })
          .limit(1)
          .get()

        if (existingTrip.data && existingTrip.data.length > 0) {
          // 已有未返回记录，跳过
          companionResults.alreadyOut.push(matchedUser.name)
          continue
        }

        // 构建同行人字段：包含本次出行其他所有人（报备人 + 其他同行人）
        const otherCompanions = [currentUserName, ...companionNames.filter(n => n !== matchedUser.name)].join(' ')

        // 为同行人创建代报备记录
        const companionTripData = {
          _openid: matchedUser.openid,
          userName: matchedUser.name,
          department: matchedUser.department || '',
          destination,
          companions: otherCompanions,
          plannedReturnAt,
          travelMode,
          departAt: now,
          returnAt: null,
          status: 'out',
          overtimeNotified: false,
          createdByOpenid: openid,       // 代报备来源
          createdByName: currentUserName, // 代报备人姓名
          createdAt: now,
          updatedAt: now
        }

        await tripReportsCollection.add({ data: companionTripData })
        companionResults.matched.push(matchedUser.name)
      }

      // 记录未匹配的同行人
      const matchedNames = matchedUsers.map(u => u.name)
      companionResults.notMatched = companionNames.filter(name => 
        name !== currentUserName && !matchedNames.includes(name)
      )

    } catch (error) {
      console.error('处理同行人代报备失败:', error)
      // 代报备失败不影响主流程，静默处理
    }
  }

  // 外出报备成功，将用户状态设为 out
  try {
    const userRes = await usersCollection.where({ openid }).limit(1).get()
    if (userRes.data && userRes.data.length > 0) {
      await usersCollection.doc(userRes.data[0]._id).update({
        data: { userStatus: 'out', updatedAt: Date.now() }
      })
    }
  } catch (e) {
    console.warn('更新用户外出状态失败:', e)
  }

  return success({
    _id: result._id,
    ...tripData,
    companionResults
  }, '外出报备成功')
}

/**
 * 返回报备
 */
async function handleReturn(openid, params) {
  const { tripId } = params

  if (!tripId) {
    return fail('缺少出行记录ID', 400)
  }

  // 查询出行记录
  const tripRes = await tripReportsCollection.doc(tripId).get()

  if (!tripRes.data) {
    return fail('出行记录不存在', 404)
  }

  if (tripRes.data._openid !== openid) {
    return fail('无权操作此记录', 403)
  }

  if (tripRes.data.status === 'returned') {
    return fail('该出行已报备返回', 400)
  }

  const now = Date.now()
  const plannedReturnAt = tripRes.data.plannedReturnAt
  const overtimeHours = 1 // 超时阈值：1小时

  // 判断是否超时
  let newStatus = 'returned'
  if (now > plannedReturnAt + overtimeHours * 60 * 60 * 1000) {
    newStatus = 'overtime'
  }

  // 更新记录
  await tripReportsCollection.doc(tripId).update({
    data: {
      returnAt: now,
      status: newStatus,
      updatedAt: now
    }
  })

  // 返回报备成功，将用户状态设为 online
  try {
    const userRes = await usersCollection.where({ openid }).limit(1).get()
    if (userRes.data && userRes.data.length > 0) {
      await usersCollection.doc(userRes.data[0]._id).update({
        data: { userStatus: 'online', updatedAt: now }
      })
    }
  } catch (e) {
    console.warn('更新用户在线状态失败:', e)
  }

  return success({
    tripId,
    returnAt: now,
    status: newStatus
  }, '返回报备成功')
}

/**
 * 获取当前未返回的出行
 */
async function getActiveTrip(openid) {
  const result = await tripReportsCollection
    .where({
      _openid: openid,
      status: 'out'
    })
    .orderBy('departAt', 'desc')
    .limit(1)
    .get()

  return success({
    activeTrip: result.data && result.data[0] || null
  })
}

/**
 * 获取我的出行记录列表
 */
async function getMyTrips(openid, params) {
  const { page = 1, pageSize = 15, status } = params

  const skip = (page - 1) * pageSize

  // 构建查询条件
  let query = tripReportsCollection.where({ _openid: openid })

  if (status && status !== 'all') {
    query = query.where({ status })
  }

  // 获取总数
  const countRes = await query.count()
  const total = countRes.total

  // 获取列表
  const listRes = await query
    .orderBy('departAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return success({
    list: listRes.data,
    total,
    page,
    pageSize,
    hasMore: skip + listRes.data.length < total
  })
}

/**
 * 获取所有出行记录（Dashboard用）
 */
async function getAllTrips(params) {
  const { page = 1, pageSize = 15, department, status, dateStart, dateEnd } = params

  const skip = (page - 1) * pageSize

  // 构建查询条件
  const conditions = {}

  if (department && department !== 'all') {
    conditions.department = department
  }

  if (status && status !== 'all') {
    conditions.status = status
  }

  if (dateStart || dateEnd) {
    conditions.departAt = {}
    if (dateStart) {
      conditions.departAt = _.gte(dateStart)
    }
    if (dateEnd) {
      conditions.departAt = _.and(conditions.departAt, _.lte(dateEnd))
    }
  }

  let query = tripReportsCollection.where(conditions)

  // 获取总数
  const countRes = await query.count()
  const total = countRes.total

  // 获取列表
  const listRes = await query
    .orderBy('departAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return success({
    list: listRes.data,
    total,
    page,
    pageSize,
    hasMore: skip + listRes.data.length < total
  })
}

/**
 * 获取统计数据（Dashboard用）
 */
async function getStatistics(params) {
  const { department, dateStart, dateEnd } = params

  // 构建查询条件
  const conditions = {}

  if (department && department !== 'all') {
    conditions.department = department
  }

  if (dateStart || dateEnd) {
    conditions.departAt = {}
    if (dateStart) {
      conditions.departAt = _.gte(dateStart)
    }
    if (dateEnd) {
      conditions.departAt = _.and(conditions.departAt, _.lte(dateEnd))
    }
  }

  // 获取符合条件的所有记录
  const result = await tripReportsCollection
    .where(conditions)
    .limit(1000)
    .get()

  const trips = result.data || []

  // 统计数据
  const statistics = {
    total: trips.length,
    byStatus: {
      out: trips.filter(t => t.status === 'out').length,
      returned: trips.filter(t => t.status === 'returned').length,
      overtime: trips.filter(t => t.status === 'overtime').length
    },
    byTravelMode: {},
    byDepartment: {},
    byMonth: {}
  }

  // 按出行方式统计
  trips.forEach(trip => {
    const mode = trip.travelMode || '未知'
    statistics.byTravelMode[mode] = (statistics.byTravelMode[mode] || 0) + 1
  })

  // 按部门统计
  trips.forEach(trip => {
    const dept = trip.department || '未知'
    statistics.byDepartment[dept] = (statistics.byDepartment[dept] || 0) + 1
  })

  // 按月份统计
  trips.forEach(trip => {
    if (trip.departAt) {
      const date = new Date(trip.departAt)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      statistics.byMonth[monthKey] = (statistics.byMonth[monthKey] || 0) + 1
    }
  })

  // 按人统计（按出行次数降序，取前20人）
  const personMap = {}
  trips.forEach(trip => {
    const name = trip.userName || '未知'
    personMap[name] = (personMap[name] || 0) + 1
  })
  statistics.byPerson = Object.entries(personMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  return success(statistics)
}

/**
 * 检查超时并发送通知
 * 此函数应由定时触发器调用
 */
async function checkOvertime() {
  const now = Date.now()
  const overtimeThreshold = 1 * 60 * 60 * 1000 // 1小时

  // 查询所有外出中且超过返回时间的记录
  const result = await tripReportsCollection
    .where({
      status: 'out',
      plannedReturnAt: _.lt(now - overtimeThreshold),
      overtimeNotified: _.neq(true)
    })
    .limit(100)
    .get()

  const overtimeTrips = result.data || []
  let notifiedCount = 0

  for (const trip of overtimeTrips) {
    try {
      // 发送通知
      await notificationsCollection.add({
        data: {
          openid: trip._openid,
          type: 'trip_overtime',
          title: '出行超时提醒',
          content: `您的出行已超出计划返回时间1小时，请及时返回并报备。目的地：${trip.destination}`,
          relatedId: trip._id,
          read: false,
          createdAt: now
        }
      })

      // 更新已通知标记
      await tripReportsCollection.doc(trip._id).update({
        data: {
          overtimeNotified: true,
          updatedAt: now
        }
      })

      notifiedCount++
    } catch (error) {
      console.error(`发送超时通知失败: ${trip._id}`, error)
    }
  }

  return success({
    checked: overtimeTrips.length,
    notified: notifiedCount
  }, `检查完成，发送了 ${notifiedCount} 条超时通知`)
}

/**
 * 获取历史记录（目的地和同行人）
 * 从数据库获取该用户最近的出行记录
 */
async function getHistory(openid) {
  // 查询该用户最近的出行记录（最多10条）
  const result = await tripReportsCollection
    .where({ _openid: openid })
    .orderBy('departAt', 'desc')
    .limit(10)
    .field({ destination: true, companions: true })
    .get()

  const trips = result.data || []

  // 提取目的地并去重（最多3条）
  const destinations = [...new Set(
    trips.map(t => t.destination).filter(Boolean)
  )].slice(0, 3)

  // 提取同行人并去重（最多3条）
  const companions = [...new Set(
    trips.map(t => t.companions).filter(Boolean)
  )].slice(0, 3)

  return success({ destinations, companions })
}
