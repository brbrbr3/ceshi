const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 聚合操作符
const $ = db.command.aggregate

// 未读消息提醒模板ID（模板4：新菜单发布等通用消息推送）
const UNREAD_MESSAGE_TEMPLATE_ID = 'mJ1CGM8OvpgomnYy0yot4Kk8hD8S-NH06A6ZDywdpGc'

/**
 * 截断文本（微信 thing 类型限制20字）
 */
function truncateNoticeText(text, len) {
  if (!text) return ''
  const max = len || 20
  return text.length > max ? text.substring(0, max) : text
}

/**
 * 向全体已批准用户推送"未读消息提醒"（菜单发布通知）
 * 盲发模式：不查询用户是否订阅，直接 send，失败仅记日志
 * @param {string} authorName - 菜单发布人姓名
 * @param {string} menuTitle - 菜单标题
 */
async function sendMenuNoticeToAllUsers(authorName, menuTitle) {
  const msgType = truncateNoticeText('新菜单通知')
  const msgContent = truncateNoticeText(menuTitle || '')
  const remark = truncateNoticeText(`${authorName || '管理员'}发布了新的工作餐菜单，点击查看`)

  const batchSize = 100
  let offset = 0
  let totalSent = 0
  let totalFailed = 0

  while (true) {
    const res = await db.collection('office_users')
      .where({ status: 'approved' })
      .skip(offset)
      .limit(batchSize)
      .get()

    if (!res.data || res.data.length === 0) break

    for (const userDoc of res.data) {
      try {
        const now = new Date()
        const timezoneOffset = -3 // UTC-3
        const local = new Date(now.getTime() + timezoneOffset * 3600000)
        const timeStr = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')} ${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`

        await cloud.openapi.subscribeMessage.send({
          touser: userDoc.openid,
          templateId: UNREAD_MESSAGE_TEMPLATE_ID,
          page: 'pages/office/menus/menus',
          data: {
            thing7: { value: '系统' },
            time2: { value: timeStr },
            thing6: { value: msgType },
            thing3: { value: msgContent },
            thing4: { value: remark }
          }
        })
        totalSent++
      } catch (error) {
        const errcode = error.errcode || error.errCode || 'unknown'
        const errmsg = error.errmsg || error.errMsg || error.message || JSON.stringify(error)
        console.warn('[菜单通知] 发送失败:', JSON.stringify({ openid: userDoc.openid, errcode, errmsg }))
        totalFailed++
      }
    }

    offset += batchSize
    if (res.data.length < batchSize) break
  }

  console.log(`[菜单通知] 推送完成: 成功 ${totalSent} 失败 ${totalFailed}`)
}

