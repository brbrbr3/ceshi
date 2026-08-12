/**
 * 小绿书管理云函数
 * 
 * Actions:
 *   - list: 帖子列表（分页，支持分类筛选和排序）
 *   - detail: 帖子详情（含作者信息、点赞收藏状态）
 *   - create: 创建帖子
 *   - delete: 删除帖子（仅作者或管理员）
 *   - toggleLike: 切换点赞
 *   - addComment: 添加评论
 *   - deleteComment: 删除评论
 *   - getComments: 获取评论列表
 *   - toggleCollect: 切换收藏
 *   - myPosts: 我的帖子
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 集合引用
const postsCollection = db.collection('greenbook_posts')
const commentsCollection = db.collection('greenbook_comments')
const likesCollection = db.collection('greenbook_likes')
const usersCollection = db.collection('office_users')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}
function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 获取用户信息
 */
async function getUserInfo(openId) {
  try {
    const userRes = await usersCollection.where({ openid: openId }).limit(1).get()
    if (userRes.data.length > 0) {
      const user = userRes.data[0]
      return {
        authorName: user.name || user.displayName || '匿名用户',
        authorAvatar: user.avatar || ''
      }
    }
  } catch (e) {
    console.error('获取用户信息失败:', e)
  }
  return { authorName: '匿名用户', authorAvatar: '' }
}

// ==================== 帖子列表 ====================

