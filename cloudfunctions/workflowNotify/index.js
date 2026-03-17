// 工作流通知云函数
// 用于发送微信订阅消息通知

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const subscriptionsCollection = db.collection('workflow_subscriptions')
const _ = db.command

/**
 * 简单的时间格式化函数（专门用于订阅消息）
 * 注意：这是为微信订阅消息准备的格式化时间，不是用于前端展示
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @returns {string} 格式化后的时间字符串（YYYY-MM-DD HH:mm:ss）
 */
function formatTimeForMessage(timestamp) {
  if (!timestamp) {
    timestamp = Date.now()
  }
  
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 发送订阅消息
 */
async function sendSubscribeMessage(event) {
  console.log('=== sendSubscribeMessage 开始 ===')
  console.log('event:', JSON.stringify(event))

  const { orderId, eventType, templateData, toOpenid } = event

  if (!toOpenid) {
    console.error('缺少接收者openid')
    return {
      code: 400,
      message: '缺少接收者openid'
    }
  }

  // 查询订阅消息配置
  const subscriptionResult = await subscriptionsCollection
    .where({
      notifyType: eventType,
      status: 'active'
    })
    .limit(1)
    .get()

  if (!subscriptionResult.data || subscriptionResult.data.length === 0) {
    console.log('未找到订阅消息配置:', eventType)
    return {
      code: 404,
      message: '未找到订阅消息配置'
    }
  }

  const subscription = subscriptionResult.data[0]
  console.log('订阅配置:', subscription)

  // 获取页面路径
  let pagePath = subscription.pagePath || '/pages/index/index'
  if (orderId && pagePath.includes('?')) {
    pagePath += `&orderId=${orderId}`
  } else if (orderId) {
    pagePath += `?orderId=${orderId}`
  }

  // 构建消息数据
  const messageData = {}
  if (subscription.dataMapping) {
    Object.keys(subscription.dataMapping).forEach(key => {
      const value = templateData && templateData[key]
      if (value !== undefined) {
        messageData[key] = {
          value: String(value)
        }
      }
    })
  }

  console.log('发送消息数据:', {
    touser: toOpenid,
    templateId: subscription.templateId,
    page: pagePath,
    data: messageData
  })

  try {
    // 发送订阅消息
    const result = await cloud.openapi.subscribeMessage.send({
      touser: toOpenid,
      templateId: subscription.templateId,
      page: pagePath,
      data: messageData
    })

    console.log('订阅消息发送成功:', result)
    return {
      code: 0,
      message: '订阅消息发送成功',
      data: {
        msgId: result.msgid,
        templateId: subscription.templateId,
        eventType: eventType
      }
    }
  } catch (error) {
    console.error('订阅消息发送失败:', error)

    // 判断是否是模板ID未配置
    if (error.errCode === 40037 || error.errCode === 40003) {
      return {
        code: 400,
        message: '订阅消息模板ID未配置或已失效，请先配置模板ID',
        data: {
          error: error.errMsg,
          errCode: error.errCode
        }
      }
    }

    // 判断是否是用户未授权
    if (error.errCode === 43101) {
      return {
        code: 403,
        message: '用户未授权接收订阅消息',
        data: {
          error: error.errMsg,
          errCode: error.errCode
        }
      }
    }

    return {
      code: 500,
      message: '订阅消息发送失败',
      data: {
        error: error.errMsg,
        errCode: error.errCode
      }
    }
  }
}

/**
 * 批量发送订阅消息（用于并行审批）
 */
async function sendBatchSubscribeMessages(event) {
  console.log('=== sendBatchSubscribeMessages 开始 ===')
  console.log('event:', JSON.stringify(event))

  const { messages } = event

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      code: 400,
      message: '消息列表不能为空'
    }
  }

  const results = []
  const errors = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    try {
      const result = await sendSubscribeMessage(msg)
      results.push({
        index: i,
        success: result.code === 0,
        data: result
      })

      if (result.code !== 0) {
        errors.push({
          index: i,
          openid: msg.toOpenid,
          error: result.message
        })
      }
    } catch (error) {
      results.push({
        index: i,
        success: false,
        error: error.message
      })
      errors.push({
        index: i,
        openid: msg.toOpenid,
        error: error.message
      })
    }
  }

  return {
    code: 0,
    message: `批量发送完成，成功${results.filter(r => r.success).length}条，失败${errors.length}条`,
    data: {
      total: messages.length,
      success: results.filter(r => r.success).length,
      failed: errors.length,
      results: results,
      errors: errors
    }
  }
}

