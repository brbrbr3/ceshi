const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('office_users')
const requestCollection = db.collection('office_registration_requests')
const workOrdersCollection = db.collection('work_orders')
const workflowTasksCollection = db.collection('workflow_tasks')
const workflowLogsCollection = db.collection('workflow_logs')
const ROLE_OPTIONS = ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
const GENDER_OPTIONS = ['男', '女']
const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
}

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

function formatUserRecord(record) {
  if (!record) {
    return null
  }

  return {
    _id: record._id,
    openid: record.openid,
    name: record.name,
    gender: record.gender,
    birthday: record.birthday,
    role: record.role,
    isAdmin: !!record.isAdmin,
    status: record.status,
    avatarText: record.avatarText || (record.name ? record.name.slice(0, 1) : '智'),
    approvedAt: record.approvedAt || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    relativeName: record.relativeName || '',
    position: record.position || '无'
  }
}

function formatRequestRecord(record) {
  if (!record) {
    return null
  }

  return {
    _id: record._id,
    openid: record.openid,
    requestNo: record.requestNo,
    name: record.name,
    gender: record.gender,
    birthday: record.birthday,
    role: record.role,
    isAdmin: !!record.isAdmin,
    status: record.status,
    avatarText: record.avatarText || (record.name ? record.name.slice(0, 1) : '智'),
    reviewRemark: record.reviewRemark || '',
    submittedAt: record.submittedAt || record.createdAt || null,
    updatedAt: record.updatedAt || null,
    reviewedAt: record.reviewedAt || null,
    reviewedBy: record.reviewedBy || '',
    relativeName: record.relativeName || '',
    position: record.position || '无'
  }
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value === 'true'
  }
  return !!value
}

const POSITION_OPTIONS = ['无', '会计主管', '会计', '招待员', '厨师']

function validateForm(formData) {
  const payload = formData || {}
  const name = String(payload.name || '').trim()
  const gender = String(payload.gender || '').trim()
  const birthday = String(payload.birthday || '').trim()
  const role = String(payload.role || '').trim()
  const isAdmin = normalizeBoolean(payload.isAdmin)
  const relativeName = String(payload.relativeName || '').trim()
  const position = String(payload.position || '无').trim()

  if (!name) {
    throw new Error('请输入姓名')
  }

  if (!GENDER_OPTIONS.includes(gender)) {
    throw new Error('请选择性别')
  }

  if (!birthday) {
    throw new Error('请选择出生日期')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    throw new Error('出生日期格式不正确')
  }

  if (!ROLE_OPTIONS.includes(role)) {
    throw new Error('请选择角色')
  }

  if ((role === '配偶' || role === '家属') && !relativeName) {
    throw new Error('请填写亲属姓名')
  }

  if (position && !POSITION_OPTIONS.includes(position)) {
    throw new Error('请选择有效的岗位')
  }

  return {
    name,
    gender,
    birthday,
    role,
    isAdmin,
    relativeName: (role === '配偶' || role === '家属') ? relativeName : '',
    position: position || '无',
    avatarText: name.slice(0, 1)
  }
}

function createRequestNo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `REG${year}${month}${date}${suffix}`
}

async function findUserByOpenId(openid) {
  const result = await usersCollection.where({ openid }).limit(1).get()
  return result.data[0] || null
}

async function findRequestByOpenId(openid) {
  const result = await requestCollection.where({ openid }).limit(1).get()
  return result.data[0] || null
}

async function ensureAdminUser(openid) {
  const userRecord = await findUserByOpenId(openid)
  if (!userRecord || userRecord.status !== REQUEST_STATUS.APPROVED || !userRecord.isAdmin) {
    throw new Error('仅管理员可执行此操作')
  }
  return userRecord
}

