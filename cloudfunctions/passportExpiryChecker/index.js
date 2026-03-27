/**
 * 护照过期检查定时云函数
 * 
 * 功能：
 * - 每日检查所有护照的有效期
 * - 剩余有效期不足180天时，发送通知提醒用户
 * 
 * 触发方式：定时触发器（每日凌晨2点执行）
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const passportInfoCollection = db.collection('passport_info')
const notificationsCollection = db.collection('notifications')

// 过期提醒阈值（天）
const EXPIRY_WARNING_DAYS = 180

/**
 * 发送通知
 */
async function sendNotification(openid, passportInfo) {
  try {
    await notificationsCollection.add({
      data: {
        openid: openid,
        type: 'passport_expiry_warning',
        title: '护照即将到期提醒',
        content: `您的护照（护照号：${passportInfo.passportNo}，持有人：${passportInfo.ownerName}）将于 ${passportInfo.expiryDate} 到期，请及时办理续签。`,
        read: false,
        extra: {
          passportId: passportInfo._id,
          passportNo: passportInfo.passportNo,
          ownerName: passportInfo.ownerName,
          expiryDate: passportInfo.expiryDate
        },
        createdAt: Date.now()
      }
    })
    console.log(`通知发送成功：${passportInfo.ownerName} (${passportInfo.passportNo})`)
  } catch (error) {
    console.error(`通知发送失败：${passportInfo.ownerName}`, error.message)
  }
}

/**
 * 检查护照有效期
 */
async function checkPassportExpiry() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // 计算阈值日期（今天 + 180天）
  const thresholdDate = new Date(today)
  thresholdDate.setDate(thresholdDate.getDate() + EXPIRY_WARNING_DAYS)
  
  // 格式化为 YYYY-MM-DD
  const thresholdDateStr = thresholdDate.toISOString().split('T')[0]
  
  console.log(`检查日期：${today.toISOString().split('T')[0]}`)
  console.log(`阈值日期：${thresholdDateStr}（剩余 ${EXPIRY_WARNING_DAYS} 天）`)

  try {
    // 查询所有即将过期的护照（expiryDate <= 阈值日期）
    const result = await passportInfoCollection
      .where({
        expiryDate: _.lte(thresholdDateStr)
      })
      .get()

    const expiringPassports = result.data || []
    console.log(`找到 ${expiringPassports.length} 本即将过期的护照`)

    // 发送通知
    let notificationCount = 0
    for (const passport of expiringPassports) {
      // 检查今天是否已发送过通知（避免重复发送）
      const todayStart = new Date(today)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(today)
      todayEnd.setHours(23, 59, 59, 999)

      const existingNotification = await notificationsCollection
        .where({
          openid: passport.openid,
          type: 'passport_expiry_warning',
          'extra.passportId': passport._id,
          createdAt: _.gte(todayStart.getTime()).and(_.lte(todayEnd.getTime()))
        })
        .limit(1)
        .get()

      if (existingNotification.data && existingNotification.data.length > 0) {
        console.log(`跳过已通知：${passport.ownerName} (${passport.passportNo})`)
        continue
      }

      await sendNotification(passport.openid, passport)
      notificationCount++
    }

    return {
      total: expiringPassports.length,
      notified: notificationCount
    }
  } catch (error) {
    console.error('检查护照有效期失败:', error)
    throw error
  }
}

// 云函数入口
exports.main = async (event, context) => {
  const startTime = Date.now()
  
  try {
    console.log('=== 开始检查护照有效期 ===')
    
    const result = await checkPassportExpiry()
    
    const duration = Date.now() - startTime
    console.log(`=== 检查完成，耗时: ${duration}ms ===`)
    console.log(`总计：${result.total} 本，已通知：${result.notified} 本`)
    
    return {
      code: 0,
      message: '护照过期检查完成',
      data: {
        duration,
        ...result
      }
    }
  } catch (error) {
    console.error('护照过期检查失败:', error)
    return {
      code: -1,
      message: error.message || '检查失败',
      data: null
    }
  }
}