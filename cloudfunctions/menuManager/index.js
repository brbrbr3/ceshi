const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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
  const isWorker = user.role === '工勤'

  try {
    switch (action) {
      case 'addMenu':
        // 工勤和管理员可以添加菜单
        if (!isWorker && !isAdmin) {
          return {
            code: 403,
            message: '只有工勤和管理员可以添加菜单'
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

        const ratingsResult = await db.collection('menu_ratings')
          .where({
            menuId: ratingData.menuId
          })
          .orderBy('createdAt', 'desc')
          .get()

        const ratings = ratingsResult.data || []

        // 计算每个菜品的平均分和评分分布
        const dishStats = {}
        ratings.forEach(r => {
          if (!dishStats[r.dishName]) {
            dishStats[r.dishName] = { total: 0, sum: 0, countByScore: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }
          }
          dishStats[r.dishName].total++
          dishStats[r.dishName].sum += r.score
          dishStats[r.dishName].countByScore[r.score]++
        })

        // 获取当前用户已打分的菜品列表
        const userRatings = ratings.filter(r => r.openid === openid)
        const ratedDishNames = userRatings.map(r => r.dishName)

        const dishRatings = Object.keys(dishStats).map(dishName => {
          const stats = dishStats[dishName]
          return {
            dishName,
            averageScore: Math.round((stats.sum / stats.total) * 10) / 10,
            totalRaters: stats.total,
            countByScore: stats.countByScore,
            hasRated: ratedDishNames.includes(dishName)
          }
        })

        return {
          code: 0,
          message: 'ok',
          data: {
            ratings: dishRatings,
            myRatings: userRatings.map(r => ({ dishName: r.dishName, score: r.score })),
            totalRatings: ratings.length
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
