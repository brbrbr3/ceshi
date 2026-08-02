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

// 订阅消息模板ID
const TRIP_REPORT_TEMPLATE_ID = 's4TMlGjkc0Yb4hqsX-BUG0FyhldMvwKr_h7AueqjnOo'
// 未读消息提醒模板（外出超时通知等通用消息推送）
const UNREAD_MESSAGE_TEMPLATE_ID = 'mJ1CGM8OvpgomnYy0yot4Kk8hD8S-NH06A6ZDywdpGc'

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
 * - retroDepart: 补填外出报备
 * - getActiveTrip: 获取当前未返回的出行
 * - getMyTrips: 获取我的出行记录列表
 * - getAllTrips: 获取所有出行记录（Dashboard用）
 * - getStatistics: 获取统计数据（Dashboard用）
 * - checkOvertime: 检查超时并发送通知
 * - getHistory: 获取历史记录（目的地和同行人）
 * - getBoardData: 获取出行数据板分组数据（新数据板用）
 * - getPersonTrips: 获取某人员全部出行记录（按年月分组）
 */
exports.main = async (event, context) => {
  // 定时触发器调用（event 无 action 字段，含 Trigger/Message）
  if (!event.action) {
    return await checkOvertime()
  }

  const { action, params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      case 'depart':
        return await handleDepart(openid, params)
      case 'return':
        return await handleReturn(openid, params)
      case 'getActiveTripWithProxies':
        return await getActiveTripWithProxies(openid)
      case 'retroDepart':
        return await handleRetroDepart(openid, params)
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
      case 'getBoardData':
        return await getBoardData(openid, params)
      case 'cancelDepart':
        return await handleCancelDepart(openid, params)
      case 'getPersonTrips':
        return await getPersonTrips(openid, params)
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
  const { destination, companions, travelMode } = params

  // 参数校验
  if (!destination || !travelMode) {
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
    plannedReturnAt: null,
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
        .field({ openid: true, name: true, department: true, role: true, livingArea: true, isDepartmentHead: true, reportNotifiers: true })
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
          plannedReturnAt: null,
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

        const companionTripResult = await tripReportsCollection.add({ data: companionTripData })
        companionResults.matched.push(matchedUser.name)

        // 更新同行人 userStatus 为 out
        try {
          await usersCollection.where({ openid: matchedUser.openid }).update({
            data: { userStatus: 'out', updatedAt: now }
          })
        } catch (e) {
          console.warn(`更新同行人 ${matchedUser.name} 外出状态失败:`, e)
        }

        // 推送代报备通知给该同行人的报备接收人（片长/部门负责人/馆领导报备接收人）
        try {
          await notifyReportSubscribers(
            matchedUser.openid,
            matchedUser,
            companionTripResult._id,
            'depart',
            { destination, companions: otherCompanions, reportTime: now }
          )
        } catch (e) {
          console.warn(`推送同行人 ${matchedUser.name} 的报备通知失败:`, e)
        }

        // 推送代报备通知给被代报备人本人（站内通知 + 微信订阅消息）
        try {
          await sendProxyReportNotification(matchedUser.openid, currentUserName, destination, now)
        } catch (e) {
          console.warn(`推送同行人 ${matchedUser.name} 的代报备通知失败:`, e)
        }
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

  // 推送外出报备通知给片长/部门负责人/馆领导报备接收人
  await notifyReportSubscribers(openid, currentUser, result._id, 'depart', { destination, companions: companions || '', reportTime: now })

  return success({
    _id: result._id,
    ...tripData,
    companionResults
  }, '外出报备成功')
}

/**
 * 获取当前用户的活跃外出记录 + 代他人报备且仍未返回的记录
 */
async function getActiveTripWithProxies(openid) {
  // 1. 查询自己的活跃外出
  const myTrip = await tripReportsCollection
    .where({ _openid: openid, status: 'out' })
    .limit(1)
    .get()

  // 2. 查询自己代他人报备且仍为 out 状态的记录
  const proxyTrips = await tripReportsCollection
    .where({ createdByOpenid: openid, status: 'out' })
    .field({ _id: true, userName: true, departAt: true, destination: true })
    .get()

  return success({
    activeTrip: myTrip.data && myTrip.data[0] ? { _id: myTrip.data[0]._id, userName: myTrip.data[0].userName } : null,
    proxyTrips: (proxyTrips.data || []).map(t => ({
      _id: t._id,
      userName: t.userName,
      departAt: t.departAt,
      destination: t.destination
    }))
  })
}

/**
 * 返回报备
 * 支持 proxyReturnIds 参数：一并返回代报备人员的出行记录
 */
async function handleReturn(openid, params) {
  const { tripId, proxyReturnIds } = params

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

  // 判断是否超时：返回时间晚于出发日23时则为超时（按系统配置时区）
  const offsetHours = await getTimezoneOffset()
  const deadline = getOvertimeDeadline(tripRes.data.departAt, offsetHours)
  let newStatus = now > deadline ? 'overtime' : 'returned'

  // 更新记录
  await tripReportsCollection.doc(tripId).update({
    data: {
      returnAt: now,
      status: newStatus,
      updatedAt: now
    }
  })

  // 返回报备成功，将用户状态设为 online
  let reporterUser = null
  try {
    const userRes = await usersCollection.where({ openid }).limit(1).get()
    if (userRes.data && userRes.data.length > 0) {
      reporterUser = userRes.data[0]
      await usersCollection.doc(reporterUser._id).update({
        data: { userStatus: 'online', updatedAt: now }
      })
    }
  } catch (e) {
    console.warn('更新用户在线状态失败:', e)
  }

  // 处理代报备返回
  let proxyReturnedCount = 0
  if (proxyReturnIds && proxyReturnIds.length > 0) {
    try {
      const proxyTrips = await tripReportsCollection
        .where({
          _id: _.in(proxyReturnIds),
          createdByOpenid: openid,
          status: 'out'
        })
        .get()

      for (const proxyTrip of (proxyTrips.data || [])) {
        const proxyDeadline = getOvertimeDeadline(proxyTrip.departAt, offsetHours)
        const proxyStatus = now > proxyDeadline ? 'overtime' : 'returned'

        await tripReportsCollection.doc(proxyTrip._id).update({
          data: {
            returnAt: now,
            status: proxyStatus,
            updatedAt: now
          }
        })

        // 更新被代报备人用户状态为 online
        try {
          const proxyUserRes = await usersCollection.where({ openid: proxyTrip._openid }).limit(1).get()
          if (proxyUserRes.data && proxyUserRes.data.length > 0) {
            await usersCollection.doc(proxyUserRes.data[0]._id).update({
              data: { userStatus: 'online', updatedAt: now }
            })
          }
        } catch (e) {
          console.warn('更新代报备人员在线状态失败:', e)
        }

        proxyReturnedCount++
      }
    } catch (e) {
      console.warn('处理代报备返回失败:', e)
    }
  }

  // 推送返回报备通知给片长/部门负责人/馆领导报备接收人
  if (reporterUser) {
    await notifyReportSubscribers(openid, reporterUser, tripId, 'return', { destination: tripRes.data.destination, companions: tripRes.data.companions || '', reportTime: now })
  }

  return success({
    tripId,
    returnAt: now,
    status: newStatus,
    proxyReturnedCount
  }, '返回报备成功')
}

/**
 * 补填外出报备
 * 用户补填过去的外出记录，包含出发时间和返回时间
 */
async function handleRetroDepart(openid, params) {
  const { destination, companions, departAt, returnAt, travelMode } = params

  // 参数校验
  if (!destination || !departAt || !returnAt || !travelMode) {
    return fail('缺少必填参数', 400)
  }

  if (departAt >= returnAt) {
    return fail('出发时间必须早于返回时间', 400)
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

  // 判断是否超时：返回时间晚于出发日23时则为超时（按系统配置时区）
  const offsetHours = await getTimezoneOffset()
  const deadline = getOvertimeDeadline(departAt, offsetHours)
  const status = returnAt > deadline ? 'overtime' : 'returned'

  const tripData = {
    _openid: openid,
    userName: currentUserName,
    department: currentUserDepartment,
    destination,
    companions: companions || '',
    plannedReturnAt: null,
    travelMode,
    departAt,
    returnAt,
    status,
    overtimeNotified: false,
    createdByOpenid: null,
    createdByName: null,
    isRetro: true,
    createdAt: now,
    updatedAt: now
  }

  const result = await tripReportsCollection.add({ data: tripData })

  return success({
    _id: result._id,
    ...tripData
  }, '补填报备成功')
}
/**
 * 撤回报备（仅外出报备5分钟内有效）
 * 删除自己的报备记录及自动创建的同行人代报备记录
 */
async function handleCancelDepart(openid, params) {
  const now = Date.now()
  const CANCEL_WINDOW = 5 * 60 * 1000 // 5分钟

  // 1. 查找自己的未返回外出记录（自己创建的，非代报备）
  const selfTripRes = await tripReportsCollection
    .where({
      _openid: openid,
      status: 'out',
      createdByOpenid: null // 仅自己发起的报备可撤回
    })
    .orderBy('departAt', 'desc')
    .limit(1)
    .get()

  if (!selfTripRes.data || selfTripRes.data.length === 0) {
    return fail('未找到可撤回的外出记录', 404)
  }

  const selfTrip = selfTripRes.data[0]

  // 2. 校验5分钟窗口
  const elapsed = now - selfTrip.departAt
  if (elapsed > CANCEL_WINDOW) {
    return fail('外出报备已超过5分钟，无法撤回', 403)
  }

  // 3. 查找同行人代报备记录（由此用户创建且未返回的）
  const proxyTripsRes = await tripReportsCollection
    .where({
      createdByOpenid: openid,
      status: 'out'
    })
    .get()

  const proxyTrips = proxyTripsRes.data || []
  const allTripIds = [selfTrip._id, ...proxyTrips.map(t => t._id)]
  const proxyCount = proxyTrips.length

  // 4. 删除所有相关记录
  const deletePromises = allTripIds.map(id =>
    tripReportsCollection.doc(id).remove()
  )
  await Promise.all(deletePromises)

  // 5. 恢复同行人的 userStatus
  if (proxyTrips.length > 0) {
    try {
      const companionOpenids = proxyTrips.map(t => t._openid)
      await usersCollection.where({
        openid: _.in(companionOpenids)
      }).update({
        data: { userStatus: 'online', updatedAt: now }
      })
    } catch (e) {
      console.warn('恢复同行人状态失败:', e)
    }
  }

  // 6. 恢复自己的 userStatus
  try {
    await usersCollection.where({ openid }).update({
      data: { userStatus: 'online', updatedAt: now }
    })
  } catch (e) {
    console.warn('恢复自己的状态失败:', e)
  }

  return success({
    deletedCount: allTripIds.length,
    proxyDeletedCount: proxyCount
  }, '报备已撤回')
}

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
 * 此函数由定时触发器每日晚23点（GMT-3）调用
 * 筛选当时仍处于外出状态且未通知过的记录，发送站内通知 + 微信订阅消息
 */
async function checkOvertime() {
  const now = Date.now()

  // 查询所有外出中且未通知过的记录（定时器已固定在23点执行，无需再判断时间）
  const result = await tripReportsCollection
    .where({
      status: 'out',
      overtimeNotified: _.neq(true)
    })
    .limit(100)
    .get()

  const overtimeTrips = result.data || []
  let notifiedCount = 0

  for (const trip of overtimeTrips) {
    try {
      // 站内通知
      await notificationsCollection.add({
        data: {
          openid: trip._openid,
          type: 'trip_overtime',
          title: '出行超时提醒',
          content: `您的出行已超过出发日23时，请及时返回并报备。目的地：${trip.destination}`,
          relatedId: trip._id,
          read: false,
          createdAt: now
        }
      })

      // 微信订阅消息（未读消息提醒模板）
      const subResult = await sendOvertimeSubscribeMessage(trip._openid)
      if (!subResult.success) {
        console.warn(`[超时通知] 用户 ${trip._openid} 的微信订阅消息发送失败:`, JSON.stringify(subResult))
      }

      // 更新已通知标记（防重复）
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
 * 从数据库按时间倒序分页拉取，去重后取满 10 个目的地和 5 组同行人
 */
async function getHistory(openid) {
  const pageSize = 10
  let skip = 0
  const destSet = new Set()
  const compSet = new Set()
  const destinations = []
  const companions = []
  const MAX_DEST = 10
  const MAX_COMP = 5

  while (destinations.length < MAX_DEST || companions.length < MAX_COMP) {
    const result = await tripReportsCollection
      .where({ _openid: openid })
      .orderBy('departAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .field({ destination: true, companions: true })
      .get()

    const trips = result.data || []
    if (trips.length === 0) break

    trips.forEach(t => {
      if (t.destination && !destSet.has(t.destination)) {
        destSet.add(t.destination)
        if (destinations.length < MAX_DEST) destinations.push(t.destination)
      }
      if (t.companions && !compSet.has(t.companions)) {
        compSet.add(t.companions)
        if (companions.length < MAX_COMP) companions.push(t.companions)
      }
    })

    if (trips.length < pageSize) break  // 无更多记录
    skip += pageSize
  }

  return success({ destinations, companions })
}

/**
 * 报备通知：根据报备人身份推送站内通知
 * 通知对象来源（取并集，去重，排除本人）：
 * 1. 报备人的 reportTo 字段（新：该用户向谁报备）
 * 2. 报备人的 reportNotifiers 字段（旧，兼容）
 * 3. 谁订阅了该报备人（subscribers 中含有报备人的 openid）
 * 4. 自动匹配：片长（同居住区）+ 部门负责人（同部门，若报备人非本人）
 * @param {string} reporterOpenid 报备人 openid
 * @param {object} reporter 报备人完整用户文档
 * @param {string} tripId 出行记录 ID
 * @param {'depart'|'return'} action 报备类型
 * @param {object} extra 附加信息（destination 等）
 */
async function notifyReportSubscribers(reporterOpenid, reporter, tripId, action, extra) {
  const now = Date.now()
  const reporterName = reporter ? reporter.name : '未知用户'
  const destination = (extra && extra.destination) || ''

  const title = action === 'depart' ? '外出报备通知' : '返回报备通知'
  const actionText = action === 'depart' ? '外出报备' : '已返回'
  let content = `${reporterName} 提交了${actionText}报备`
  if (destination) {
    content += `，目的地：${destination}`
  }

  const notifierOpenids = new Set()

  try {
    // 1. 报备人显式指定的 reportTo（新字段）+ reportNotifiers（旧字段兼容）
    const reportTo = reporter && Array.isArray(reporter.reportTo) ? reporter.reportTo : []
    const oldNotifiers = reporter && Array.isArray(reporter.reportNotifiers) ? reporter.reportNotifiers : []
    ;[...reportTo, ...oldNotifiers].forEach(o => {
      if (o) notifierOpenids.add(o)
    })

    // 2. 查询订阅了该报备人的用户（subscribers 数组中包含报备人 openid）
    const subscriberUsers = await usersCollection
      .where({ subscribers: reporterOpenid, status: 'approved' })
      .field({ openid: true })
      .limit(200)
      .get()
    ;(subscriberUsers.data || []).forEach(u => {
      if (u.openid) notifierOpenids.add(u.openid)
    })

    // 3. 自动匹配：片长（同居住区，新字段 isAreaManager）+ 部门负责人（同部门）
    if (reporter && reporter.livingArea) {
      const areaRes = await usersCollection
        .where({ status: 'approved', isAreaManager: true, livingArea: reporter.livingArea })
        .field({ openid: true })
        .limit(100)
        .get()
      ;(areaRes.data || []).forEach(u => {
        if (u.openid) notifierOpenids.add(u.openid)
      })
      // 旧字段兼容
      const oldAreaRes = await usersCollection
        .where({ status: 'approved', areaManagerOf: reporter.livingArea })
        .field({ openid: true })
        .limit(100)
        .get()
      ;(oldAreaRes.data || []).forEach(u => {
        if (u.openid) notifierOpenids.add(u.openid)
      })
    }
    if (reporter && !reporter.isDepartmentHead && reporter.department) {
      const deptRes = await usersCollection
        .where({ status: 'approved', isDepartmentHead: true, department: reporter.department })
        .field({ openid: true })
        .limit(50)
        .get()
      ;(deptRes.data || []).forEach(u => {
        if (u.openid) notifierOpenids.add(u.openid)
      })
      // 旧字段兼容
      const oldDeptRes = await usersCollection
        .where({ status: 'approved', deptExtraNotifierOf: reporter.department })
        .field({ openid: true })
        .limit(100)
        .get()
      ;(oldDeptRes.data || []).forEach(u => {
        if (u.openid) notifierOpenids.add(u.openid)
      })
    }
  } catch (e) {
    console.warn('查询报备通知对象失败:', e)
  }

  // 排除报备人本人
  notifierOpenids.delete(reporterOpenid)

  // 获取时区偏移
  const offsetHours = await getTimezoneOffset()

  for (const targetOpenid of notifierOpenids) {
    try {
      await notificationsCollection.add({
        data: {
          openid: targetOpenid,
          type: action === 'depart' ? 'trip_depart' : 'trip_return',
          title,
          content,
          relatedId: tripId,
          read: false,
          createdAt: now
        }
      })
    } catch (e) {
      console.warn('写入报备通知失败:', e)
    }

    // 发送微信订阅消息（模板3：出行报备通知）
    try {
      await sendTripReportSubscribeMessage(
        targetOpenid,
        reporterName,
        extra.reportTime || now,
        destination,
        extra.companions || '',
        action,
        offsetHours
      )
    } catch (e) {
      console.warn('发送报备订阅消息失败:', e)
    }
  }
}

/**
 * 从 sys_config 读取 TIMEZONE_OFFSET（小时偏移量，默认 -3）
 */
async function getTimezoneOffset() {
  try {
    const configRes = await db.collection('sys_config')
      .where({ type: 'timezone', key: 'TIMEZONE_OFFSET' })
      .limit(1)
      .get()
    if (configRes.data && configRes.data.length > 0) {
      return configRes.data[0].value !== undefined ? configRes.data[0].value : -3
    }
  } catch (e) {}
  return -3
}

/**
 * 从 sys_config 读取部门选项列表（用于部门分组排序）
 * @returns {Promise<string[]>} 部门名称数组，读取失败返回空数组
 */
async function getDepartmentOptions() {
  try {
    const configRes = await db.collection('sys_config')
      .where({ type: 'department', key: 'DEPARTMENT_OPTIONS' })
      .limit(1)
      .get()
    if (configRes.data && configRes.data.length > 0 && Array.isArray(configRes.data[0].value)) {
      return configRes.data[0].value
    }
  } catch (e) {}
  return []
}

/**
 * 从 sys_config 读取居住区域选项列表（用于居住区分组排序）
 * @returns {Promise<string[]>} 居住区域名称数组，读取失败返回空数组
 */
async function getLivingAreaOptions() {
  try {
    const configRes = await db.collection('sys_config')
      .where({ key: 'REPAIR_LIVING_AREAS' })
      .limit(1)
      .get()
    if (configRes.data && configRes.data.length > 0 && Array.isArray(configRes.data[0].value)) {
      return configRes.data[0].value
    }
  } catch (e) {}
  return []
}

/**
 * 计算超时截止时间戳（出发日23:00，按系统配置时区）
 * 云函数运行在 UTC+0，需将本地23:00转换为UTC时间戳
 * @param {number} departAt - 出发时间戳
 * @param {number} offsetHours - 时区偏移（小时，相对UTC，如-3表示UTC-3）
 * @returns {number} 截止时间戳（本地23:00对应的UTC时间戳）
 */
function getOvertimeDeadline(departAt, offsetHours) {
  const departDate = new Date(departAt)
  // 将UTC时间转换为本地时间（加偏移），用UTC方法读取本地日期分量
  const localMs = departDate.getTime() + offsetHours * 3600000
  const localDate = new Date(localMs)
  // 构造本地23:00对应的UTC时间戳：UTC时 = 23 - offsetHours
  // 例如 UTC-3: 23 - (-3) = 26 → 次日02:00 UTC
  return Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 23 - offsetHours, 0, 0)
}

/**
 * 格式化时间为订阅消息所需格式 YYYY-MM-DD HH:mm（含时差修正）
 */
function formatSubscribeTime(timestamp, offsetHours) {
  const date = new Date(timestamp)
  const utc = date.getTime() + date.getTimezoneOffset() * 60000
  const local = new Date(utc + (offsetHours || 0) * 3600000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())} ${pad(local.getHours())}:${pad(local.getMinutes())}`
}

/**
 * 截断文本到指定长度（微信 thing 类型字段限制20字）
 */
function truncateText(text, maxLen) {
  const len = maxLen || 20
  if (!text) return ''
  return text.length > len ? text.substring(0, len) : text
}

/**
 * 发送出行报备订阅消息（模板3）给报备接收人
 * @param {string} openid - 接收者 openid
 * @param {string} reporterName - 报备人姓名
 * @param {number} reportTime - 报备时间戳
 * @param {string} destination - 目的地
 * @param {string} companions - 同行人
 * @param {'depart'|'return'} action - 报备类型
 * @param {number} offsetHours - 时区偏移小时数
 */
async function sendTripReportSubscribeMessage(openid, reporterName, reportTime, destination, companions, action, offsetHours) {
  const templateId = TRIP_REPORT_TEMPLATE_ID

  const name = truncateText(reporterName)
  const time = formatSubscribeTime(reportTime, offsetHours)
  const dest = truncateText(destination || '未知')
  const companion = truncateText(companions || '无')
  const remark = truncateText(action === 'depart' ? '外出报备' : '已返回')

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: templateId,
      page: 'pages/office/trip-board/trip-board',
      data: {
        thing1: { value: name },
        time2: { value: time },
        thing3: { value: dest },
        thing4: { value: companion },
        thing5: { value: remark }
      }
    })
    console.log('出行报备订阅消息已发送:', openid, action)
  } catch (error) {
    const errcode = error.errcode || error.errCode
    // 43101/-604101 = 额度不足/用户拒绝，无需清理 DB（已无 subscriptions 表），仅记日志
    console.warn('[订阅] 发送出行报备消息失败:', openid, errcode, error.message || error)
  }
}

/**
 * 发送外出超时微信订阅消息（未读消息提醒模板）
 * 盲发模式：不查询用户是否订阅，直接 send，失败仅记日志
 * @param {string} openid - 接收者 openid
 * @returns {{ success: boolean, errcode?: number, errmsg?: string }}
 */
async function sendOvertimeSubscribeMessage(openid) {
  const msgType = truncateText('外出超时通知')
  const msgContent = truncateText('您当日23时未归，外出已超时')
  const remark = truncateText('请及时返回并报备')

  try {
    const now = new Date()
    const timezoneOffset = await getTimezoneOffset() // UTC-3
    const local = new Date(now.getTime() + timezoneOffset * 3600000)
    const timeStr = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')} ${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`

    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: UNREAD_MESSAGE_TEMPLATE_ID,
      page: 'pages/office/trip-board/trip-board',
      data: {
        thing7: { value: '系统' },
        time2: { value: timeStr },
        thing6: { value: msgType },
        thing3: { value: msgContent },
        thing4: { value: remark }
      }
    })
    console.log('[订阅✓] 发送成功:', openid)
    return { success: true }
  } catch (error) {
    const errcode = error.errcode || error.errCode || 'unknown'
    const errmsg = error.errmsg || error.errMsg || error.message || JSON.stringify(error)
    console.warn('[订阅✗] 发送失败:', JSON.stringify({
      openid,
      errcode,
      errmsg,
      templateId: UNREAD_MESSAGE_TEMPLATE_ID
    }))
    return { success: false, errcode, errmsg }
  }
}

/**
 * 发送代报备通知给被代报备人本人（站内通知 + 微信订阅消息模板4：未读消息提醒）
 * @param {string} openid - 被代报备人 openid
 * @param {string} reporterName - 代报备人姓名
 * @param {string} destination - 目的地
 * @param {number} now - 时间戳
 */
async function sendProxyReportNotification(openid, reporterName, destination, now) {
  const title = '代报备通知'
  const content = `${reporterName}已为您代报备出行，目的地：${destination}`
  const remark = '返回后请自行报备返回'

  // 1. 站内通知
  try {
    await notificationsCollection.add({
      data: {
        openid: openid,
        type: 'proxy_report',
        title,
        content,
        read: false,
        createdAt: now
      }
    })
  } catch (e) {
    console.warn('写入代报备站内通知失败:', e)
  }

  // 2. 微信订阅消息（模板4：未读消息提醒）
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: UNREAD_MESSAGE_TEMPLATE_ID,
      page: 'pages/office/trip-report/trip-report',
      data: {
        thing6: { value: truncateText('代报备通知') },
        thing3: { value: truncateText(content) },
        thing4: { value: truncateText(remark) }
      }
    })
    console.log('代报备订阅消息已发送:', openid)
  } catch (error) {
    const errcode = error.errcode || error.errCode
    console.warn('[订阅] 发送代报备通知消息失败:', openid, errcode, error.message || error)
  }
}

