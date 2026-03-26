/**
 * 护照领用管理云函数
 * 
 * 功能：
 * - submitApplication: 提交护照领用申请
 * - getMyPassportStatus: 获取当前用户的护照领用状态
 * - getHistory: 获取护照领用历史记录
 * - confirmReturn: 确认归还（管理员操作）
 * - getBorrowedList: 获取当前在借护照列表（管理员用）
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const workOrdersCollection = db.collection('work_orders')
const passportRecordsCollection = db.collection('passport_records')
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
 * 提交护照领用申请
 */
async function submitApplication(openid, businessData) {
  // 验证用户权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  const role = user.role || ''

  // 检查权限：仅馆领导、部门负责人、馆员、工勤、物业可使用
  const allowedRoles = ['馆领导', '部门负责人', '馆员', '工勤', '物业']
  if (!allowedRoles.includes(role)) {
    throw new Error('您当前的角色无权申请护照领用')
  }

  if (user.status !== 'approved') {
    throw new Error('用户状态异常，请重新登录')
  }

  // 解析领用人姓名（多个空格分隔）
  const borrowerNames = (businessData.borrowerNames || '').trim()
  if (!borrowerNames) {
    throw new Error('请填写领用人姓名')
  }

  const nameList = borrowerNames.split(/\s+/).filter(name => name.trim())
  if (nameList.length === 0) {
    throw new Error('请填写领用人姓名')
  }

  // 查询领用人 openid
  const borrowerOpenids = []
  const borrowerInfoList = []
  
  for (const name of nameList) {
    const borrowerRes = await usersCollection.where({
      name: name.trim(),
      status: 'approved'
    }).limit(1).get()
    
    if (borrowerRes.data && borrowerRes.data.length > 0) {
      borrowerOpenids.push(borrowerRes.data[0].openid)
      borrowerInfoList.push({
        name: name.trim(),
        openid: borrowerRes.data[0].openid
      })
    } else {
      // 如果找不到对应用户，记录姓名但不记录 openid
      borrowerInfoList.push({
        name: name.trim(),
        openid: null
      })
    }
  }

  // 调用工作流引擎提交工单
  try {
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'passport_application',
        businessData: {
          applicantId: openid,
          applicantName: user.name,
          applicantRole: user.role,
          borrowerNames: nameList,
          borrowerOpenids: borrowerOpenids,
          borrowerInfoList: borrowerInfoList,
          borrowDate: businessData.borrowDate || new Date().toISOString().split('T')[0],
          expectedReturnDate: businessData.expectedReturnDate || '',
          reason: businessData.reason
        }
      }
    })

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '提交工作流工单失败')
    }

    return success({
      orderId: workflowResult.result.data.orderId,
      orderNo: workflowResult.result.data.orderNo,
      message: '护照领用申请提交成功'
    }, '提交成功')
  } catch (error) {
    throw new Error('提交护照领用申请失败: ' + error.message)
  }
}

/**
 * 获取当前用户的护照领用状态
 * 返回当前是否有在借护照
 */
async function getMyPassportStatus(openid) {
  try {
    // 查询当前用户在借的护照记录
    const recordsRes = await passportRecordsCollection.where({
      borrowerOpenids: openid,
      status: 'borrowed'
    }).orderBy('borrowedAt', 'desc').limit(10).get()

    const borrowedRecords = recordsRes.data || []
    
    // 同时查询关联的工单信息
    if (borrowedRecords.length > 0) {
      const orderIds = borrowedRecords.map(r => r.orderId)
      const ordersRes = await workOrdersCollection.where({
        _id: _.in(orderIds)
      }).get()
      
      const ordersMap = {}
      ordersRes.data.forEach(order => {
        ordersMap[order._id] = order
      })
      
      borrowedRecords.forEach(record => {
        record.order = ordersMap[record.orderId] || null
      })
    }

    return success({
      hasBorrowed: borrowedRecords.length > 0,
      borrowedRecords: borrowedRecords
    })
  } catch (error) {
    throw new Error('获取护照状态失败: ' + error.message)
  }
}

/**
 * 获取护照领用历史记录（分页）
 */
