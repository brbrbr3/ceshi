/**
 * 节假日管理云函数
 * 用于管理节假日配置的 CRUD 操作
 */

const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

// 集合引用
const holidayConfigsCollection = db.collection('holiday_configs')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 获取指定年份的节假日配置
 */
async function getByYear(year) {
  const result = await holidayConfigsCollection
    .where({ year: Number(year) })
    .get()

  if (result.data && result.data.length > 0) {
    return success({
      config: result.data[0],
      exists: true
    })
  }

  return success({
    config: null,
    exists: false
  })
}

/**
 * 保存节假日配置（覆盖式更新）
 */
async function save(params, userInfo) {
  const { year, dates } = params

  if (!year || !Array.isArray(dates)) {
    return fail('参数错误', 400)
  }

  const now = Date.now()
  const openid = userInfo.openid
  const userName = userInfo.userInfo?.name || '未知用户'

  // 查询是否已存在该年份配置
  const existingResult = await holidayConfigsCollection
    .where({ year: Number(year) })
    .get()

  if (existingResult.data && existingResult.data.length > 0) {
    // 更新现有配置
    const docId = existingResult.data[0]._id
    await holidayConfigsCollection.doc(docId).update({
      data: {
        dates: dates.sort(),
        createdBy: openid,
        createdByName: userName,
        updatedAt: now
      }
    })
  } else {
    // 创建新配置
    await holidayConfigsCollection.add({
      data: {
        year: Number(year),
        dates: dates.sort(),
        createdBy: openid,
        createdByName: userName,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  return success({
    year,
    datesCount: dates.length,
    message: '保存成功'
  })
}

/**
 * 获取所有年份的节假日配置列表
 */
async function getAllYears() {
  const result = await holidayConfigsCollection
    .field({ year: true, dates: true, createdByName: true, updatedAt: true })
    .orderBy('year', 'desc')
    .get()

  return success({
    list: result.data || []
  })
}

exports.main = async (event, context) => {
  const { action, params } = event
  const wxContext = cloud.getWXContext()

  // 构建用户信息
  const userInfo = {
    openid: wxContext.OPENID,
    userInfo: event.userInfo || {}
  }

  try {
    switch (action) {
      case 'getByYear':
        return await getByYear(params.year)

      case 'save':
        return await save(params, userInfo)

      case 'getAllYears':
        return await getAllYears()

      default:
        return fail('未知操作', 400)
    }
  } catch (error) {
    console.error('holidayManager 错误:', error)
    return fail(error.message || '操作失败')
  }
}
