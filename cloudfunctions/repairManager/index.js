/**
 * 物业报修管理云函数
 *
 * 功能：
 * - submit: 提交报修
 * - getMyList: 获取我的报修记录（分页）
 * - getAllList: 获取全部报修记录（分页，仅物业角色）
 * - complete: 标记维修完成（仅物业角色）
 * - getHistoryAddresses: 获取历史地址列表
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 集合引用
const repairOrdersCollection = db.collection('repair_orders')
const usersCollection = db.collection('office_users')

// 统一返回格式
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
 * 获取用户信息
 */
async function getUserInfo(openid) {
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }
  return userResult.data[0]
}

/**
 * 检查是否为物业角色
 */
async function checkPropertyRole(user) {
  if (user.role === '物业') {
    return true
  }
  return false
}

/**
 * 提交报修
 */
async function submitRepair(openid, repairData) {
  const { livingArea, address, content, images } = repairData

  // 验证必填字段
  if (!livingArea) {
    throw new Error('请选择居住区')
  }
  if (!address || !address.trim()) {
    throw new Error('请填写地址')
  }
  if (!content || !content.trim()) {
    throw new Error('请填写报修内容')
  }
  if (images && images.length > 3) {
    throw new Error('最多上传3张图片')
  }

  // 获取用户信息
  const user = await getUserInfo(openid)

  const now = Date.now()

  // 创建报修记录
  const result = await repairOrdersCollection.add({
    data: {
      openid,
      reporterName: user.name || '',
      reporterDepartment: user.department || '',
      livingArea,
      address: address.trim(),
      content: content.trim(),
      images: images || [],
      status: 'pending',
      completedAt: null,
      completedByName: null,
      createdAt: now,
      updatedAt: now
    }
  })

  return success({
    _id: result._id
  }, '报修提交成功')
}

/**
 * 获取我的报修记录（分页）
 */
async function getMyList(openid, page = 1, pageSize = 20) {
  const countRes = await repairOrdersCollection
    .where({ openid })
    .count()

  const dataRes = await repairOrdersCollection
    .where({ openid })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return success({
    list: dataRes.data || [],
    total: countRes.total,
    page,
    pageSize
  })
}

/**
 * 获取全部报修记录（物业角色，分页+筛选）
 */
async function getAllList(openid, params = {}) {
  const { page = 1, pageSize = 20, livingArea } = params

  // 验证物业角色权限
  const user = await getUserInfo(openid)
  const isProperty = await checkPropertyRole(user)
  if (!isProperty) {
    throw new Error('仅物业角色可查看全部报修记录')
  }

  // 构建查询条件
  const whereCondition = {}
  if (livingArea) {
    whereCondition.livingArea = livingArea
  }

  const countRes = await repairOrdersCollection
    .where(whereCondition)
    .count()

  const dataRes = await repairOrdersCollection
    .where(whereCondition)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return success({
    list: dataRes.data || [],
    total: countRes.total,
    page,
    pageSize
  })
}

/**
 * 标记维修完成（仅物业角色）
 */
async function completeRepair(openid, repairId) {
  if (!repairId) {
    throw new Error('缺少报修记录ID')
  }

  // 验证物业角色权限
  const user = await getUserInfo(openid)
  const isProperty = await checkPropertyRole(user)
  if (!isProperty) {
    throw new Error('仅物业角色可操作')
  }

  // 获取报修记录
  const repairRes = await repairOrdersCollection.doc(repairId).get()
  if (!repairRes.data) {
    throw new Error('报修记录不存在')
  }

  if (repairRes.data.status === 'completed') {
    throw new Error('该报修已完成维修')
  }

  const now = Date.now()

  await repairOrdersCollection.doc(repairId).update({
    data: {
      status: 'completed',
      completedAt: now,
      completedByName: user.name || '',
      updatedAt: now
    }
  })

  return success({}, '已标记维修完成')
}

/**
 * 获取历史地址列表（用于地址自动填充）
 */
async function getHistoryAddresses(openid) {
  const result = await repairOrdersCollection
    .where({ openid })
    .field({ address: true })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get()

  // 去重
  const addressSet = new Set()
  const addresses = []
  ;(result.data || []).forEach(item => {
    if (item.address && !addressSet.has(item.address)) {
      addressSet.add(item.address)
      addresses.push(item.address)
    }
  })

  return success({ addresses })
}

// 云函数入口
exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  const action = event && event.action

  try {
    switch (action) {
      case 'submit':
        return await submitRepair(openid, event.repairData)

      case 'getMyList':
        return await getMyList(openid, event.page, event.pageSize)

      case 'getAllList':
        return await getAllList(openid, event.params)

      case 'complete':
        return await completeRepair(openid, event.repairId)

      case 'getHistoryAddresses':
        return await getHistoryAddresses(openid)

      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    console.error('repairManager操作失败:', error)
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