exports.main = async (event) => {
  const { action, menuData, menuId, commentData, ratingData } = event

  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 查询当前用户信息
  const userResult = await db.collection('office_users')
    .where({ openid })
    .limit(1)
    .get()

  if (!userResult.data || userResult.data.length === 0) {
    return {
      code: 401,
      message: '用户未登录'
    }
  }

  const user = userResult.data[0]
  const isAdmin = user.isAdmin === true

  try {
    switch (action) {
      case 'addMenu':
        // 管理员、厨师、办公室内聘可以添加菜单（与前端 menus.js checkPermission 保持一致）
        const isChef = Array.isArray(user.position) && user.position.includes('厨师')
        const isOfficeServant = Array.isArray(user.position) && user.position.includes('办公室内聘')
        if (!isAdmin && !isChef && !isOfficeServant) {
          return {
            code: 403,
            message: '只有管理员、厨师、办公室内聘可以添加菜单'
          }
        }

        const addResult = await db.collection('menus').add({
          data: {
            title: menuData.title,
            content: menuData.content,
            authorOpenid: openid,
            authorName: menuData.authorName,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        })

        // 菜单发布成功后，向全体用户推送"未读消息提醒"订阅消息（盲发，失败仅记日志）
        sendMenuNoticeToAllUsers(menuData.authorName || user.name || '管理员', menuData.title).catch(err => {
          console.error('[菜单通知] 推送失败:', err)
        })

        return {
          code: 0,
          message: '添加成功',
          data: {
            _id: addResult._id,
            id: addResult._id
          }
        }

      case 'updateMenu':
        // 只有菜单作者和管理员可以编辑
        const menuDoc = await db.collection('menus').doc(menuId).get()
        if (!menuDoc.data) {
          return {
            code: 404,
            message: '菜单不存在'
          }
        }

        if (menuDoc.data.authorOpenid !== openid && !isAdmin) {
          return {
            code: 403,
            message: '只有作者和管理员可以编辑菜单'
          }
        }

        await db.collection('menus').doc(menuId).update({
          data: {
            title: menuData.title,
            content: menuData.content,
            updatedAt: Date.now()
          }
        })

        return {
          code: 0,
          message: '更新成功'
        }

      case 'deleteMenu':
        // 只有菜单作者和管理员可以删除
        const deleteMenuDoc = await db.collection('menus').doc(menuId).get()
        if (!deleteMenuDoc.data) {
          return {
            code: 404,
            message: '菜单不存在'
          }
        }

        if (deleteMenuDoc.data.authorOpenid !== openid && !isAdmin) {
          return {
            code: 403,
            message: '只有作者和管理员可以删除菜单'
          }
        }

        await db.collection('menus').doc(menuId).remove()

        return {
          code: 0,
          message: '删除成功'
        }

      case 'addComment':
        // 所有已批准用户可以添加评论
        if (user.status !== 'approved') {
          return {
            code: 403,
            message: '用户未通过审核'
          }
        }

        const addCommentResult = await db.collection('menu_comments').add({
          data: {
            menuId: commentData.menuId,
            openid: openid,
            authorOpenid: openid,
            authorName: user.name,
            content: commentData.content,
            createdAt: Date.now()
          }
        })

        return {
          code: 0,
          message: '评论成功',
          data: {
            _id: addCommentResult._id,
            id: addCommentResult._id
          }
        }

      case 'deleteComment':
        // 只能删除自己的评论，管理员可以删除所有评论
        const commentDoc = await db.collection('menu_comments').doc(menuId).get()
        if (!commentDoc.data) {
          return {
            code: 404,
            message: '评论不存在'
          }
        }

        if (commentDoc.data.openid !== openid && !isAdmin) {
          return {
            code: 403,
            message: '只能删除自己的评论'
          }
        }

        await db.collection('menu_comments').doc(menuId).remove()

        return {
          code: 0,
          message: '删除成功'
        }

      case 'addRating':
        // 所有已登录用户可以为菜品打分
        if (!ratingData || !ratingData.menuId || !ratingData.dishName || !ratingData.score) {
          return {
            code: 400,
            message: '评分参数不完整'
          }
        }

        if (ratingData.score < 1 || ratingData.score > 5) {
          return {
            code: 400,
            message: '分数必须在1-5之间'
          }
        }

        // 检查是否已经为该菜品打分（同一用户对同一菜单的同一道菜只能打一次）
        const existingRating = await db.collection('menu_ratings')
          .where({
            menuId: ratingData.menuId,
            openid: openid,
            dishName: ratingData.dishName
          })
          .limit(1)
          .get()

        if (existingRating.data && existingRating.data.length > 0) {
          return {
            code: 403,
            message: '您已经为该菜品打过分了'
          }
        }

        const addRatingResult = await db.collection('menu_ratings').add({
          data: {
            menuId: ratingData.menuId,
            openid: openid,
            authorOpenid: openid,
            authorName: user.name,
            dishName: ratingData.dishName,
            score: ratingData.score,
            createdAt: Date.now()
          }
        })

        return {
          code: 0,
          message: '打分成功',
          data: {
            _id: addRatingResult._id
          }
        }

      case 'getRatings':
        if (!ratingData || !ratingData.menuId) {
          return {
            code: 400,
            message: '缺少菜单ID'
          }
        }

        // 1. 聚合统计各菜品评分（不受 100 条默认 limit 限制）
        const aggRes = await db.collection('menu_ratings')
          .aggregate()
          .match({ menuId: ratingData.menuId })
          .group({
            _id: '$dishName',
            total: $.sum(1),
            scoreSum: $.sum('$score'),
            c1: $.sum($.cond({ if: $.eq(['$score', 1]), then: 1, else: 0 })),
            c2: $.sum($.cond({ if: $.eq(['$score', 2]), then: 1, else: 0 })),
            c3: $.sum($.cond({ if: $.eq(['$score', 3]), then: 1, else: 0 })),
            c4: $.sum($.cond({ if: $.eq(['$score', 4]), then: 1, else: 0 })),
            c5: $.sum($.cond({ if: $.eq(['$score', 5]), then: 1, else: 0 }))
          })
          .limit(1000)
          .end()

        // 2. 单独查当前用户已评记录（单用户量小，无需分页）
        const myRes = await db.collection('menu_ratings')
          .where({ menuId: ratingData.menuId, openid: openid })
          .limit(1000)
          .get()

        const myRatings = (myRes.data || []).map(r => ({ dishName: r.dishName, score: r.score }))
        const ratedDishNames = myRatings.map(r => r.dishName)

        const dishRatings = (aggRes.list || []).map(item => {
          const dishName = item._id
          const total = item.total || 0
          const scoreSum = item.scoreSum || 0
          return {
            dishName,
            averageScore: total > 0 ? Math.round((scoreSum / total) * 10) / 10 : 0,
            totalRaters: total,
            countByScore: {
              1: item.c1 || 0,
              2: item.c2 || 0,
              3: item.c3 || 0,
              4: item.c4 || 0,
              5: item.c5 || 0
            },
            hasRated: ratedDishNames.includes(dishName)
          }
        })

        const totalRatings = dishRatings.reduce((acc, d) => acc + d.totalRaters, 0)

        return {
          code: 0,
          message: 'ok',
          data: {
            ratings: dishRatings,
            myRatings: myRatings,
            totalRatings: totalRatings
          }
        }

      default:
        return {
          code: 400,
          message: '不支持的操作'
        }
    }
  } catch (error) {
    console.error('menuManager 执行失败', error)
    return {
      code: 500,
      message: error.message || '操作失败'
    }
  }
}
