const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const articlesCollection = db.collection('learning_articles')
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
 * 获取用户信息并校验
 */
async function getUserAndValidate(openid) {
  const userResult = await usersCollection
    .where({ openid })
    .limit(1)
    .get()

  if (!userResult.data || userResult.data.length === 0) {
    return { user: null, error: fail('用户不存在', 404) }
  }

  return { user: userResult.data[0], error: null }
}

/**
 * 创建文章
 */
async function createArticle(openid, data) {
  const { title, content, plainText, coverImage } = data

  if (!title || !content) {
    return fail('标题和内容不能为空', 400)
  }

  if (title.length > 100) {
    return fail('标题不能超过100个字符', 400)
  }

  const { user, error } = await getUserAndValidate(openid)
  if (error) return error

  const now = Date.now()

  const article = {
    title: title.trim(),
    content,
    plainText: (plainText || '').replace(/<[^>]+>/g, '').trim().slice(0, 200),
    coverImage: coverImage || '',
    authorId: openid,
    authorName: user.name || '未知用户',
    authorAvatar: user.avatarUrl || '',
    isPinned: false,
    pinnedAt: 0,
    readCount: 0,
    status: 'published',
    createdAt: now,
    updatedAt: now
  }

  const result = await articlesCollection.add({ data: article })

  return success({
    _id: result._id,
    ...article
  }, '发布成功')
}

/**
 * 文章列表（分页）
 */
async function listArticles(params) {
  const { page = 1, pageSize = 10 } = params || {}

  // 查询已发布的文章
  const query = articlesCollection
    .where({ status: 'published' })
    .orderBy('isPinned', 'desc')
    .orderBy('pinnedAt', 'desc')
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)

  const { data: list } = await query.get()

  // 查询总数
  const { total } = await articlesCollection
    .where({ status: 'published' })
    .count()

  return success({
    list,
    total,
    hasMore: page * pageSize < total
  })
}

/**
 * 获取文章详情
 */
async function getArticle(articleId) {
  if (!articleId) {
    return fail('文章ID不能为空', 400)
  }

  const { data: article } = await articlesCollection.doc(articleId).get()

  if (!article) {
    return fail('文章不存在', 404)
  }

  // 递增阅读量
  await articlesCollection.doc(articleId).update({
    data: { readCount: _.inc(1) }
  })

  return success({
    ...article,
    readCount: (article.readCount || 0) + 1
  })
}

/**
 * 置顶/取消置顶
 */
async function pinArticle(openid, articleId) {
  if (!articleId) {
    return fail('文章ID不能为空', 400)
  }

  const { user, error } = await getUserAndValidate(openid)
  if (error) return error

  // 仅管理员可置顶
  if (!user.isAdmin) {
    return fail('仅管理员可置顶文章', 403)
  }

  const { data: article } = await articlesCollection.doc(articleId).get()
  if (!article) {
    return fail('文章不存在', 404)
  }

  const now = Date.now()
  const newPinned = !article.isPinned

  await articlesCollection.doc(articleId).update({
    data: {
      isPinned: newPinned,
      pinnedAt: newPinned ? now : 0,
      updatedAt: now
    }
  })

  return success(null, newPinned ? '置顶成功' : '已取消置顶')
}

/**
 * 删除文章
 */
async function deleteArticle(openid, articleId) {
  if (!articleId) {
    return fail('文章ID不能为空', 400)
  }

  const { user, error } = await getUserAndValidate(openid)
  if (error) return error

  const { data: article } = await articlesCollection.doc(articleId).get()
  if (!article) {
    return fail('文章不存在', 404)
  }

  // 管理员或发布者可删除
  const isAuthor = article.authorId === openid
  const isAdmin = !!user.isAdmin

  if (!isAuthor && !isAdmin) {
    return fail('仅管理员或文章发布者可删除', 403)
  }

  await articlesCollection.doc(articleId).update({
    data: {
      status: 'deleted',
      updatedAt: Date.now()
    }
  })

  return success(null, '删除成功')
}

exports.main = async (event, context) => {
  const { action, params, data, articleId } = event
  const openid = cloud.getWXContext().OPENID

  try {
    switch (action) {
      case 'create':
        return await createArticle(openid, data)
      case 'list':
        return await listArticles(params)
      case 'get':
        return await getArticle(articleId)
      case 'pin':
        return await pinArticle(openid, articleId)
      case 'delete':
        return await deleteArticle(openid, articleId)
      default:
        return fail('未知操作', 400)
    }
  } catch (error) {
    console.error('articleManager 操作失败:', error)
    return fail(error.message || '服务异常', 500)
  }
}