/**
 * 获取出行数据板分组数据（新数据板用）
 * 按权限范围过滤，按 groupBy 分组，返回人员出行条目
 * @param {string} openid 当前用户 openid
 * @param {object} params { groupBy: 'department'|'livingArea', personType: 'active'|'all' }
 */
async function getBoardData(openid, params) {
  const { groupBy = 'department', personType = 'active' } = params

  // 获取当前用户信息
  const userRes = await usersCollection.where({ openid }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) {
    return fail('用户不存在', 403)
  }
  const currentUser = userRes.data[0]

  const isLeader = currentUser.role === '馆员' && currentUser.department === '无'
  const isAdmin = currentUser.isAdmin
  const isDeptHead = currentUser.isDepartmentHead
  const isAreaManager = !!currentUser.isAreaManager
  const hasSubscribers = Array.isArray(currentUser.subscribers) && currentUser.subscribers.length > 0

  // 权限校验（管理员 / 领导 / 部门负责人 / 片长 / 有订阅的人）
  if (!isAdmin && !isLeader && !isDeptHead && !isAreaManager && !hasSubscribers) {
    return fail('无权限访问出行数据板', 403)
  }

  // 计算可查看的用户范围（多身份取并集）
  let userQuery = { status: 'approved' }
  let scopeType = 'all'

  // 全体范围：管理员 或 馆员且部门为空（原馆领导，非部门负责人）
  if (isAdmin || (isLeader && !isDeptHead)) {
    scopeType = 'all'
  } else {
    const orConditions = []

    // 片长 → 管辖居住区域（新版 isAreaManager + 旧版 areaManagerOf 兼容）
    const areas = new Set()
    if (isAreaManager && currentUser.livingArea) areas.add(currentUser.livingArea)
    if (Array.isArray(currentUser.areaManagerOf)) currentUser.areaManagerOf.forEach(a => areas.add(a))
    if (areas.size > 0) {
      orConditions.push({ livingArea: _.in(Array.from(areas)) })
    }

    // 部门负责人 → 本部门（新版 isDepartmentHead + 旧版兼容）
    const depts = new Set()
    if (isDeptHead && currentUser.department) depts.add(currentUser.department)
    if (Array.isArray(currentUser.deptExtraNotifierOf)) currentUser.deptExtraNotifierOf.forEach(d => depts.add(d))
    if (depts.size > 0) {
      orConditions.push({ department: _.in(Array.from(depts)) })
    }

    // 显式订阅的用户（subscribers 字段）
    if (hasSubscribers) {
      orConditions.push({ openid: _.in(currentUser.subscribers) })
    }

    if (orConditions.length === 1) {
      Object.assign(userQuery, orConditions[0])
      scopeType = orConditions[0].livingArea ? 'area' : (orConditions[0].openid ? 'subscribers' : 'department')
    } else if (orConditions.length > 1) {
      userQuery = _.or(orConditions.map(c => ({ status: 'approved', ...c })))
      scopeType = 'mixed'
    }
  }

  // 查询范围内的用户
  const usersRes = await usersCollection
    .where(userQuery)
    .field({ openid: true, name: true, department: true, livingArea: true, role: true, isDepartmentHead: true, isAreaManager: true })
    .limit(500)
    .get()
  const users = usersRes.data || []

  const userMap = {}
  users.forEach(u => { userMap[u.openid] = u })
  const allCount = users.length

  // 查询范围内当前外出记录
  const openids = Object.keys(userMap)
  let activeTrips = []
  if (openids.length > 0) {
    const tripRes = await tripReportsCollection
      .where({ _openid: _.in(openids), status: 'out' })
      .orderBy('departAt', 'desc')
      .limit(500)
      .get()
    activeTrips = tripRes.data || []
  }
  const activeCount = activeTrips.length

  // 根据 personType 构建条目列表
  let items = []
  if (personType === 'active') {
    items = activeTrips.map(t => ({ ...t, _user: userMap[t._openid] || {} }))
  } else {
    // 全体人员：以用户为主表，左关联当前外出记录
    const activeMap = {}
    activeTrips.forEach(t => { if (!activeMap[t._openid]) activeMap[t._openid] = t })
    users.forEach(u => {
      if (activeMap[u.openid]) {
        items.push({ ...activeMap[u.openid], _user: u })
      } else {
        items.push({
          _id: 'none_' + u.openid,
          _openid: u.openid,
          userName: u.name,
          department: u.department || '',
          destination: '',
          travelMode: '',
          departAt: null,
          returnAt: null,
          status: 'none',
          companions: '',
          _user: u
        })
      }
    })
  }

  // 分组
  const groups = {}
  items.forEach(item => {
    let groupKey = ''
    if (groupBy === 'department') {
      const role = (item._user && item._user.role) || ''
      const department = item.department || (item._user && item._user.department) || ''
      // 部门为'无'（可选领导的馆员）→ 无组名，置顶
      if (department === '无') {
        groupKey = ''
      } else if (role === '其他') {
        // 其他人员 → 置底
        groupKey = '其他人员'
      } else {
        groupKey = department || '未分配部门'
      }
    } else {
      groupKey = (item._user && item._user.livingArea) || '未分配居住区'
    }
    if (!groups[groupKey]) groups[groupKey] = []
    groups[groupKey].push(item)
  })

  // 组内排序：部门 → 部门负责人/额外报备接收人优先；居住区 → 片长优先
  Object.values(groups).forEach(groupItems => {
    groupItems.sort((a, b) => {
      const aUser = a._user || {}
      const bUser = b._user || {}
      const aName = a.userName || ''
      const bName = b.userName || ''
      if (groupBy === 'department') {
        // 部门负责人最前
        const aIsHead = aUser.isDepartmentHead ? 0 : 1
        const bIsHead = bUser.isDepartmentHead ? 0 : 1
        if (aIsHead !== bIsHead) return aIsHead - bIsHead
        // 部门额外报备接收人次之
        const aIsExtra = (aUser.deptExtraNotifierOf && aUser.deptExtraNotifierOf.length > 0) ? 0 : 1
        const bIsExtra = (bUser.deptExtraNotifierOf && bUser.deptExtraNotifierOf.length > 0) ? 0 : 1
        if (aIsExtra !== bIsExtra) return aIsExtra - bIsExtra
      } else {
        // 片长最前
        const aIsManager = (aUser.areaManagerOf && aUser.areaManagerOf.length > 0) ? 0 : 1
        const bIsManager = (bUser.areaManagerOf && bUser.areaManagerOf.length > 0) ? 0 : 1
        if (aIsManager !== bIsManager) return aIsManager - bIsManager
      }
      // 同优先级按姓名排序
      return aName.localeCompare(bName)
    })
  })

  // 转为数组并排序
  let groupList = Object.entries(groups).map(([key, groupItems]) => ({
    groupName: key,
    items: groupItems
  }))

  if (groupBy === 'department') {
    // 排序：无组名（馆员+部门空，原馆领导）置顶 → 各部门 → 其他人员置底
    const departmentOrder = await getDepartmentOptions()
    groupList.sort((a, b) => {
      // 无组名置顶
      if (a.groupName === '') return -1
      if (b.groupName === '') return 1
      // 其他人员置底
      if (a.groupName === '其他人员') return 1
      if (b.groupName === '其他人员') return -1
      // 按配置顺序排序，未配置的部门（如"未分配部门"）排在其后
      const aIdx = departmentOrder.indexOf(a.groupName)
      const bIdx = departmentOrder.indexOf(b.groupName)
      const aOrder = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx
      const bOrder = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.groupName.localeCompare(b.groupName)
    })
  } else {
    // 按系统配置的居住区域顺序排列
    const livingAreaOrder = await getLivingAreaOptions()
    groupList.sort((a, b) => {
      const aIdx = livingAreaOrder.indexOf(a.groupName)
      const bIdx = livingAreaOrder.indexOf(b.groupName)
      const aOrder = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx
      const bOrder = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.groupName.localeCompare(b.groupName)
    })
  }

  const totalCount = personType === 'active' ? activeCount : allCount

  return success({ groups: groupList, totalCount, activeCount, allCount, scopeType })
}