async function getHistory(openid, page = 1, pageSize = 20) {
  try {
    // 查询申请人提交的护照领用工单
    const countRes = await workOrdersCollection.where({
      orderType: 'passport_application',
      'businessData.applicantId': openid
    }).count()

    const dataRes = await workOrdersCollection.where({
      orderType: 'passport_application',
      'businessData.applicantId': openid
    })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

    return success({
      list: dataRes.data,
      total: countRes.total,
      page,
      pageSize
    })
  } catch (error) {
    throw new Error('获取历史记录失败: ' + error.message)
  }
}

/**
 * 确认归还（管理员操作）
 */
async function confirmReturn(openid, orderId) {
  // 验证管理员权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  if (!user.isAdmin && user.role !== '管理员') {
    throw new Error('无权执行此操作，仅管理员可确认归还')
  }

  // 查询护照记录
  const recordRes = await passportRecordsCollection.where({
    orderId: orderId,
    status: 'borrowed'
  }).limit(1).get()

  if (!recordRes.data || recordRes.data.length === 0) {
    throw new Error('未找到对应的在借记录')
  }

  const record = recordRes.data[0]
  const now = Date.now()

  // 更新护照记录状态
  await passportRecordsCollection.doc(record._id).update({
    data: {
      status: 'returned',
      returnedAt: now,
      returnedBy: openid,
      returnedByName: user.name,
      updatedAt: now
    }
  })

  // 更新工单业务数据
  await workOrdersCollection.doc(orderId).update({
    data: {
      'businessData.returnedAt': now,
      'businessData.returnedBy': openid,
      'businessData.returnedByName': user.name,
      updatedAt: now
    }
  })

  return success({}, '归还确认成功')
}

/**
 * 获取当前在借护照列表（管理员用）
 */
async function getBorrowedList(openid, page = 1, pageSize = 20) {
  // 验证管理员权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  if (!user.isAdmin && user.role !== '管理员') {
    throw new Error('无权执行此操作')
  }

  try {
    const countRes = await passportRecordsCollection.where({
      status: 'borrowed'
    }).count()

    const dataRes = await passportRecordsCollection.where({
      status: 'borrowed'
    })
    .orderBy('borrowedAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

    // 查询关联的工单信息
    const records = dataRes.data || []
    if (records.length > 0) {
      const orderIds = records.map(r => r.orderId)
      const ordersRes = await workOrdersCollection.where({
        _id: _.in(orderIds)
      }).get()
      
      const ordersMap = {}
      ordersRes.data.forEach(order => {
        ordersMap[order._id] = order
      })
      
      records.forEach(record => {
        record.order = ordersMap[record.orderId] || null
      })
    }

    return success({
      list: records,
      total: countRes.total,
      page,
      pageSize
    })
  } catch (error) {
    throw new Error('获取在借列表失败: ' + error.message)
  }
}

/**
 * 获取所有护照记录（管理员用）
 */
async function getAllRecords(openid, page = 1, pageSize = 20, status = '') {
  // 验证管理员权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  if (!user.isAdmin && user.role !== '管理员') {
    throw new Error('无权执行此操作')
  }

  try {
    let query = {}
    if (status) {
      query.status = status
    }

    const countRes = await passportRecordsCollection.where(query).count()
    const dataRes = await passportRecordsCollection.where(query)
      .orderBy('borrowedAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    // 查询关联的工单信息
    const records = dataRes.data || []
    if (records.length > 0) {
      const orderIds = records.map(r => r.orderId)
      const ordersRes = await workOrdersCollection.where({
        _id: _.in(orderIds)
      }).get()
      
      const ordersMap = {}
      ordersRes.data.forEach(order => {
        ordersMap[order._id] = order
      })
      
      records.forEach(record => {
        record.order = ordersMap[record.orderId] || null
      })
    }

    return success({
      list: records,
      total: countRes.total,
      page,
      pageSize
    })
  } catch (error) {
    throw new Error('获取记录失败: ' + error.message)
  }
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
        return await submitApplication(openid, event.businessData)
      
      case 'getMyPassportStatus':
        return await getMyPassportStatus(openid)
      
      case 'getHistory':
        return await getHistory(openid, event.page, event.pageSize)
      
      case 'confirmReturn':
        return await confirmReturn(openid, event.orderId)
      
      case 'getBorrowedList':
        return await getBorrowedList(openid, event.page, event.pageSize)
      
      case 'getAllRecords':
        return await getAllRecords(openid, event.page, event.pageSize, event.status)
      
      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