async function checkRegistration(openid) {
  const userRecord = await findUserByOpenId(openid)

  if (userRecord && userRecord.status === REQUEST_STATUS.APPROVED) {
    return success({
      openid,
      registered: true,
      authStatus: REQUEST_STATUS.APPROVED,
      user: formatUserRecord(userRecord),
      request: null
    })
  }

  const orderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid,
      orderType: 'user_registration'
    })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  if (orderResult.data && orderResult.data.length > 0) {
    const order = orderResult.data[0]

    if (order.workflowStatus === 'completed' || order.workflowStatus === 'rejected') {

      if (order.workflowStatus === 'completed') {
        // 审批通过，创建或更新用户记录
        const businessData = order.businessData || {}
        const existingUser = await findUserByOpenId(openid)
        const now = Date.now()

        const userPayload = {
          openid: openid,
          name: businessData.applicantName || '',
          gender: businessData.gender || '',
          birthday: businessData.birthday || '',
          role: businessData.role || '馆员',
          isAdmin: !!businessData.isAdmin,
          avatarText: businessData.avatarText || '',
          relativeName: businessData.relativeName || '',
          position: businessData.position || '无',
          status: REQUEST_STATUS.APPROVED,
          sourceOrderId: order.orderId,
          approvedAt: now,
          approvedBy: order.updatedBy || '',
          createdAt: existingUser ? (existingUser.createdAt || now) : now,
          updatedAt: now
        }

        if (existingUser) {
          await usersCollection.doc(existingUser._id).update({ data: userPayload })
        } else {
          await usersCollection.add({ data: userPayload })
        }

        // 更新旧申请表
        const existingRequest = await findRequestByOpenId(openid)
        if (existingRequest) {
          await requestCollection.doc(existingRequest._id).update({
            data: {
              status: REQUEST_STATUS.APPROVED,
              reviewedAt: now,
              reviewedBy: order.updatedBy || '',
              updatedAt: now
            }
          })
        }

        const updatedUser = await findUserByOpenId(openid)
        return success({
          openid,
          registered: true,
          authStatus: REQUEST_STATUS.APPROVED,
          user: formatUserRecord(updatedUser),
          request: null
        })
      } else {
        // 审批驳回
        const existingRequest = await findRequestByOpenId(openid)
        if (existingRequest) {
          await requestCollection.doc(existingRequest._id).update({
            data: {
              status: REQUEST_STATUS.REJECTED,
              reviewRemark: '管理员已驳回该申请',
              reviewedAt: order.updatedAt || Date.now(),
              reviewedBy: '管理员',
              updatedAt: Date.now()
            }
          })
        }

        // 获取驳回原因（从任务日志中）
        const taskResult = await workflowTasksCollection
          .where({
            orderId: order._id,
            taskStatus: 'rejected'
          })
          .limit(1)
          .get()

        const reviewRemark = taskResult.data && taskResult.data.length > 0
          ? (taskResult.data[0].comment || '管理员已驳回该申请')
          : '管理员已驳回该申请'

        // 从工单业务数据中获取申请信息，用于重新申请时回填
        const businessData = order.businessData || {}

        return success({
          openid,
          registered: false,
          authStatus: REQUEST_STATUS.REJECTED,
          user: null,
          request: {
            _id: order._id,
            openid: openid,
            status: REQUEST_STATUS.REJECTED,
            reviewRemark: reviewRemark,
            name: businessData.applicantName || '',
            gender: businessData.gender || '',
            birthday: businessData.birthday || '',
            role: businessData.role || '',
            isAdmin: !!businessData.isAdmin,
            relativeName: businessData.relativeName || '',
            position: businessData.position || '无'
          }
        })
      }
    }

    // 工单进行中，返回待审核状态
    return success({
      openid,
      registered: false,
      authStatus: REQUEST_STATUS.PENDING,
      user: null,
      request: {
        _id: order._id,
        openid: openid,
        status: REQUEST_STATUS.PENDING,
        submittedAt: order.createdAt
      }
    })
  }

  // 查询旧的申请表（兼容性处理）
  const requestRecord = await findRequestByOpenId(openid)

  if (requestRecord && requestRecord.status === REQUEST_STATUS.APPROVED) {
    const now = Date.now()
    const userPayload = {
      openid: requestRecord.openid,
      name: requestRecord.name,
      gender: requestRecord.gender,
      birthday: requestRecord.birthday,
      role: requestRecord.role,
      isAdmin: !!requestRecord.isAdmin,
      avatarText: requestRecord.avatarText || (requestRecord.name ? requestRecord.name.slice(0, 1) : '智'),
      relativeName: requestRecord.relativeName || '',
      position: requestRecord.position || '无',
      status: REQUEST_STATUS.APPROVED,
      sourceRequestId: requestRecord._id,
      approvedAt: now,
      approvedBy: requestRecord.reviewedBy || '',
      createdAt: now,
      updatedAt: now
    }

    try {
      await usersCollection.add({ data: userPayload })
      return success({
        openid,
        registered: true,
        authStatus: REQUEST_STATUS.APPROVED,
        user: formatUserRecord(userPayload),
        request: formatRequestRecord(requestRecord)
      })
    } catch (e) {
      return success({
        openid,
        registered: true,
        authStatus: REQUEST_STATUS.APPROVED,
        user: formatUserRecord(requestRecord),
        request: formatRequestRecord(requestRecord)
      })
    }
  }

  if (requestRecord) {
    return success({
      openid,
      registered: false,
      authStatus: requestRecord.status,
      user: null,
      request: formatRequestRecord(requestRecord)
    })
  }

  return success({
    openid,
    registered: false,
    authStatus: 'unregistered',
    user: null,
    request: null
  })
}