/**
 * 获取某人员出行记录（分页）
 * @param {string} openid 当前用户 openid
 * @param {object} params { targetOpenid, page, pageSize }
 */
async function getPersonTrips(openid, params) {
  const { targetOpenid, page = 1, pageSize = 20, knownTotal } = params
  if (!targetOpenid) {
    return fail('缺少目标用户标识', 400)
  }

  // 获取当前用户信息
  const currentUserRes = await usersCollection.where({ openid }).limit(1).get()
  if (!currentUserRes.data || currentUserRes.data.length === 0) {
    return fail('用户不存在', 403)
  }
  const currentUser = currentUserRes.data[0]

  const isLeader = currentUser.role === '馆员' && currentUser.department === '无'
  const isAdmin = currentUser.isAdmin
  const isDeptHead = currentUser.isDepartmentHead
  const isAreaManager = !!currentUser.isAreaManager
  const oldAreaMgr = Array.isArray(currentUser.areaManagerOf) && currentUser.areaManagerOf.length > 0
  const hasSubscribers = Array.isArray(currentUser.subscribers) && currentUser.subscribers.length > 0

  if (!isAdmin && !isLeader && !isDeptHead && !isAreaManager && !oldAreaMgr && !hasSubscribers) {
    return fail('无权限查看', 403)
  }

  // 查目标用户
  const targetUserRes = await usersCollection.where({ openid: targetOpenid }).limit(1).get()
  if (!targetUserRes.data || targetUserRes.data.length === 0) {
    return fail('目标用户不存在', 404)
  }
  const targetUser = targetUserRes.data[0]

  // 校验目标用户在当前用户权限范围内
  if (!isAdmin && !(isLeader && !isDeptHead)) {
    const allowedDepts = new Set()
    if (isDeptHead && currentUser.department) allowedDepts.add(currentUser.department)
    if (Array.isArray(currentUser.deptExtraNotifierOf)) currentUser.deptExtraNotifierOf.forEach(d => allowedDepts.add(d))

    const inDept = allowedDepts.size > 0 && targetUser.department && allowedDepts.has(targetUser.department)
    // 片长范围（新版 isAreaManager + 旧版 areaManagerOf 兼容）
    const inArea = (isAreaManager || oldAreaMgr) && targetUser.livingArea &&
      ((currentUser.livingArea === targetUser.livingArea) ||
       (Array.isArray(currentUser.areaManagerOf) && currentUser.areaManagerOf.includes(targetUser.livingArea)))
    // 显式订阅的用户
    const inSubs = hasSubscribers && currentUser.subscribers.includes(targetUser.openid)

    if (!inDept && !inArea && !inSubs) {
      return fail('无权查看该用户记录', 403)
    }
  }

  // 分页查询出行记录
  const skip = (page - 1) * pageSize
  const tripRes = await tripReportsCollection
    .where({ _openid: targetOpenid })
    .orderBy('departAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const trips = tripRes.data || []

  // 优先使用传入的 knownTotal，否则第一页查询总数
  let total = knownTotal
  if (total === undefined) {
    const countRes = await tripReportsCollection
      .where({ _openid: targetOpenid })
      .count()
    total = countRes.total || 0
  }

  const hasMore = skip + trips.length < total

  return success({
    user: page === 1 ? {
      openid: targetUser.openid,
      name: targetUser.name,
      department: targetUser.department,
      livingArea: targetUser.livingArea,
      role: targetUser.role
    } : null,
    trips,
    total,
    page,
    pageSize,
    hasMore
  })
}