async function handleList(event) {
  const { page = 1, pageSize = 20, category = '', sortBy = 'latest' } = event
  const { OPENID } = cloud.getWXContext()
  const skip = (page - 1) * pageSize

  // 构建查询条件
  let whereCondition = {}
  if (category && category !== '推荐') {
    whereCondition.category = category
  }

  // 排序
  let orderBy = sortBy === 'hot' ? { likeCount: 'desc', createdAt: 'desc' } : { createdAt: 'desc' }

  const [countRes, listRes] = await Promise.all([
    postsCollection.where(whereCondition).count(),
    postsCollection
      .where(whereCondition)
      .orderBy(orderBy.field || 'createdAt', orderBy.order || 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ])

  const total = countRes.total
  let list = listRes.data

  // 批量查询当前用户的点赞和收藏状态
  if (list.length > 0 && OPENID) {
    const postIds = list.map(p => p._id)

    const [likedRes, collectedRes] = await Promise.all([
      likesCollection
        .where({ _openid: OPENID, targetId: _.in(postIds), targetType: 'post' })
        .limit(postIds.length)
        .get(),
      likesCollection
        .where({ _openid: OPENID, targetId: _.in(postIds), targetType: 'collect' })
        .limit(postIds.length)
        .get()
    ])

    const likedSet = new Set(likedRes.data.map(r => r.targetId))
    const collectedSet = new Set(collectedRes.data.map(r => r.targetId))

    list = list.map(post => ({
      ...post,
      isLiked: likedSet.has(post._id),
      isCollected: collectedSet.has(post._id)
    }))
  } else {
    list = list.map(post => ({ ...post, isLiked: false, isCollected: false }))
  }

  return success({
    list,
    total,
    hasMore: skip + list.length < total
  })
}

// ==================== 帖子详情 ====================

async function handleDetail(event) {
  const { postId } = event
  if (!postId) return fail('缺少 postId', 400)

  const { OPENID } = cloud.getWXContext()

  const postRes = await postsCollection.doc(postId).get()
  const post = postRes.data

  // 查询点赞和收藏状态
  let isLiked = false
  let isCollected = false
  if (OPENID) {
    const [likedRes, collectedRes] = await Promise.all([
      likesCollection.where({ _openid: OPENID, targetId: postId, targetType: 'post' }).limit(1).get(),
      likesCollection.where({ _openid: OPENID, targetId: postId, targetType: 'collect' }).limit(1).get()
    ])
    isLiked = likedRes.data.length > 0
    isCollected = collectedRes.data.length > 0
  }

  return success({
    ...post,
    isLiked,
    isCollected
  })
}

// ==================== 创建帖子 ====================

async function handleCreate(event) {
  const { OPENID } = cloud.getWXContext()
  const { title = '', content, images = [], imageRatios = [], tags = [], category = '生活' } = event

  if (!content || !content.trim()) return fail('请输入帖子内容', 400)
  if (!images || images.length === 0) return fail('请至少上传1张图片', 400)
  if (images.length > 9) return fail('最多上传9张图片', 400)

  const userInfo = await getUserInfo(OPENID)
  const now = Date.now()

  const postData = {
    _openid: OPENID,
    authorName: userInfo.authorName,
    authorAvatar: userInfo.authorAvatar,
    title: title.trim(),
    content: content.trim(),
    images,
    imageRatios,
    tags,
    category,
    likeCount: 0,
    commentCount: 0,
    collectCount: 0,
    createdAt: now,
    updatedAt: now
  }

  const addRes = await postsCollection.add({ data: postData })

  return success({
    _id: addRes._id,
    ...postData
  }, '发布成功')
}

// ==================== 删除帖子 ====================

async function handleDelete(event) {
  const { OPENID } = cloud.getWXContext()
  const { postId } = event
  if (!postId) return fail('缺少 postId', 400)

  const postRes = await postsCollection.doc(postId).get()
  const post = postRes.data

  // 权限检查：仅作者或管理员
  const userRes = await usersCollection.where({ openid: OPENID }).limit(1).get()
  const user = userRes.data[0]
  const isAdmin = user && (user.isAdmin || user.role === 'admin')

  if (post._openid !== OPENID && !isAdmin) {
    return fail('无权删除此帖子', 403)
  }

  // 删除帖子
  await postsCollection.doc(postId).remove()

  // 删除相关评论
  await commentsCollection.where({ postId }).remove()

  // 删除相关点赞和收藏
  await likesCollection.where({ targetId: postId }).remove()

  return success(null, '删除成功')
}

// ==================== 切换点赞 ====================

async function handleToggleLike(event) {
  const { OPENID } = cloud.getWXContext()
  const { targetId, targetType = 'post' } = event
  if (!targetId) return fail('缺少 targetId', 400)

  // 查询是否已点赞
  const existRes = await likesCollection
    .where({ _openid: OPENID, targetId, targetType })
    .limit(1)
    .get()

  if (existRes.data.length > 0) {
    // 已点赞 → 取消
    const existingId = existRes.data[0]._id
    await likesCollection.doc(existingId).remove()

    if (targetType === 'post') {
      await postsCollection.doc(targetId).update({
        data: { likeCount: _.inc(-1) }
      })
    } else if (targetType === 'comment') {
      await commentsCollection.doc(targetId).update({
        data: { likeCount: _.inc(-1) }
      })
    }
    return success({ isLiked: false }, '取消点赞')
  } else {
    // 未点赞 → 添加
    await likesCollection.add({
      data: {
        _openid: OPENID,
        targetId,
        targetType,
        createdAt: Date.now()
      }
    })

    if (targetType === 'post') {
      await postsCollection.doc(targetId).update({
        data: { likeCount: _.inc(1) }
      })
    } else if (targetType === 'comment') {
      await commentsCollection.doc(targetId).update({
        data: { likeCount: _.inc(1) }
      })
    }
    return success({ isLiked: true }, '点赞成功')
  }
}

// ==================== 切换收藏 ====================

async function handleToggleCollect(event) {
  const { OPENID } = cloud.getWXContext()
  const { postId } = event
  if (!postId) return fail('缺少 postId', 400)

  const existRes = await likesCollection
    .where({ _openid: OPENID, targetId: postId, targetType: 'collect' })
    .limit(1)
    .get()

  if (existRes.data.length > 0) {
    // 已收藏 → 取消
    await likesCollection.doc(existRes.data[0]._id).remove()
    await postsCollection.doc(postId).update({
      data: { collectCount: _.inc(-1) }
    })
    return success({ isCollected: false }, '取消收藏')
  } else {
    // 未收藏 → 添加
    await likesCollection.add({
      data: {
        _openid: OPENID,
        targetId: postId,
        targetType: 'collect',
        createdAt: Date.now()
      }
    })
    await postsCollection.doc(postId).update({
      data: { collectCount: _.inc(1) }
    })
    return success({ isCollected: true }, '收藏成功')
  }
}

// ==================== 添加评论 ====================

async function handleAddComment(event) {
  const { OPENID } = cloud.getWXContext()
  const { postId, content, replyToId = '', replyToName = '' } = event
  if (!postId) return fail('缺少 postId', 400)
  if (!content || !content.trim()) return fail('请输入评论内容', 400)

  const userInfo = await getUserInfo(OPENID)

  const commentData = {
    _openid: OPENID,
    postId,
    authorName: userInfo.authorName,
    authorAvatar: userInfo.authorAvatar,
    content: content.trim(),
    replyToId: replyToId || null,
    replyToName: replyToName || null,
    likeCount: 0,
    createdAt: Date.now()
  }

  const addRes = await commentsCollection.add({ data: commentData })

  // 帖子评论数+1
  await postsCollection.doc(postId).update({
    data: { commentCount: _.inc(1) }
  })

  return success({
    _id: addRes._id,
    ...commentData
  }, '评论成功')
}

// ==================== 删除评论 ====================

async function handleDeleteComment(event) {
  const { OPENID } = cloud.getWXContext()
  const { commentId } = event
  if (!commentId) return fail('缺少 commentId', 400)

  const commentRes = await commentsCollection.doc(commentId).get()
  const comment = commentRes.data

  // 权限检查
  const userRes = await usersCollection.where({ openid: OPENID }).limit(1).get()
  const user = userRes.data[0]
  const isAdmin = user && (user.isAdmin || user.role === 'admin')

  if (comment._openid !== OPENID && !isAdmin) {
    return fail('无权删除此评论', 403)
  }

  await commentsCollection.doc(commentId).remove()

  // 帖子评论数-1
  if (comment.postId) {
    await postsCollection.doc(comment.postId).update({
      data: { commentCount: _.inc(-1) }
    })
  }

  // 删除评论的点赞
  await likesCollection.where({ targetId: commentId, targetType: 'comment' }).remove()

  return success(null, '删除成功')
}

// ==================== 获取评论列表 ====================

async function handleGetComments(event) {
  const { OPENID } = cloud.getWXContext()
  const { postId, page = 1, pageSize = 20 } = event
  if (!postId) return fail('缺少 postId', 400)

  const skip = (page - 1) * pageSize

  // 查询一级评论
  const [countRes, listRes] = await Promise.all([
    commentsCollection.where({ postId, replyToId: null }).count(),
    commentsCollection
      .where({ postId, replyToId: null })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
  ])

  const total = countRes.total
  let comments = listRes.data

  // 批量查询二级回复（每条一级评论取最近3条回复）
  if (comments.length > 0) {
    const commentIds = comments.map(c => c._id)
    const repliesRes = await commentsCollection
      .where({ postId, replyToId: _.in(commentIds) })
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get()

    // 按回复目标分组
    const repliesMap = {}
    repliesRes.data.forEach(r => {
      if (!repliesMap[r.replyToId]) repliesMap[r.replyToId] = []
      repliesMap[r.replyToId].push(r)
    })

    comments = comments.map(c => ({
      ...c,
      replies: (repliesMap[c._id] || []).slice(0, 3),
      replyCount: (repliesMap[c._id] || []).length
    }))

    // 批量查询点赞状态
    if (OPENID) {
      const allIds = [...commentIds]
      repliesRes.data.forEach(r => allIds.push(r._id))

      const likedRes = await likesCollection
        .where({ _openid: OPENID, targetId: _.in(allIds), targetType: 'comment' })
        .limit(allIds.length)
        .get()
      const likedSet = new Set(likedRes.data.map(r => r.targetId))

      comments = comments.map(c => {
        const enriched = { ...c, isLiked: likedSet.has(c._id) }
        if (enriched.replies) {
          enriched.replies = enriched.replies.map(r => ({
            ...r,
            isLiked: likedSet.has(r._id)
          }))
        }
        return enriched
      })
    }
  }

  return success({
    comments,
    total,
    hasMore: skip + comments.length < total
  })
}

// ==================== 我的帖子 ====================

async function handleMyPosts(event) {
  const { OPENID } = cloud.getWXContext()
  const { page = 1, pageSize = 20 } = event
  const skip = (page - 1) * pageSize

  const [countRes, listRes] = await Promise.all([
    postsCollection.where({ _openid: OPENID }).count(),
    postsCollection
      .where({ _openid: OPENID })
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
}

// ==================== 主入口 ====================

exports.main = async (event, context) => {
  const { action } = event

  console.log(`[greenbookManager] action: ${action}`)

  try {
    switch (action) {
      case 'list':
        return await handleList(event)
      case 'detail':
        return await handleDetail(event)
      case 'create':
        return await handleCreate(event)
      case 'delete':
        return await handleDelete(event)
      case 'toggleLike':
        return await handleToggleLike(event)
      case 'toggleCollect':
        return await handleToggleCollect(event)
      case 'addComment':
        return await handleAddComment(event)
      case 'deleteComment':
        return await handleDeleteComment(event)
      case 'getComments':
        return await handleGetComments(event)
      case 'myPosts':
        return await handleMyPosts(event)
      default:
        return fail(`未知操作: ${action}`, 400)
    }
  } catch (error) {
    console.error(`[greenbookManager] ${action} 操作失败:`, error)
    return fail(error.message || '服务异常')
  }
}
