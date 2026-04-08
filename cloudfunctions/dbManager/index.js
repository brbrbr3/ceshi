// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('office_users')

/**
 * 数据库管理云函数
 * action:
 *   - listCollections: 获取所有集合名称
 *   - clearCollections: 清空指定集合的数据（保留集合结构）
 */

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

function getClearKey() {
  return String(process.env.DB_CLEAR_KEY || '').trim()
}

async function assertAdmin(openid) {
  if (!openid) {
    throw new Error('获取微信身份失败，请稍后重试')
  }

  const userRes = await usersCollection.where({
    openid,
    status: 'approved',
    isAdmin: true
  }).limit(1).get()

  if (!userRes.data || userRes.data.length === 0) {
    throw new Error('仅管理员可执行此操作')
  }

  return userRes.data[0]
}

// 项目数据库集合列表（来自 .codebuddy/docs/DATABASE_COLLECTIONS_REFERENCE.md）
const DB_COLLECTIONS = [
  'announcements',
  'activities',
  'activity_registrations',
  'calendar_schedules',
  'feedback_posts',
  'feedback_replies',
  'haircut_appointments',
  'holiday_configs',
  'learning_articles',
  'medical_records',
  'meeting_room_reservations',
  'menu_comments',
  'menu_ratings',
  'menus',
  'news_articles',
  'notifications',
  'office_registration_requests',
  'office_users',
  'passport_info',
  'passport_records',
  'repair_orders',
  'permissions',
  'schedule_subscriptions',
  'sys_config',
  'trip_reports',
  'user_signatures',
  'work_orders',
  'workflow_logs',
  'workflow_tasks',
  'workflow_templates',
  'greenbook_posts',
  'greenbook_comments',
  'greenbook_likes',
  'meal_subscriptions',
  'meal_adjustments',
  'side_dish_orders',
  'side_dish_bookings',
  'car_purchase_records'
]

/**
 * 获取所有集合名称
 * 直接返回项目维护的集合列表
 */
async function listCollections() {
  try {
    return success({ collections: DB_COLLECTIONS.sort(), total: DB_COLLECTIONS.length })
  } catch (error) {
    console.error('获取集合列表失败:', error)
    return fail(error.message || '获取集合列表失败')
  }
}

/**
 * 清空指定集合的数据
 * @param {string[]} collections - 要清空的集合名称数组
 */
async function clearCollections(collections) {
  if (!collections || !Array.isArray(collections) || collections.length === 0) {
    return fail('请指定要清空的集合', 400)
  }

  const results = []
  const startTime = Date.now()

  for (const collectionName of collections) {
    try {
      // 统计该集合的文档数量
      const countRes = await db.collection(collectionName).count()
      const totalDocs = countRes.total || 0

      if (totalDocs === 0) {
        results.push({
          collection: collectionName,
          success: true,
          deletedCount: 0,
          message: '集合为空，无需清理'
        })
        continue
      }

      // 批量删除（每次最多删除100条，需要循环）
      let deletedCount = 0
      let hasMore = true

      while (hasMore) {
        const deleteRes = await db.collection(collectionName)
          .where({
            _id: _.exists(true)
          })
          .remove()

        deletedCount += deleteRes.stats.removed || 0
        hasMore = deleteRes.stats.removed === 100
      }

      results.push({
        collection: collectionName,
        success: true,
        deletedCount,
        message: `已删除 ${deletedCount} 条记录`
      })
      console.log(`集合 ${collectionName} 清理完成，删除 ${deletedCount} 条记录`)

    } catch (error) {
      console.error(`清理集合 ${collectionName} 失败:`, error)
      results.push({
        collection: collectionName,
        success: false,
        deletedCount: 0,
        message: error.message || '清理失败'
      })
    }
  }

  const duration = Date.now() - startTime
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return success({
    results,
    summary: {
      total: collections.length,
      success: successCount,
      failed: failCount
    },
    duration
  }, `清理完成：成功 ${successCount} 个，失败 ${failCount} 个`)
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, collections, clearKey } = event

  console.log(`dbManager action: ${action}`)

  try {
    await assertAdmin(openid)

    switch (action) {
      case 'listCollections':
        return await listCollections()

      case 'clearCollections':
        if (!getClearKey()) {
          return fail('未配置 DB_CLEAR_KEY，禁止执行清库操作', 500)
        }
        if (String(clearKey || '').trim() !== getClearKey()) {
          return fail('清库密钥错误', 403)
        }
        return await clearCollections(collections)

      default:
        return fail(`未知操作: ${action}`, 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常', 403)
  }
}
