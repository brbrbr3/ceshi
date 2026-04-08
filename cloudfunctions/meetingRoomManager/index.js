/**
 * 会议室预约管理云函数
 * 处理会议室预约的增删改查操作
 */

const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()
const _ = db.command

// 集合引用
const meetingRoomReservationsCollection = db.collection('meeting_room_reservations')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}
function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 获取指定会议室、日期的预约列表
 * @param {string} roomId 会议室ID
 * @param {string} date 日期 YYYY-MM-DD
 */
async function getMeetingRoomReservations(roomId, date) {
  try {
    const MAX_LIMIT = 100
    let allData = []

    let result = await meetingRoomReservationsCollection
      .where({
        roomId: roomId,
        date: date
      })
      .orderBy('startTime', 'asc')
      .limit(MAX_LIMIT)
      .get()

    allData = result.data

    // 分页获取，防止数据量超过单次返回上限
    while (result.data.length === MAX_LIMIT) {
      result = await meetingRoomReservationsCollection
        .where({
          roomId: roomId,
          date: date
        })
        .orderBy('startTime', 'asc')
        .skip(allData.length)
        .limit(MAX_LIMIT)
        .get()
      allData = allData.concat(result.data)
    }

    return success({ list: allData })
  } catch (error) {
    console.error('获取预约列表失败:', error)
    return fail('获取预约列表失败')
  }
}

/**
 * 检查时间冲突
 * @param {string} roomId 会议室ID
 * @param {string} date 日期 YYYY-MM-DD
 * @param {string} startTime 开始时间 HH:mm
 * @param {string} endTime 结束时间 HH:mm
 * @param {string} excludeMeetingRoomReservationId 排除的预约ID（编辑时使用）
 */
async function checkMeetingRoomConflict(roomId, date, startTime, endTime, excludeMeetingRoomReservationId = null) {
  try {
    // 构建查询条件
    let query = {
      roomId: roomId,
      date: date
    }

    // 获取该会议室当天的所有预约
    const result = await meetingRoomReservationsCollection.where(query).get()
    const meetingRoomReservations = result.data

    // 检查时间冲突
    for (const meetingRoomReservation of meetingRoomReservations) {
      // 排除当前编辑的预约
      if (excludeMeetingRoomReservationId && meetingRoomReservation._id === excludeMeetingRoomReservationId) {
        continue
      }

      // 时间冲突检测：新预约开始时间 < 已有预约结束时间 且 新预约结束时间 > 已有预约开始时间
      if (startTime < meetingRoomReservation.endTime && endTime > meetingRoomReservation.startTime) {
        return success({ 
          hasConflict: true, 
          conflictMeetingRoomReservation: {
            title: meetingRoomReservation.title,
            startTime: meetingRoomReservation.startTime,
            endTime: meetingRoomReservation.endTime
          }
        })
      }
    }

    return success({ hasConflict: false })
  } catch (error) {
    console.error('检查时间冲突失败:', error)
    return fail('检查时间冲突失败')
  }
}

/**
 * 创建新预约
 * @param {Object} params 预约参数
 * @param {Object} userInfo 用户信息
 */
async function createMeetingRoomReservation(params, userInfo) {
  const { title, roomId, roomName, date, startTime, endTime, description } = params

  // 参数校验
  if (!title || !roomId || !roomName || !date || !startTime || !endTime) {
    return fail('缺少必填参数', 400)
  }

  // 时间校验
  if (startTime >= endTime) {
    return fail('开始时间必须早于结束时间', 400)
  }

  try {
    // 检查时间冲突
    const conflictResult = await checkMeetingRoomConflict(roomId, date, startTime, endTime)
    if (conflictResult.data.hasConflict) {
      return fail(`时间冲突：与「${conflictResult.data.conflictMeetingRoomReservation.title}」（${conflictResult.data.conflictMeetingRoomReservation.startTime}-${conflictResult.data.conflictMeetingRoomReservation.endTime}）重叠`, 400)
    }

    // 创建预约
    const now = Date.now()
    const wxContext = cloud.getWXContext()
    const meetingRoomReservation = {
      title,
      roomId,
      roomName,
      date,
      startTime,
      endTime,
      description: description || '',
      creatorId: wxContext.OPENID,       // 创建者openid
      creatorName: userInfo.name || '未知用户',
      creatorRole: userInfo.role || '',  // 创建者角色
      createdAt: now,
      updatedAt: now
    }

    const result = await meetingRoomReservationsCollection.add({ data: meetingRoomReservation })

    return success({ 
      meetingRoomReservationId: result._id,
      message: '预约创建成功' 
    })
  } catch (error) {
    console.error('创建预约失败:', error)
    return fail('创建预约失败')
  }
}

