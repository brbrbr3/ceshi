/**
 * 护照借用管理云函数
 * 
 * 功能：
 * - submit: 提交护照借用申请
 * - getMyPassportStatus: 获取当前用户的护照借用状态
 * - getHistory: 获取护照借用历史记录
 * - getPassportInfoList: 获取用户护照信息列表
 * - addPassportInfo: 添加护照信息
 * - updatePassportInfo: 更新护照信息
 * - deletePassportInfo: 删除护照信息
 * - getApprovedList: 获取待借护照列表（管理员）
 * - borrowPassport: 管理员借出操作
 * - returnPassport: 管理员收回操作
 * - markNotReturned: 标记不再收回
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 集合引用
const workOrdersCollection = db.collection('work_orders')
const passportRecordsCollection = db.collection('passport_records')
const passportInfoCollection = db.collection('passport_info')
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
 * 提交护照借用申请
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
    throw new Error('您当前的角色无权申请护照借用')
  }

  if (user.status !== 'approved') {
    throw new Error('用户状态异常，请重新登录')
  }

  // 解析借用的护照（多个空格分隔）
  const borrowerNames = (businessData.borrowerNames || '').trim()
  if (!borrowerNames) {
    throw new Error('请填写借用的护照')
  }

  const nameList = borrowerNames.split(/\s+/).filter(name => name.trim())
  if (nameList.length === 0) {
    throw new Error('请填写借用的护照')
  }

  // 查询借用的护照 openid
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
      message: '护照借用申请提交成功'
    }, '提交成功')
  } catch (error) {
    throw new Error('提交护照借用申请失败: ' + error.message)
  }
}

/**
 * 获取当前用户的护照借用状态
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
 * 获取护照借用历史记录（分页）
 * 从 passport_records 查询用户的借用记录
 */
async function getHistory(openid, page = 1, pageSize = 20) {
  try {
    // 查询用户的护照借用记录
    const countRes = await passportRecordsCollection.where({
      applicantId: openid
    }).count()

    const dataRes = await passportRecordsCollection.where({
      applicantId: openid
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
 * 获取用户护照信息列表
 */
async function getPassportInfoList(openid, page = 1, pageSize = 20) {
  try {
    const countRes = await passportInfoCollection.where({ openid }).count()
    const dataRes = await passportInfoCollection.where({ openid })
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
  } catch (error) {
    throw new Error('获取护照信息失败: ' + error.message)
  }
}

/**
 * 添加护照信息
 */
async function addPassportInfo(openid, passportData) {
  const { ownerName, gender, passportNo, issueDate, expiryDate } = passportData

  // 验证必填字段
  if (!ownerName || !gender || !passportNo || !issueDate || !expiryDate) {
    throw new Error('请填写完整的护照信息')
  }

  // 验证性别
  if (!['男', '女'].includes(gender)) {
    throw new Error('性别只能为"男"或"女"')
  }

  // 验证日期格式（YYYY-MM-DD）
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(issueDate) || !dateRegex.test(expiryDate)) {
    throw new Error('日期格式不正确，应为 YYYY-MM-DD')
  }

  const now = Date.now()

  try {
    const result = await passportInfoCollection.add({
      data: {
        openid,
        ownerName: ownerName.trim(),
        gender,
        passportNo: passportNo.trim(),
        issueDate,
        expiryDate,
        createdAt: now,
        updatedAt: now
      }
    })

    return success({
      _id: result._id,
      message: '添加成功'
    }, '添加成功')
  } catch (error) {
    throw new Error('添加护照信息失败: ' + error.message)
  }
}

/**
 * 更新护照信息
 */
async function updatePassportInfo(openid, passportId, passportData) {
  const { ownerName, gender, passportNo, issueDate, expiryDate } = passportData

  // 验证必填字段
  if (!ownerName || !gender || !passportNo || !issueDate || !expiryDate) {
    throw new Error('请填写完整的护照信息')
  }

  // 验证性别
  if (!['男', '女'].includes(gender)) {
    throw new Error('性别只能为"男"或"女"')
  }

  // 验证日期格式（YYYY-MM-DD）
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(issueDate) || !dateRegex.test(expiryDate)) {
    throw new Error('日期格式不正确，应为 YYYY-MM-DD')
  }

  // 验证记录所有权
  const recordRes = await passportInfoCollection.doc(passportId).get()
  if (!recordRes.data || recordRes.data.openid !== openid) {
    throw new Error('无权修改此记录')
  }

  const now = Date.now()

  try {
    await passportInfoCollection.doc(passportId).update({
      data: {
        ownerName: ownerName.trim(),
        gender,
        passportNo: passportNo.trim(),
        issueDate,
        expiryDate,
        updatedAt: now
      }
    })

    return success({}, '更新成功')
  } catch (error) {
    throw new Error('更新护照信息失败: ' + error.message)
  }
}

/**
 * 删除护照信息
 */
async function deletePassportInfo(openid, passportId) {
  // 验证记录所有权
  const recordRes = await passportInfoCollection.doc(passportId).get()
  if (!recordRes.data || recordRes.data.openid !== openid) {
    throw new Error('无权删除此记录')
  }

  try {
    await passportInfoCollection.doc(passportId).remove()
    return success({}, '删除成功')
  } catch (error) {
    throw new Error('删除护照信息失败: ' + error.message)
  }
}

/**
 * 获取待借护照列表（管理员）
 */
async function getApprovedList(openid, page = 1, pageSize = 20) {
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
      status: 'approved'
    }).count()

    const dataRes = await passportRecordsCollection.where({
      status: 'approved'
    })
    .orderBy('createdAt', 'desc')
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
    throw new Error('获取待借列表失败: ' + error.message)
  }
}

