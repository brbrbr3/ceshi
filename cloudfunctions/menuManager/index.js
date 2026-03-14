const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const { action, menuData, menuId, commentData } = event

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
