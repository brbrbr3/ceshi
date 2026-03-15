const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const workOrdersCollection = db.collection('work_orders')
const workflowTemplatesCollection = db.collection('workflow_templates')
const usersCollection = db.collection('office_users')

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

// 提交就医申请
async function submitMedicalApplication(openid, businessData) {
  // 验证用户权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  const role = user.role || ''

  // 检查权限：物业、配偶、家属无权限
  if (role === '物业' || role === '配偶' || role === '家属') {
    throw new Error('您当前的角色无权提交就医申请')
  }

  if (user.status !== REQUEST_STATUS.APPROVED) {
    throw new Error('用户状态异常，请重新登录')
  }

  // 调用工作流引擎提交工单
  try {
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'medical_application',
        businessData: {
          applicantId: openid,
          applicantName: user.name,
          applicantRole: user.role,
          patientName: businessData.patientName,
          relation: businessData.relation,
          medicalDate: businessData.medicalDate,
          institution: businessData.institution,
          otherInstitution: businessData.otherInstitution,
          reasonForSelection: businessData.reasonForSelection,
          reason: businessData.reason
        }
      }
    })

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '提交工作流工单失败')
    }

    const orderId = workflowResult.result.data.orderId
    return success({
      orderId: orderId,
      orderNo: workflowResult.result.data.orderNo,
      message: '就医申请提交成功'
    }, '提交成功')
  } catch (error) {
    throw new Error('提交就医申请失败: ' + error.message)
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  const action = event && event.action

  try {
    if (action === 'submit') {
      return await submitMedicalApplication(openid, event.businessData)
    }

    return fail('不支持的操作类型', 400)
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