/**
 * 管理员借出护照
 */
async function borrowPassport(openid, recordId) {
  // 验证管理员权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  if (!user.isAdmin && user.role !== '管理员') {
    throw new Error('无权执行此操作，仅管理员可借出护照')
  }

  // 查询护照记录
  const recordRes = await passportRecordsCollection.doc(recordId).get()
  if (!recordRes.data || recordRes.data.status !== 'approved') {
    throw new Error('未找到对应的待借记录')
  }

  const now = Date.now()

  // 更新护照记录状态（工作流已结束，只更新 passport_records）
  await passportRecordsCollection.doc(recordId).update({
    data: {
      status: 'borrowed',
      borrowedAt: now,
      borrowedBy: openid,
      borrowedByName: user.name,
      updatedAt: now
    }
  })

  return success({}, '借出成功')
}

/**
 * 管理员收回护照
 */
async function returnPassport(openid, recordId) {
  // 验证管理员权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  if (!user.isAdmin && user.role !== '管理员') {
    throw new Error('无权执行此操作，仅管理员可收回护照')
  }

  // 查询护照记录
  const recordRes = await passportRecordsCollection.doc(recordId).get()
  if (!recordRes.data || recordRes.data.status !== 'borrowed') {
    throw new Error('未找到对应的在借记录')
  }

  const now = Date.now()

  // 更新护照记录状态（工作流已结束，只更新 passport_records）
  await passportRecordsCollection.doc(recordId).update({
    data: {
      status: 'returned',
      returnedAt: now,
      returnedBy: openid,
      returnedByName: user.name,
      updatedAt: now
    }
  })

  return success({}, '收回成功')
}

/**
 * 标记不再收回
 */
async function markNotReturned(openid, recordId) {
  // 验证管理员权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  if (!user.isAdmin && user.role !== '管理员') {
    throw new Error('无权执行此操作，仅管理员可标记不再收回')
  }

  // 查询护照记录
  const recordRes = await passportRecordsCollection.doc(recordId).get()
  if (!recordRes.data || recordRes.data.status !== 'borrowed') {
    throw new Error('未找到对应的在借记录')
  }

  const now = Date.now()

  // 更新护照记录状态（工作流已结束，只更新 passport_records）
  await passportRecordsCollection.doc(recordId).update({
    data: {
      status: 'not_returned',
      returnedAt: now,
      returnedBy: openid,
      returnedByName: user.name,
      updatedAt: now
    }
  })

  return success({}, '标记成功')
}

/**
 * 获取在借护照列表（管理员）
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
      
      case 'getPassportInfoList':
        return await getPassportInfoList(openid, event.page, event.pageSize)
      
      case 'addPassportInfo':
        return await addPassportInfo(openid, event.passportData)
      
      case 'updatePassportInfo':
        return await updatePassportInfo(openid, event.passportId, event.passportData)
      
      case 'deletePassportInfo':
        return await deletePassportInfo(openid, event.passportId)
      
      case 'getApprovedList':
        return await getApprovedList(openid, event.page, event.pageSize)
      
      case 'borrowPassport':
        return await borrowPassport(openid, event.recordId)
      
      case 'returnPassport':
        return await returnPassport(openid, event.recordId)
      
      case 'markNotReturned':
        return await markNotReturned(openid, event.recordId)
      
      case 'getBorrowedList':
        return await getBorrowedList(openid, event.page, event.pageSize)
      
      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}