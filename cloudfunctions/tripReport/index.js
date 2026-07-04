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
  const { action, params } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      case 'depart':
        return await handleDepart(openid, params)
      case 'return':
        return await handleReturn(openid, params)
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

  // 推送外出报备通知给片长/部门负责人/馆领导报备人
  await notifyReportSubscribers(openid, currentUser, result._id, 'depart', { destination, companions: companions || '', reportTime: now })

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

  // 判断是否超时：返回时间晚于出发日23时则为超时
  const departDate = new Date(tripRes.data.departAt)
  const deadline = new Date(departDate.getFullYear(), departDate.getMonth(), departDate.getDate(), 23, 0, 0)
  let newStatus = now > deadline.getTime() ? 'overtime' : 'returned'

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

  // 推送返回报备通知给片长/部门负责人/馆领导报备人
  if (reporterUser) {
    await notifyReportSubscribers(openid, reporterUser, tripId, 'return', { destination: tripRes.data.destination, companions: tripRes.data.companions || '', reportTime: now })
  }

  return success({
    tripId,
    returnAt: now,
    status: newStatus
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

  // 判断是否超时：返回时间晚于出发日23时则为超时
  const departDate = new Date(departAt)
  const deadline = new Date(departDate.getFullYear(), departDate.getMonth(), departDate.getDate(), 23, 0, 0)
  const status = returnAt > deadline.getTime() ? 'overtime' : 'returned'

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

  // 查询所有外出中的记录
  const result = await tripReportsCollection
    .where({
      status: 'out',
      overtimeNotified: _.neq(true)
    })
    .limit(100)
    .get()

  const overtimeTrips = []
  const allOutTrips = result.data || []

  // 筛选已超时的：当前时间已超过出发日23时
  for (const trip of allOutTrips) {
    const departDate = new Date(trip.departAt)
    const deadline = new Date(departDate.getFullYear(), departDate.getMonth(), departDate.getDate(), 23, 0, 0)
    if (now > deadline.getTime()) {
      overtimeTrips.push(trip)
    }
  }

  let notifiedCount = 0

  for (const trip of overtimeTrips) {
    try {
      // 发送通知
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

/**
 * 报备通知：根据报备人身份推送站内通知
 * - 馆领导：仅通知其设置的报备人（reportNotifiers），不通知片长/部门负责人
 * - 非馆领导：通知其居住区域片长 + 同部门部门负责人（若报备人本人即部门负责人则不通知部门负责人）
 * 通知对象按 openid 去重，并排除报备人本人。通知写入 notifications 集合。
 * @param {string} reporterOpenid 报备人 openid
 * @param {object} reporter 报备人完整用户文档（含 role/livingArea/department/isDepartmentHead/reportNotifiers）
 * @param {string} tripId 出行记录 ID
 * @param {'depart'|'return'} action 报备类型
 * @param {object} extra 附加信息（destination 等）
 */
async function notifyReportSubscribers(reporterOpenid, reporter, tripId, action, extra) {
  const now = Date.now()
  const reporterName = reporter ? reporter.name : '未知用户'
  const isLeader = reporter && reporter.role === '馆领导'
  const destination = (extra && extra.destination) || ''

  const title = action === 'depart' ? '外出报备通知' : '返回报备通知'
  const actionText = action === 'depart' ? '外出报备' : '已返回'
  let content = `${reporterName} 提交了${actionText}报备`
  if (destination) {
    content += `，目的地：${destination}`
  }

  const notifierOpenids = new Set()

  try {
    if (isLeader) {
      // 馆领导：仅通知其设置的报备人
      const notifiers = reporter && Array.isArray(reporter.reportNotifiers) ? reporter.reportNotifiers : []
      notifiers.forEach(o => {
        if (o) notifierOpenids.add(o)
      })
    } else {
      // 非馆领导：通知居住区域片长
      if (reporter && reporter.livingArea) {
        const managerRes = await usersCollection
          .where({ status: 'approved', areaManagerOf: reporter.livingArea })
          .field({ openid: true })
          .limit(100)
          .get()
        ;(managerRes.data || []).forEach(u => {
          if (u.openid) notifierOpenids.add(u.openid)
        })
      }

      // 通知部门负责人（报备人本人即部门负责人时不通知；排除已暂停接收的）
      if (reporter && !reporter.isDepartmentHead && reporter.department) {
        const deptHeadRes = await usersCollection
          .where({ status: 'approved', department: reporter.department, isDepartmentHead: true, deptHeadNotifyDisabled: _.neq(true) })
          .field({ openid: true })
          .limit(50)
          .get()
        ;(deptHeadRes.data || []).forEach(u => {
          if (u.openid) notifierOpenids.add(u.openid)
        })
      }

      // 通知同部门额外报备接收人（deptExtraNotifierOf 含该部门，不限定同部门人员）
      if (reporter && reporter.department) {
        const extraRes = await usersCollection
          .where({ status: 'approved', deptExtraNotifierOf: reporter.department })
          .field({ openid: true })
          .limit(100)
          .get()
        ;(extraRes.data || []).forEach(u => {
          if (u.openid) notifierOpenids.add(u.openid)
        })
      }
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
 * 消费一条订阅额度：查询并标记为 used
 */
async function consumeSubscriptionQuota(openid, templateId) {
  const subscriptionsCollection = db.collection('subscriptions')
  const res = await subscriptionsCollection
    .where({ openid, templateId, status: 'subscribed' })
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get()

  if (!res.data || res.data.length === 0) {
    return null
  }

  const record = res.data[0]
  await subscriptionsCollection.doc(record._id).update({
    data: { status: 'used', usedAt: Date.now() }
  })
  return record
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

  // 消费一条订阅额度
  const quota = await consumeSubscriptionQuota(openid, templateId)
  if (!quota) {
    return
  }

  const name = truncateText(reporterName)
  const time = formatSubscribeTime(reportTime, offsetHours)
  const dest = truncateText(destination || '未知')
  const companion = truncateText(companions || '无')
  const remark = truncateText(action === 'depart' ? '外出报备' : '已返回')

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

  const isLeader = currentUser.role === '馆领导'
  const isAdmin = currentUser.isAdmin
  const isDeptHead = currentUser.isDepartmentHead
  const isAreaManager = Array.isArray(currentUser.areaManagerOf) && currentUser.areaManagerOf.length > 0

  // 权限校验
  if (!isAdmin && !isLeader && !isDeptHead && !isAreaManager) {
    return fail('无权限访问出行数据板', 403)
  }

  // 计算可查看的用户范围
  let userQuery = { status: 'approved' }
  let scopeType = 'all'

  if (isAdmin || (isLeader && !isDeptHead)) {
    scopeType = 'all'
  } else if (isLeader && isDeptHead) {
    scopeType = 'department'
    userQuery.department = currentUser.department
  } else if (isAreaManager) {
    scopeType = 'area'
    userQuery.livingArea = _.in(currentUser.areaManagerOf)
  } else if (isDeptHead) {
    scopeType = 'department'
    userQuery.department = currentUser.department
  }

  // 查询范围内的用户
  const usersRes = await usersCollection
    .where(userQuery)
    .field({ openid: true, name: true, department: true, livingArea: true, role: true, isDepartmentHead: true })
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
      // 馆领导单独成组
      if (item._user && item._user.role === '馆领导') {
        groupKey = '馆领导'
      } else {
        groupKey = item.department || (item._user && item._user.department) || '未分配部门'
      }
    } else {
      groupKey = (item._user && item._user.livingArea) || '未分配居住区'
    }
    if (!groups[groupKey]) groups[groupKey] = []
    groups[groupKey].push(item)
  })

  // 转为数组并排序
  let groupList = Object.entries(groups).map(([key, groupItems]) => ({
    groupName: key,
    items: groupItems
  }))

  if (groupBy === 'department') {
    groupList.sort((a, b) => {
      if (a.groupName === '馆领导') return -1
      if (b.groupName === '馆领导') return 1
      return a.groupName.localeCompare(b.groupName)
    })
  } else {
    groupList.sort((a, b) => a.groupName.localeCompare(b.groupName))
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
  const { targetOpenid, page = 1, pageSize = 20 } = params
  if (!targetOpenid) {
    return fail('缺少目标用户标识', 400)
  }

  // 获取当前用户信息
  const currentUserRes = await usersCollection.where({ openid }).limit(1).get()
  if (!currentUserRes.data || currentUserRes.data.length === 0) {
    return fail('用户不存在', 403)
  }
  const currentUser = currentUserRes.data[0]

  const isLeader = currentUser.role === '馆领导'
  const isAdmin = currentUser.isAdmin
  const isDeptHead = currentUser.isDepartmentHead
  const isAreaManager = Array.isArray(currentUser.areaManagerOf) && currentUser.areaManagerOf.length > 0

  if (!isAdmin && !isLeader && !isDeptHead && !isAreaManager) {
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
    if ((isLeader && isDeptHead) || isDeptHead) {
      if (targetUser.department !== currentUser.department) {
        return fail('无权查看该用户记录', 403)
      }
    } else if (isAreaManager) {
      if (!currentUser.areaManagerOf.includes(targetUser.livingArea)) {
        return fail('无权查看该用户记录', 403)
      }
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

  // 仅第一页时查询总数
  let total = 0
  if (page === 1) {
    const countRes = await tripReportsCollection
      .where({ _openid: targetOpenid })
      .count()
    total = countRes.total || 0
  }

  const hasMore = skip + trips.length < (total || (skip + trips.length))

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
