// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 标记通知为已读
 */
async function markAsRead(event) {
  const { notificationId } = event
  const { OPENID } = cloud.getWXContext()

  if (!notificationId) {
    return {
      success: false,
      error: '缺少通知ID'
    }
  }

  try {
    const result = await db.collection('notifications').doc(notificationId).update({
      data: {
        read: true
      }
    })

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('标记通知已读失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 标记所有通知为已读
 */
async function markAllAsRead(event) {
  const { OPENID } = cloud.getWXContext()

  try {
    const result = await db.collection('notifications')
      .where({
        openid: OPENID,
        read: false
      })
      .update({
        data: {
          read: true
        }
      })

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('标记所有通知已读失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 清空所有通知
 */
async function clearAll(event) {
  const { OPENID } = cloud.getWXContext()

  try {
    const result = await db.collection('notifications')
      .where({
        openid: OPENID
      })
      .remove()

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('清空通知失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action } = event

  switch (action) {
    case 'markAsRead':
      return await markAsRead(event)
    case 'markAllAsRead':
      return await markAllAsRead(event)
    case 'clearAll':
      return await clearAll(event)
    default:
      return {
        success: false,
        error: '未知操作'
      }
  }
}