async function submitRegistration(openid, formData) {
  const form = validateForm(formData)
  const existingUser = await findUserByOpenId(openid)
  if (existingUser && existingUser.status === REQUEST_STATUS.APPROVED) {
    return success({
      openid,
      authStatus: REQUEST_STATUS.APPROVED,
      request: null,
      user: formatUserRecord(existingUser)
    }, '您已完成注册')
  }

  // 检查是否已有待审批的工单
  const existingOrderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid,
      orderType: 'user_registration',
      status: 'in_progress'
    })
    .limit(1)
    .get()

  if (existingOrderResult.data && existingOrderResult.data.length > 0) {
    const existingOrder = existingOrderResult.data[0]
    return fail('您的注册申请正在审核中，请勿重复提交', 409, {
      authStatus: REQUEST_STATUS.PENDING,
      orderId: existingOrder.orderId,
      request: {
        _id: existingOrder.orderId,
        openid: openid,
        status: REQUEST_STATUS.PENDING,
        submittedAt: existingOrder.createTime
      }
    })
  }

  // 调用工作流引擎提交工单
  try {
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'user_registration',
        businessData: {
          applicantId: openid,
          applicantName: form.name,
          gender: form.gender,
          birthday: form.birthday,
          role: form.role,
          isAdmin: form.isAdmin,
          avatarText: form.avatarText,
          relativeName: form.relativeName || '',
          position: form.position || '无',
          phone: formData.phone || '',
          email: formData.email || '',
          applyReason: formData.applyReason || '申请注册系统'
        }
      }
    })

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '提交工作流工单失败')
    }

    const orderId = workflowResult.result.data.orderId

    // 更新旧申请表的数据，保持兼容性
    const existingRequest = await findRequestByOpenId(openid)
    const now = Date.now()
    const requestPayload = {
      openid,
      name: form.name,
      gender: form.gender,
      birthday: form.birthday,
      role: form.role,
      isAdmin: form.isAdmin,
      avatarText: form.avatarText,
      relativeName: form.relativeName || '',
      position: form.position || '无',
      status: REQUEST_STATUS.PENDING,
      reviewRemark: '',
      reviewedAt: null,
      reviewedBy: '',
      updatedAt: now,
      submittedAt: now,
      source: 'workflow',
      orderId: orderId // 关联工作流工单ID
    }

    if (existingRequest) {
      await requestCollection.doc(existingRequest._id).update({
        data: Object.assign({}, requestPayload, {
          requestNo: existingRequest.requestNo || createRequestNo(),
          createdAt: existingRequest.createdAt || now
        })
      })
    } else {
      const createPayload = Object.assign({}, requestPayload, {
        requestNo: createRequestNo(),
        createdAt: now
      })
      await requestCollection.add({ data: createPayload })
    }

    return success({
      openid,
      authStatus: REQUEST_STATUS.PENDING,
      orderId: orderId,
      request: {
        _id: orderId,
        openid: openid,
        name: form.name,
        role: form.role,
        relativeName: form.relativeName || '',
        position: form.position || '无',
        status: REQUEST_STATUS.PENDING,
        submittedAt: now
      },
      user: null
    }, '注册申请已提交')
  } catch (error) {
    throw new Error('提交工作流工单失败: ' + error.message)
  }
}

