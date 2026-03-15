const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const workflowTemplatesCollection = db.collection('workflow_templates')
const workOrdersCollection = db.collection('work_orders')
const announcementsCollection = db.collection('announcements')
const usersCollection = db.collection('office_users')

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
 * 创建并发布通知公告
 */
async function createAnnouncement(openid, data) {
  const { title, content, type } = data

  // 验证必填字段
  if (!title || !content) {
    return fail('标题和内容不能为空', 400)
  }

  // 验证通知类型
  const validTypes = ['urgent', 'important', 'normal']
  const announcementType = type || 'normal'
  if (!validTypes.includes(announcementType)) {
    return fail('通知类型无效', 400)
  }

  // 获取发布者信息
  const userResult = await usersCollection
    .where({ openid })
    .limit(1)
    .get()

  if (!userResult.data || userResult.data.length === 0) {
    return fail('用户不存在', 404)
  }

  const publisher = userResult.data[0]

  // 查询通知公告工作流配置
  const workflowResult = await workflowTemplatesCollection
    .where({ code: 'notification_publish' })
    .limit(1)
    .get()

  if (!workflowResult.data || workflowResult.data.length === 0) {
    return fail('通知公告工作流配置不存在', 404)
  }

  const workflow = workflowResult.data[0]

  const now = Date.now()

  // 创建工单（0步审批，自动完成）
  const orderData = {
    orderType: 'notification_publish',
    workflowId: workflow._id,
    workflowName: workflow.name,
    status: 'approved',
    currentStepId: 'completed',
    currentStepName: '已完成',
    initiatorId: openid,
    initiatorName: publisher.name,
    initiatorRole: publisher.role,
    formData: {
      title,
      content,
      type: announcementType
    },
    steps: [
      {
        stepId: 'step_1',
        stepName: '发布',
        action: 'start',
        operatorId: openid,
        operatorName: publisher.name,
        description: '发布通知公告',
        createdAt: now
      },
      {
        stepId: 'completed',
        stepName: '自动通过',
        action: 'auto_approve',
        operatorId: 'system',
        operatorName: '系统',
        description: '通知公告自动发布成功',
        createdAt: now
      }
    ],
    completedAt: now,
    createdAt: now,
    updatedAt: now
  }

  const orderResult = await workOrdersCollection.add({ data: orderData })

  // 创建通知公告记录
  const announcementData = {
    orderId: orderResult._id,
    title,
    content,
    type: announcementType,
    publisherId: openid,
    publisherName: publisher.name,
    publishedAt: now,
    status: 'published',
    readCount: 0,
    readUsers: [],
    createdAt: now,
    updatedAt: now
  }

  const announcementResult = await announcementsCollection.add({ data: announcementData })

  // 推送通知给所有用户
  await pushAnnouncementNotification(openid, announcementResult._id, title, announcementType)

  return success({
    orderId: orderResult._id,
    announcementId: announcementResult._id,
    announcement: announcementData
  }, '通知公告发布成功')
}

/**
 * 推送通知公告
 */
async function pushAnnouncementNotification(publisherOpenid, announcementId, title, type) {
  try {
    // 查询所有已注册用户
    const usersResult = await usersCollection
      .where({ status: 'approved' })
      .field({ openid: true })
      .get()

    if (!usersResult.data || usersResult.data.length === 0) {
      return
    }

    const recipientOpenids = usersResult.data
      .filter(user => user.openid !== publisherOpenid)
      .map(user => user.openid)

    // 获取通知类型文本
    const typeMap = {
      'urgent': '【紧急】',
      'important': '【重要】',
      'normal': ''
    }

    const typeText = typeMap[type] || ''

    // 批量创建通知
    const notificationData = recipientOpenids.map(openid => ({
      recipientId: openid,
      type: 'announcement',
      title: `${typeText}${title}`,
      message: `新的通知公告：${title}`,
      announcementId: announcementId,
      read: false,
      createdAt: Date.now()
    }))

    // 调用通知管理云函数批量创建通知
    await cloud.callFunction({
      name: 'notificationManager',
      data: {
        action: 'createBatch',
        notifications: notificationData
      }
    })
  } catch (error) {
    console.error('推送通知失败:', error)
    // 推送失败不影响主流程
  }
}

/**
 * 获取通知公告列表
 */
async function listAnnouncements(params) {
  const { page = 1, pageSize = 20, type } = params

  // 构建查询条件
  const where = {
    status: 'published'
  }

  if (type && type !== 'all') {
    where.type = type
  }

  // 查询总数
  const countResult = await announcementsCollection
    .where(where)
    .count()

  const total = countResult.total || 0

  // 查询列表
  const skip = (page - 1) * pageSize
  const listResult = await announcementsCollection
    .where(where)
    .orderBy('publishedAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const list = listResult.data || []

  return success({
    list,
    total,
    page,
    pageSize,
    hasMore: skip + list.length < total
  })
}

/**
 * 获取通知公告详情
 */
async function getAnnouncement(openid, announcementId) {
  const result = await announcementsCollection
    .doc(announcementId)
    .get()

  if (!result.data) {
    return fail('通知公告不存在', 404)
  }

  const announcement = result.data

  // 检查是否已读
  if (!announcement.readUsers || !announcement.readUsers.includes(openid)) {
    // 标记为已读
    const readUsers = announcement.readUsers || []
    readUsers.push(openid)

    await announcementsCollection
      .doc(announcementId)
      .update({
        data: {
          readUsers: readUsers,
          readCount: readUsers.length
        }
      })

    announcement.readUsers = readUsers
    announcement.readCount = readUsers.length
  }

  return success(announcement)
}

/**
 * 撤回通知公告
 */
async function revokeAnnouncement(openid, announcementId) {
  // 查询通知公告
  const result = await announcementsCollection
    .doc(announcementId)
    .get()

  if (!result.data) {
    return fail('通知公告不存在', 404)
  }

  const announcement = result.data

  // 检查权限：只有发布者和管理员可以撤回
  if (announcement.publisherId !== openid) {
    // 检查是否为管理员
    const userResult = await usersCollection
      .where({ openid })
      .limit(1)
      .get()

    if (!userResult.data || userResult.data.length === 0 || !userResult.data[0].isAdmin) {
      return fail('只有发布者或管理员才能撤回通知公告', 403)
    }
  }

  // 检查状态
  if (announcement.status === 'revoked') {
    return fail('通知公告已被撤回', 400)
  }

  // 更新状态
  await announcementsCollection
    .doc(announcementId)
    .update({
      data: {
        status: 'revoked',
        updatedAt: Date.now()
      }
    })

  return success(null, '通知公告已撤回')
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const action = event && event.action

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  try {
    if (action === 'create') {
      const data = event.data || {}
      return await createAnnouncement(openid, data)
    }

    if (action === 'list') {
      const params = event.params || {}
      return await listAnnouncements(params)
    }

    if (action === 'get') {
      const announcementId = event.announcementId
      if (!announcementId) {
        return fail('缺少通知公告ID', 400)
      }
      return await getAnnouncement(openid, announcementId)
    }

    if (action === 'revoke') {
      const announcementId = event.announcementId
      if (!announcementId) {
        return fail('缺少通知公告ID', 400)
      }
      return await revokeAnnouncement(openid, announcementId)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    console.error('announcementManager error:', error)
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
