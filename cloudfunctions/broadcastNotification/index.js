const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const { title, content, type = 'menu', menuId } = event

  console.log('=== broadcastNotification 开始 ===')
  console.log('参数:', { title, content, type, menuId })

  if (!title || !content) {
    return {
      code: 400,
      message: '缺少必要参数'
    }
  }

  try {
    // 查询所有已批准的用户
    const usersResult = await db.collection('office_users')
      .where({
        status: 'approved'
      })
      .field({
        openid: true
      })
      .get()

    console.log('查询到已批准用户数:', usersResult.data.length)

    if (!usersResult.data || usersResult.data.length === 0) {
      console.log('没有找到用户')
      return {
        code: 0,
        message: '没有找到用户',
        data: { count: 0 }
      }
    }

    // 为每个用户创建通知
    const now = Date.now()
    const notifications = usersResult.data.map(user => ({
      openid: user.openid,
      type: type,
      title: title,
      content: content,
      menuId: menuId, // 添加菜单ID
      read: false,
      createdAt: now
    }))

    console.log('准备创建通知数:', notifications.length)

    // 逐个添加通知
    const results = []
    for (let i = 0; i < notifications.length; i++) {
      try {
        const result = await db.collection('notifications').add({
          data: notifications[i]
        })
        results.push(result)
        console.log(`添加通知 ${i + 1}/${notifications.length} 成功`)
      } catch (err) {
        console.error(`添加通知 ${i + 1} 失败:`, err)
        results.push({ error: err })
      }
    }

    const successCount = results.filter(r => !r.error).length
    console.log('=== broadcastNotification 完成，成功添加', successCount, '条通知 ===')

    return {
      code: 0,
      message: '广播通知成功',
      data: {
        count: successCount
      }
    }
  } catch (error) {
    console.error('广播通知失败', error)
    return {
      code: 500,
      message: error.message || '广播通知失败'
    }
  }
}