/**
 * 更新预约
 * @param {string} meetingRoomReservationId 预约ID
 * @param {Object} params 更新参数
 * @param {Object} userInfo 用户信息
 */
async function updateMeetingRoomReservation(meetingRoomReservationId, params, userInfo) {
  // 参数校验
  if (!meetingRoomReservationId) {
    return fail('缺少预约ID', 400)
  }

  try {
    // 获取原预约信息
    const meetingRoomReservationResult = await meetingRoomReservationsCollection.doc(meetingRoomReservationId).get()
    if (!meetingRoomReservationResult.data) {
      return fail('预约不存在', 404)
    }

    const oldMeetingRoomReservation = meetingRoomReservationResult.data

    // 权限检查：仅创建者或管理员可编辑
    const wxContext = cloud.getWXContext()
    const isAdmin = userInfo.role === 'admin' || userInfo.isAdmin
    if (oldMeetingRoomReservation._openid !== wxContext.OPENID && !isAdmin) {
      return fail('无权限编辑此预约', 403)
    }

    // 构建更新数据
    const updateData = {
      updatedAt: Date.now()
    }

    // 允许更新的字段
    const allowedFields = ['title', 'roomId', 'roomName', 'date', 'startTime', 'endTime', 'description']
    allowedFields.forEach(field => {
      if (params[field] !== undefined) {
        updateData[field] = params[field]
      }
    })

    // 如果更新了时间相关字段，检查冲突
    if (params.startTime || params.endTime || params.date || params.roomId) {
      const startTime = params.startTime || oldMeetingRoomReservation.startTime
      const endTime = params.endTime || oldMeetingRoomReservation.endTime
      const date = params.date || oldMeetingRoomReservation.date
      const roomId = params.roomId || oldMeetingRoomReservation.roomId

      // 时间校验
      if (startTime >= endTime) {
        return fail('开始时间必须早于结束时间', 400)
      }

      // 检查时间冲突
      const conflictResult = await checkMeetingRoomConflict(roomId, date, startTime, endTime, meetingRoomReservationId)
      if (conflictResult.data.hasConflict) {
        return fail(`时间冲突：与「${conflictResult.data.conflictMeetingRoomReservation.title}」（${conflictResult.data.conflictMeetingRoomReservation.startTime}-${conflictResult.data.conflictMeetingRoomReservation.endTime}）重叠`, 400)
      }
    }

    // 更新预约
    await meetingRoomReservationsCollection.doc(meetingRoomReservationId).update({ data: updateData })

    return success({ message: '预约更新成功' })
  } catch (error) {
    console.error('更新预约失败:', error)
    return fail('更新预约失败')
  }
}

/**
 * 删除预约
 * @param {string} meetingRoomReservationId 预约ID
 * @param {Object} userInfo 用户信息
 */
async function deleteMeetingRoomReservation(meetingRoomReservationId, userInfo) {
  // 参数校验
  if (!meetingRoomReservationId) {
    return fail('缺少预约ID', 400)
  }

  try {
    // 获取原预约信息
    const meetingRoomReservationResult = await meetingRoomReservationsCollection.doc(meetingRoomReservationId).get()
    if (!meetingRoomReservationResult.data) {
      return fail('预约不存在', 404)
    }

    const meetingRoomReservation = meetingRoomReservationResult.data

    // 权限检查：仅创建者或管理员可删除
    const wxContext = cloud.getWXContext()
    const isAdmin = userInfo.role === 'admin' || userInfo.isAdmin
    if (meetingRoomReservation._openid !== wxContext.OPENID && !isAdmin) {
      return fail('无权限删除此预约', 403)
    }

    // 删除预约
    await meetingRoomReservationsCollection.doc(meetingRoomReservationId).remove()

    return success({ message: '预约删除成功' })
  } catch (error) {
    console.error('删除预约失败:', error)
    return fail('删除预约失败')
  }
}