async function getApprovalData(openid) {
  const currentUser = await findUserByOpenId(openid)
  
  // 权限判断：馆领导、部门负责人、管理员可以审批
  const canReview = !!(currentUser && 
    currentUser.status === REQUEST_STATUS.APPROVED && 
    (currentUser.isAdmin || currentUser.role === '馆领导' || currentUser.role === '部门负责人'))

  // 查询我的工单（包括注册申请和就医申请）
  const myOrderResult = await workOrdersCollection
    .where({
      'businessData.applicantId': openid,
      orderType: _.in(['user_registration', 'medical_application'])
    })
    .orderBy('createdAt', 'desc')
    .get()

  // 查询当前用户的待审批任务，用于判断是否是当前步骤的审批人
  let userTaskMap = {}
  if (canReview) {
    const userTasksResult = await workflowTasksCollection
      .where({
        approverId: openid,
        taskStatus: 'pending'
      })
      .get()

    if (userTasksResult.data) {
      userTasksResult.data.forEach(task => {
        userTaskMap[task.orderId] = {
          taskId: task._id,
          stepName: task.stepName
        }
      })
    }
  }

  // 获取已驳回工单的驳回原因（用于 mineList）
  const myRejectedOrderIds = myOrderResult.data
    ? myOrderResult.data.filter(o => o.workflowStatus === 'rejected').map(o => o._id)
    : []

  let myReviewRemarks = {}
  if (myRejectedOrderIds.length > 0) {
    const myRejectedTasks = await workflowTasksCollection
      .where({
        orderId: db.command.in(myRejectedOrderIds),
        taskStatus: 'rejected'
      })
      .get()

    myRejectedTasks.data.forEach(task => {
      myReviewRemarks[task.orderId] = task.comment || ''
    })
  }

  // 获取所有已完成工单的审批信息（从工作流日志中，用于 mineList）
  const allMyOrderIds = myOrderResult.data ? myOrderResult.data.map(o => o._id) : []

  let myApprovalInfo = {}
  if (allMyOrderIds.length > 0) {
    const myLogsResult = await workflowLogsCollection
      .where({
        orderId: db.command.in(allMyOrderIds),
        action: db.command.in(['approve', 'reject'])
      })
      .orderBy('createdAt', 'desc')
      .get()

    // 获取所有审批人的 openid，批量查询用户信息
    const myApproverOpenids = myLogsResult.data
      .map(log => log.operatorId)
      .filter(id => id && id !== 'system')

    let myUsersMap = {}
    if (myApproverOpenids.length > 0) {
      const myUsersResult = await usersCollection
        .where({
          openid: db.command.in(myApproverOpenids)
        })
        .get()

      myUsersResult.data.forEach(user => {
        myUsersMap[user.openid] = user.name
      })
    }

    // 使用 Map 记录每个工单的最新审批信息
    const myLastApprovalMap = {}
    myLogsResult.data.forEach(log => {
      if (!myLastApprovalMap[log.orderId]) {
        let finalApproverName = log.operatorName
        if (!finalApproverName || finalApproverName === '管理员' || finalApproverName === '审批人') {
          finalApproverName = myUsersMap[log.operatorId] || '管理员'
        }
        myLastApprovalMap[log.orderId] = {
          reviewedBy: finalApproverName,
          reviewedAt: log.createdAt
        }
      }
    })

    myApprovalInfo = myLastApprovalMap
  }

  const mineList = myOrderResult.data ? myOrderResult.data.map(order => {
    // 判断当前用户是否是当前步骤的审批人
    const isCurrentApprover = canReview && userTaskMap[order._id] ? true : false

    // 根据订单类型返回不同的字段
    if (order.orderType === 'medical_application') {
      // 就医申请
      const orderStatus = order.workflowStatus === 'completed' ? REQUEST_STATUS.APPROVED : (order.workflowStatus === 'rejected' ? REQUEST_STATUS.REJECTED : REQUEST_STATUS.PENDING)
      const approvalInfo = myApprovalInfo[order._id] || { reviewedBy: '', reviewedAt: order.updatedAt }
      return {
        _id: order._id,
        openid: order.businessData.applicantId,
        name: order.businessData.applicantName,
        role: order.businessData.applicantRole,
        patientName: order.businessData.patientName,
        relation: order.businessData.relation,
        medicalDate: order.businessData.medicalDate,
        institution: order.businessData.institution,
        otherInstitution: order.businessData.otherInstitution,
        reasonForSelection: order.businessData.reasonForSelection,
        reason: order.businessData.reason,
        avatarText: order.businessData.applicantName ? order.businessData.applicantName.slice(0, 1) : '就',
        status: orderStatus,
        reviewRemark: myReviewRemarks[order._id] || '',
        submittedAt: order.createdAt,
        reviewedAt: approvalInfo.reviewedAt,
        reviewedBy: approvalInfo.reviewedBy,
        updatedAt: order.updatedAt,
        orderType: 'medical_application',
        currentStep: order.currentStep,
        orderNo: order.orderNo,
        taskId: isCurrentApprover ? userTaskMap[order._id].taskId : null,
        isCurrentApprover: isCurrentApprover
      }
    } else {
      // 注册申请
      const orderStatus = order.workflowStatus === 'completed' ? REQUEST_STATUS.APPROVED : (order.workflowStatus === 'rejected' ? REQUEST_STATUS.REJECTED : REQUEST_STATUS.PENDING)
      const approvalInfo = myApprovalInfo[order._id] || { reviewedBy: '', reviewedAt: order.updatedAt }
      return {
        _id: order._id,
        openid: order.businessData.applicantId,
        name: order.businessData.applicantName,
        gender: order.businessData.gender,
        birthday: order.businessData.birthday,
        role: order.businessData.role,
        relativeName: order.businessData.relativeName || '',
        position: order.businessData.position || '无',
        isAdmin: order.businessData.isAdmin,
        avatarText: order.businessData.avatarText,
        status: orderStatus,
        reviewRemark: myReviewRemarks[order._id] || '',
        submittedAt: order.createdAt,
        reviewedAt: approvalInfo.reviewedAt,
        reviewedBy: approvalInfo.reviewedBy,
        updatedAt: order.updatedAt,
        orderType: 'user_registration',
        orderNo: order.orderNo,
        taskId: isCurrentApprover ? userTaskMap[order._id].taskId : null,
        isCurrentApprover: isCurrentApprover
      }
    }
  }) : []

  // 管理员/馆领导/部门负责人查询所有待审批工单
  let pendingList = []
  let doneList = []

  if (canReview) {
    // 查询待审批的任务（包括直接分配给用户和角色审批的任务）
    const pendingTasksResult = await workflowTasksCollection
      .where(
        _.or([
          { approverId: openid },
          { approverType: 'role' }
        ])
      )
      .where({ taskStatus: 'pending' })
      .orderBy('assignedAt', 'desc')
      .get()

    if (pendingTasksResult.data) {
      const orderIds = pendingTasksResult.data.map(task => task.orderId)

      // 批量查询工单详情
      if (orderIds.length > 0) {
        const ordersResult = await workOrdersCollection
          .where({
            _id: db.command.in(orderIds)
          })
          .get()

        const ordersMap = {}
        if (ordersResult.data) {
          ordersResult.data.forEach(order => {
            ordersMap[order._id] = order
          })
        }

        // 过滤：根据角色和岗位显示相应的审批任务
        pendingList = pendingTasksResult.data.filter(task => {
          // 获取对应的工单信息
          const order = ordersMap[task.orderId]
          if (!order) {
            return false
          }

          // 直接分配的任务总是显示
          if (task.approverId === openid) {
            return true
          }

          // 角色审批任务：根据任务步骤名称、订单类型和用户的角色/岗位判断
          if (task.approverType === 'role' && currentUser) {
            // 注册申请：只有管理员可以审批
            if (order.orderType === 'user_registration') {
              return currentUser.isAdmin === true
            }

            // 就医申请：根据步骤名称和角色/岗位判断
            if (order.orderType === 'medical_application') {
              // 部门负责人审批
              if (task.stepName === '部门负责人审批' && currentUser.role === '部门负责人') {
                return true
              }
              // 会计主管审批（按岗位）
              if (task.stepName === '会计主管审批' && currentUser.position === '会计主管') {
                return true
              }
              // 馆领导审批
              if (task.stepName === '馆领导审批' && currentUser.role === '馆领导') {
                return true
              }
              // 管理员审批（管理员可以看到所有就医申请的任务）
              if (currentUser.isAdmin) {
                return true
              }
            }
          }
          return false
        }).map(task => {
          const order = ordersMap[task.orderId]
          
          // 根据订单类型返回不同的字段
          if (order && order.orderType === 'medical_application') {
            // 就医申请
            const name = order.businessData.applicantName || ''
            return {
              _id: task._id,
              orderId: task.orderId,
              openid: order ? order.businessData.applicantId : '',
              name: name,
              role: order ? order.businessData.applicantRole : '',
              patientName: order ? order.businessData.patientName : '',
              relation: order ? order.businessData.relation : '',
              medicalDate: order ? order.businessData.medicalDate : '',
              institution: order ? order.businessData.institution : '',
              otherInstitution: order ? order.businessData.otherInstitution : '',
              reasonForSelection: order ? order.businessData.reasonForSelection : '',
              reason: order ? order.businessData.reason : '',
              avatarText: name ? name.slice(0, 1) : '就',
              status: REQUEST_STATUS.PENDING,
              submittedAt: order ? order.createdAt : null,
              taskId: task._id,
              taskName: task.stepName,
              updatedAt: order ? order.updatedAt : null,
              orderType: 'medical_application',
              currentStep: order ? order.currentStep : 1,
              orderNo: order ? order.orderNo : ''
            }
          } else {
            // 注册申请
            const name = order ? order.businessData.applicantName : ''
            return {
              _id: task._id,
              orderId: task.orderId,
              openid: order ? order.businessData.applicantId : '',
              name: name,
              gender: order ? order.businessData.gender : '',
              birthday: order ? order.businessData.birthday : '',
              role: order ? order.businessData.role : '',
              relativeName: order ? (order.businessData.relativeName || '') : '',
              position: order ? (order.businessData.position || '无') : '无',
              isAdmin: order ? order.businessData.isAdmin : false,
              avatarText: order ? order.businessData.avatarText : (name ? name.slice(0, 1) : '智'),
              status: REQUEST_STATUS.PENDING,
              submittedAt: order ? order.createdAt : null,
              taskId: task._id,
              taskName: task.stepName,
              updatedAt: order ? order.updatedAt : null,
              orderType: 'user_registration',
              orderNo: order ? order.orderNo : ''
            }
          }
        })
      }
    }

    // 查询当前用户处理过的任务（包括已批准和已驳回的任务）
    const processedTasksResult = await workflowTasksCollection
      .where({
        approverId: openid,
        taskStatus: db.command.in(['approved', 'rejected'])
      })
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get()

    // 获取这些任务对应的工单ID
    let processedOrderIds = []
    if (processedTasksResult.data) {
      processedOrderIds = [...new Set(processedTasksResult.data.map(task => task.orderId))]
    }

    // 查询已完成的工单（只包括当前用户处理过的工单）
    const completedOrdersResult = await workOrdersCollection
      .where({
        _id: db.command.in(processedOrderIds),
        orderType: _.in(['user_registration', 'medical_application']),
        workflowStatus: db.command.in(['completed', 'rejected'])
      })
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get()

    // 获取已驳回工单的驳回原因
    const rejectedOrderIds = completedOrdersResult.data
      ? completedOrdersResult.data.filter(o => o.workflowStatus === 'rejected').map(o => o._id)
      : []

    let reviewRemarks = {}
    if (rejectedOrderIds.length > 0) {
      const rejectedTasks = await workflowTasksCollection
        .where({
          orderId: db.command.in(rejectedOrderIds),
          taskStatus: 'rejected'
        })
        .get()

      rejectedTasks.data.forEach(task => {
        // 只保存真正的驳回原因（用户填写的），不设置默认值
        reviewRemarks[task.orderId] = task.comment || ''
      })
    }

    // 获取所有已完成工单的审批信息（从工作流日志中）
    const allCompletedOrderIds = completedOrdersResult.data
      ? completedOrdersResult.data.map(o => o._id)
      : []

    let approvalInfo = {}
    if (allCompletedOrderIds.length > 0) {
      const logsResult = await workflowLogsCollection
        .where({
          orderId: db.command.in(allCompletedOrderIds),
          action: db.command.in(['approve', 'reject'])
        })
        .orderBy('createdAt', 'desc')  // 按时间倒序排列，最新的在前面
        .get()

      // 获取所有审批人的 openid，批量查询用户信息
      const approverOpenids = logsResult.data
        .map(log => log.operatorId)
        .filter(id => id && id !== 'system')

      let usersMap = {}
      if (approverOpenids.length > 0) {
        const usersResult = await usersCollection
          .where({
            openid: db.command.in(approverOpenids)
          })
          .get()
        
        usersResult.data.forEach(user => {
          usersMap[user.openid] = user.name
        })
      }

      // 使用 Map 记录每个工单的最新审批信息
      const lastApprovalMap = {}
      logsResult.data.forEach(log => {
        if (!lastApprovalMap[log.orderId]) {
          // 第一次遇到该工单的记录，就是最新的（因为已经按时间倒序排列）
          let finalApproverName = log.operatorName
          // 如果审批人姓名为空或只是通用词，尝试从用户表查询
          if (!finalApproverName || finalApproverName === '管理员' || finalApproverName === '审批人') {
            finalApproverName = usersMap[log.operatorId] || '管理员'
          }
          lastApprovalMap[log.orderId] = {
            reviewedBy: finalApproverName,
            reviewedAt: log.createdAt
          }
        }
      })
      
      approvalInfo = lastApprovalMap
    }

    doneList = completedOrdersResult.data ? completedOrdersResult.data.map(order => {
      const status = order.workflowStatus === 'completed' ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.REJECTED
      const info = approvalInfo[order._id] || { reviewedBy: '管理员', reviewedAt: order.updatedAt }
      
      // 根据订单类型返回不同的字段
      if (order.orderType === 'medical_application') {
        // 就医申请
        return {
          _id: order._id,
          openid: order.businessData.applicantId,
          name: order.businessData.applicantName,
          role: order.businessData.applicantRole,
          patientName: order.businessData.patientName,
          relation: order.businessData.relation,
          medicalDate: order.businessData.medicalDate,
          institution: order.businessData.institution,
          otherInstitution: order.businessData.otherInstitution,
          reasonForSelection: order.businessData.reasonForSelection,
          reason: order.businessData.reason,
          avatarText: order.businessData.applicantName ? order.businessData.applicantName.slice(0, 1) : '就',
          status: status,
          reviewRemark: reviewRemarks[order._id] || '',  // 移除默认值，只返回真正的驳回原因
          submittedAt: order.createdAt,
          reviewedAt: info.reviewedAt,
          reviewedBy: info.reviewedBy,
          orderType: 'medical_application',
          orderNo: order.orderNo
        }
      } else {
        // 注册申请
        return {
          _id: order._id,
          openid: order.businessData.applicantId,
          name: order.businessData.applicantName,
          gender: order.businessData.gender,
          birthday: order.businessData.birthday,
          role: order.businessData.role,
          relativeName: order.businessData.relativeName || '',
          position: order.businessData.position || '无',
          isAdmin: order.businessData.isAdmin,
          avatarText: order.businessData.avatarText,
          status: status,
          reviewRemark: reviewRemarks[order._id] || '',  // 移除默认值，只返回真正的驳回原因
          submittedAt: order.createdAt,
          reviewedAt: info.reviewedAt,
          reviewedBy: info.reviewedBy,
          orderType: 'user_registration',
          orderNo: order.orderNo
        }
      }
    }) : []
  }

  return success({
    canReview,
    currentUser: formatUserRecord(currentUser),
    mineList,
    pendingList,
    doneList,
    summary: {
      pendingCount: pendingList.length,
      approvedCount: doneList.filter(r => r.status === REQUEST_STATUS.APPROVED).length,
      rejectedCount: doneList.filter(r => r.status === REQUEST_STATUS.REJECTED).length
    }
  })
}