/**
 * 发送任务分配通知
 */
async function sendTaskAssignedNotification(task, order) {
  console.log('=== 发送任务分配通知 ===')
  
  const templateData = {
    thing1: '审批任务',
    thing2: task.taskName || '待审批',
    phrase4: '待审批',
    time3: formatTimeForMessage(task.deadlineTime || (Date.now() + 72 * 60 * 60 * 1000))
  }

  return await sendSubscribeMessage({
    orderId: order.orderId,
    eventType: 'task_assigned',
    templateData: templateData,
    toOpenid: task.approverId
  })
}

/**
 * 发送任务完成通知
 */
async function sendTaskCompletedNotification(task, order, approvalResult) {
  console.log('=== 发送任务完成通知 ===')
  
  const templateData = {
    thing1: approvalResult === 'approved' ? '审批通过' : '审批驳回',
    thing2: task.comment || '无',
    phrase4: approvalResult === 'approved' ? '已完成' : '已驳回',
    time3: formatTimeForMessage(task.completedTime || Date.now())
  }

  // 发送给申请人
  return await sendSubscribeMessage({
    orderId: order.orderId,
    eventType: 'task_completed',
    templateData: templateData,
    toOpenid: order.businessData.applicantId
  })
}

/**
 * 发送任务超时通知
 */
async function sendTaskTimeoutNotification(task) {
  console.log('=== 发送任务超时通知 ===')
  
  const templateData = {
    thing1: '任务超时',
    thing2: formatTimeForMessage(task.deadlineTime || Date.now()),
    phrase4: '请及时处理',
    time3: formatTimeForMessage(Date.now())
  }

  return await sendSubscribeMessage({
    orderId: task.orderId,
    eventType: 'task_timeout',
    templateData: templateData,
    toOpenid: task.approverId
  })
}

/**
 * 发送流程退回通知
 */
async function sendProcessReturnedNotification(task, order, returnReason) {
  console.log('=== 发送流程退回通知 ===')
  
  const templateData = {
    thing1: '流程退回',
    thing2: returnReason || '请补充资料',
    phrase4: '需补充资料',
    time3: formatTimeForMessage(Date.now())
  }

  return await sendSubscribeMessage({
    orderId: order.orderId,
    eventType: 'process_returned',
    templateData: templateData,
    toOpenid: order.businessData.applicantId
  })
}

/**
 * 发送工作流完成通知
 */
async function sendWorkflowCompletedNotification(order, finalStatus) {
  console.log('=== 发送工作流完成通知 ===')
  
  const templateData = {
    thing1: finalStatus === 'approved' ? '审批通过' : '审批驳回',
    thing2: finalStatus === 'approved' ? '您的申请已通过审批' : '您的申请已被驳回',
    phrase4: finalStatus === 'approved' ? '已通过' : '已驳回',
    time3: formatTimeForMessage(Date.now())
  }

  return await sendSubscribeMessage({
    orderId: order.orderId,
    eventType: 'task_completed',
    templateData: templateData,
    toOpenid: order.businessData.applicantId
  })
}

exports.main = async (event) => {
  console.log('=== workflowNotify 云函数开始 ===')
  console.log('event:', JSON.stringify(event))

  const action = event && event.action

  try {
    if (action === 'sendMessage') {
      return await sendSubscribeMessage(event)
    }

    if (action === 'sendBatchMessages') {
      return await sendBatchSubscribeMessages(event)
    }

    if (action === 'sendTaskAssigned') {
      return await sendTaskAssignedNotification(event.task, event.order)
    }

    if (action === 'sendTaskCompleted') {
      return await sendTaskCompletedNotification(event.task, event.order, event.approvalResult)
    }

    if (action === 'sendTaskTimeout') {
      return await sendTaskTimeoutNotification(event.task)
    }

    if (action === 'sendProcessReturned') {
      return await sendProcessReturnedNotification(event.task, event.order, event.returnReason)
    }

    if (action === 'sendWorkflowCompleted') {
      return await sendWorkflowCompletedNotification(event.order, event.finalStatus)
    }

    return {
      code: 400,
      message: '不支持的操作类型'
    }
  } catch (error) {
    console.error('workflowNotify 执行失败:', error)
    return {
      code: 500,
      message: error.message || '服务异常',
      data: {
        error: error.stack
      }
    }
  }
}