/**
 * 获取指定日期的预约统计（用于日期选择器显示）
 * @param {string} date 日期 YYYY-MM-DD
 */
async function getMeetingRoomReservationStats(date) {
  try {
    const result = await meetingRoomReservationsCollection
      .where({ date })
      .field({ roomId: true, startTime: true })
      .get()

    // 按会议室分组统计
    const stats = {}
    result.data.forEach(meetingRoomReservation => {
      if (!stats[meetingRoomReservation.roomId]) {
        stats[meetingRoomReservation.roomId] = 0
      }
      stats[meetingRoomReservation.roomId]++
    })

    return success({ stats })
  } catch (error) {
    console.error('获取预约统计失败:', error)
    return fail('获取预约统计失败')
  }
}

/**
 * 批量获取指定会议室多个日期的预约数量
 * @param {string} roomId 会议室ID
 * @param {string[]} dates 日期数组 ['YYYY-MM-DD', ...]
 */
async function getBatchReservationCounts(roomId, dates) {
  try {
    const $ = db.command.aggregate

    const result = await meetingRoomReservationsCollection
      .aggregate()
      .match({
        roomId: roomId,
        date: _.in(dates)
      })
      .group({
        _id: '$date',
        count: $.sum(1)
      })
      .end()

    // 转为 { 'YYYY-MM-DD': count } 格式，未出现的日期补0
    const counts = {}
    result.list.forEach(item => {
      counts[item._id] = item.count
    })
    dates.forEach(d => {
      if (!counts[d]) counts[d] = 0
    })

    return success({ counts })
  } catch (error) {
    console.error('批量获取预约数量失败:', error)
    return fail('批量获取预约数量失败')
  }
}

/**
 * 获取指定会议室、日期的预约数量
 * @param {string} roomId 会议室ID
 * @param {string} date 日期 YYYY-MM-DD
 */
async function getMeetingRoomReservationCount(roomId, date) {
  try {
    const result = await meetingRoomReservationsCollection
      .where({
        roomId: roomId,
        date: date
      })
      .count()

    return success({ count: result.total })
  } catch (error) {
    console.error('获取预约数量失败:', error)
    return fail('获取预约数量失败')
  }
}

/**
 * 云函数入口函数
 */
exports.main = async (event, context) => {
  const { action, params } = event
  const wxContext = cloud.getWXContext()

  // 获取用户信息（从云函数上下文）
  const userInfo = {
    openid: wxContext.OPENID,
    name: event.userInfo?.name || '未知用户',
    role: event.userInfo?.role || '',
    isAdmin: event.userInfo?.isAdmin || false
  }

  try {
    switch (action) {
      case 'getMeetingRoomReservations':
        return await getMeetingRoomReservations(params.roomId, params.date)

      case 'createMeetingRoomReservation':
        return await createMeetingRoomReservation(params, userInfo)

      case 'updateMeetingRoomReservation':
        return await updateMeetingRoomReservation(params.meetingRoomReservationId, params, userInfo)

      case 'deleteMeetingRoomReservation':
        return await deleteMeetingRoomReservation(params.meetingRoomReservationId, userInfo)

      case 'checkMeetingRoomConflict':
        return await checkMeetingRoomConflict(
          params.roomId, 
          params.date, 
          params.startTime, 
          params.endTime, 
          params.excludeMeetingRoomReservationId
        )

      case 'getMeetingRoomReservationStats':
        return await getMeetingRoomReservationStats(params.date)

      case 'getMeetingRoomReservationCount':
        return await getMeetingRoomReservationCount(params.roomId, params.date)

      case 'getBatchReservationCounts':
        return await getBatchReservationCounts(params.roomId, params.dates)

      default:
        return fail(`未知的 action: ${action}`, 400)
    }
  } catch (error) {
    console.error('云函数执行失败:', error)
    return fail('云函数执行失败')
  }
}