async function reviewRegistration(openid, payload) {
  const adminUser = await ensureAdminUser(openid)
  const taskId = String((payload && payload.taskId) || '').trim()
  const decision = String((payload && payload.decision) || '').trim()
  const reviewRemark = String((payload && payload.reviewRemark) || '').trim()

  if (!taskId) {
    throw new Error('缺少任务记录')
  }

  if (!['approve', 'reject'].includes(decision)) {
    throw new Error('审批动作无效')
  }

  // 查询任务
  const taskDoc = await workflowTasksCollection.doc(taskId).get()
  const taskRecord = taskDoc.data

  if (!taskRecord) {
    throw new Error('未找到任务记录')
  }

  if (taskRecord.taskStatus !== 'pending') {
    throw new Error('该任务已处理，请刷新页面')
  }

  // 调用工作流引擎进行审批
  try {
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'approveTask',
        taskId: taskId,
        approveAction: decision,  // 修复参数冲突：审批动作改为 approveAction
        comment: reviewRemark || (decision === 'approve' ? '管理员已批准该申请' : '管理员已驳回该申请'),
        operatorId: openid,  // 显式传递操作员 openid
        operatorName: adminUser.name || '管理员'
      }
    })

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '审批失败')
    }

    const resultData = workflowResult.result.data

    // 如果是单步审批且审批通过，工作流引擎会自动创建用户记录
    // 这里只需要返回审批结果
    return success({
      reviewer: formatUserRecord(adminUser),
      taskId: taskId,
      orderId: resultData.orderId,
      status: resultData.status,
      message: decision === 'approve' ? '审批通过' : '审批已驳回'
    }, decision === 'approve' ? '审批通过' : '审批已驳回')
  } catch (error) {
    throw new Error('审批失败: ' + error.message)
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const action = event && event.action

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  try {
    if (action === 'getOpenId') {
      return success({ openid }, '获取成功')
    }

    if (action === 'checkRegistration') {
      return await checkRegistration(openid)
    }

    if (action === 'submitRegistration') {
      return await submitRegistration(openid, event.formData)
    }

    if (action === 'getApprovalData') {
      return await getApprovalData(openid)
    }

    if (action === 'reviewRegistration') {
      return await reviewRegistration(openid, event)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
