/**
 * 意见反馈管理云函数
 * 
 * 功能：
 * 1. getPosts - 获取意见列表（分页，含回复预览）
 * 2. createPost - 创建意见
 * 3. createReply - 创建回复（仅管理员）
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 集合引用
const feedbackPostsCollection = db.collection('feedback_posts')
const feedbackRepliesCollection = db.collection('feedback_replies')
const usersCollection = db.collection('office_users')
const notificationsCollection = db.collection('notifications')

/**
 * 统一返回格式
 */
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 获取用户信息
 */
async function getUserInfo(openid) {
  try {
    const res = await usersCollection.where({ openid }).get()
    if (res.data && res.data.length > 0) {
      return res.data[0]
    }
    return null
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return null
  }
}

/**
 * 检查是否为管理员
 */
async function checkIsAdmin(openid) {
  const user = await getUserInfo(openid)
  return user && (user.isAdmin || user.role === 'admin')
}

/**
 * 推送应用内通知
 */
async function pushNotification(targetOpenids, title, content, extra) {
  try {
    const notifications = targetOpenids.map(openid => ({
      openid,
      type: 'feedback',
      title,
      content,
      read: false,
      createdAt: Date.now(),
      extra: extra || {}
    }))
    for (const notif of notifications) {
      await notificationsCollection.add({ data: notif })
    }
  } catch (error) {
    console.error('推送通知失败:', error)
  }
}

/**
 * 获取意见列表（分页，含回复预览）
 */
async function getPosts(event) {
  const { page = 1, pageSize = 10 } = event
  const skip = (page - 1) * pageSize

  try {
    // 获取意见总数
    const countResult = await feedbackPostsCollection.count()
    const total = countResult.total

    // 获取意见列表
    const postsResult = await feedbackPostsCollection
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    if (!postsResult.data || postsResult.data.length === 0) {
      return success({
        list: [],
        total: 0,
        hasMore: false
      })
    }

    // 获取每个意见的回复（预览前3条）
    const postIds = postsResult.data.map(post => post._id)
    const repliesResult = await feedbackRepliesCollection
      .where({
        postId: _.in(postIds)
      })
      .orderBy('createdAt', 'asc')
      .get()

    // 建立 postId -> replies 的映射
    const repliesMap = {}
    if (repliesResult.data) {
      repliesResult.data.forEach(reply => {
        if (!repliesMap[reply.postId]) {
          repliesMap[reply.postId] = []
        }
        repliesMap[reply.postId].push(reply)
      })
    }

    // 组装返回数据
    const list = postsResult.data.map(post => ({
      _id: post._id,
      openid: post.openid,
      authorName: post.authorName,
      content: post.content,
      createdAt: post.createdAt,
      replies: repliesMap[post._id] || []
    }))

    return success({
      list,
      total,
      hasMore: skip + pageSize < total
    })
  } catch (error) {
    console.error('获取意见列表失败:', error)
    return fail(error.message || '获取失败', 500)
  }
}

/**
 * 创建意见
 */
async function createPost(event) {
  const { content } = event
  const { OPENID } = cloud.getWXContext()

  if (!content || !content.trim()) {
    return fail('意见内容不能为空', 400)
  }

  try {
    // 获取用户信息
    const user = await getUserInfo(OPENID)
    const authorName = user ? user.name : '匿名用户'

    // 创建意见
    const postData = {
      openid: OPENID,
      authorName,
      content: content.trim(),
      createdAt: Date.now()
    }

    const result = await feedbackPostsCollection.add({ data: postData })

    // 通知所有管理员
    try {
      const adminsRes = await usersCollection.where({
        isAdmin: true,
        status: 'approved'
      }).field({ openid: true }).get()

      if (adminsRes.data && adminsRes.data.length > 0) {
        const adminOpenids = adminsRes.data.map(u => u.openid)
        await pushNotification(
          adminOpenids,
          '【意见反馈】收到新的意见反馈',
          `${authorName}提交了一条新的意见反馈，请及时查看回复。`,
          { type: 'feedback_new', postId: result._id }
        )
      }
    } catch (notifyError) {
      console.error('通知管理员失败:', notifyError)
    }

    return success({
      _id: result._id,
      ...postData
    }, '发表成功')
  } catch (error) {
    console.error('创建意见失败:', error)
    return fail(error.message || '发表失败', 500)
  }
}

/**
 * 创建回复（仅管理员）
 */
async function createReply(event) {
  const { postId, content } = event
  const { OPENID } = cloud.getWXContext()

  if (!postId) {
    return fail('缺少意见ID', 400)
  }

  if (!content || !content.trim()) {
    return fail('回复内容不能为空', 400)
  }

  try {
    // 检查是否为管理员
    const isAdmin = await checkIsAdmin(OPENID)
    if (!isAdmin) {
      return fail('无权限回复，仅管理员可回复', 403)
    }

    // 获取管理员信息
    const user = await getUserInfo(OPENID)
    const authorName = user ? user.name : '管理员'

    // 创建回复
    const replyData = {
      postId,
      openid: OPENID,
      authorName,
      isAdmin: true,
      content: content.trim(),
      createdAt: Date.now()
    }

    const result = await feedbackRepliesCollection.add({ data: replyData })

    // 通知反馈作者
    try {
      const postRes = await feedbackPostsCollection.doc(postId).get()
      if (postRes.data && postRes.data.openid !== OPENID) {
        await pushNotification(
          [postRes.data.openid],
          '【意见反馈】您的意见已收到回复',
          `管理员回复了您的意见反馈，请及时查看。`,
          { type: 'feedback_reply', postId }
        )
      }
    } catch (notifyError) {
      console.error('通知反馈作者失败:', notifyError)
    }

    return success({
      _id: result._id,
      ...replyData
    }, '回复成功')
  } catch (error) {
    console.error('创建回复失败:', error)
    return fail(error.message || '回复失败', 500)
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event

  switch (action) {
    case 'getPosts':
      return await getPosts(event)
    case 'createPost':
      return await createPost(event)
    case 'createReply':
      return await createReply(event)
    default:
      return fail('不支持的操作类型', 400)
  }
}
