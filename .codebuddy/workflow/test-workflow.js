/**
 * 工作流引擎测试脚本
 * 
 * 本文件提供完整的API测试示例，演示如何使用工作流引擎的核心功能。
 * 
 * 注意：实际使用时，需要在小程序中调用，云函数会自动获取用户的openid。
 * 
 * 测试前提：
 * 1. 已部署 workflowEngine 云函数
 * 2. 已创建5个数据库集合
 * 3. 已导入示例模板数据
 */

const testWorkflowEngine = async () => {
  console.log('===== 工作流引擎测试开始 =====\n')

  try {
    // 测试1：查询可用的工作流模板
    console.log('📋 测试1：查询可用的工作流模板')
    const templatesResult = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'getTemplates',
        page: 1,
        pageSize: 10
      }
    })
    console.log('模板列表：', templatesResult.result.data.list)
    console.log('✅ 查询模板成功\n')

    // 测试2：提交一个用户注册审批工单
    console.log('📝 测试2：提交用户注册审批工单')
    const submitResult = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'user_registration',
        businessData: {
          applicantId: 'test_user_openid',  // 实际使用时，云函数会自动获取
          applicantName: '张三',
          phone: '13800138000',
          email: 'test@example.com',
          department: '技术部',
          applyReason: '申请注册系统'
        }
      }
    })
    console.log('工单提交结果：', submitResult.result)
    const orderId = submitResult.result.data.orderId
    console.log('✅ 工单提交成功，工单ID：', orderId, '\n')

    // 测试3：查询我的待办任务
    console.log('📋 测试3：查询我的待办任务')
    const tasksResult = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'getMyTasks',
        page: 1,
        pageSize: 20
      }
    })
    console.log('待办任务列表：', tasksResult.result.data.list)
    const taskId = tasksResult.result.data.list[0]?._id
    console.log('✅ 查询待办成功\n')

    // 测试4：审批通过
    if (taskId) {
      console.log('✅ 测试4：审批通过任务')
      const approveResult = await wx.cloud.callFunction({
        name: 'workflowEngine',
        data: {
          action: 'approveTask',
          taskId: taskId,
          action: 'approve',
          comment: '审批通过，欢迎加入！'
        }
      })
      console.log('审批结果：', approveResult.result)
      console.log('✅ 审批成功\n')
    }

    // 测试5：查询我的工单
    console.log('📋 测试5：查询我的工单列表')
    const ordersResult = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'getMyOrders',
        page: 1,
        pageSize: 20
      }
    })
    console.log('工单列表：', ordersResult.result.data.list)
    console.log('✅ 查询工单成功\n')

    // 测试6：查询工单详情
    if (orderId) {
      console.log('📄 测试6：查询工单详情')
      const orderDetailResult = await wx.cloud.callFunction({
        name: 'workflowEngine',
        data: {
          action: 'getOrderDetail',
          orderId: orderId
        }
      })
      console.log('工单详情：', orderDetailResult.data)
      console.log('✅ 查询工单详情成功\n')
    }

    // 测试7：查询流程历史
    if (orderId) {
      console.log('📜 测试7：查询流程历史')
      const historyResult = await wx.cloud.callFunction({
        name: 'workflowEngine',
        data: {
          action: 'getWorkflowHistory',
          orderId: orderId
        }
      })
      console.log('流程历史：', historyResult.data)
      console.log('✅ 查询流程历史成功\n')
    }

  } catch (error) {
    console.error('❌ 测试失败：', error)
  }

  console.log('===== 工作流引擎测试结束 =====')
}

// 测试2：请假申请（多步串行 + 条件分支）
const testLeaveRequest = async () => {
  console.log('\n===== 测试请假申请流程 =====\n')

  try {
    // 提交请假申请
    console.log('📝 提交请假申请')
    const result = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'leave_request',
        businessData: {
          applicantId: 'test_user_openid',
          applicantName: '李四',
          department: '市场部',
          leaveType: '年假',
          days: 5,  // >3，会触发HR审批
          startDate: '2026-03-20',
          endDate: '2026-03-25',
          reason: '家庭事务'
        }
      }
    })
    console.log('工单提交成功，工单ID：', result.result.data.orderId)
    console.log('当前步骤：', result.result.data.currentStep)
    console.log('✅ 请假申请测试成功\n')

  } catch (error) {
    console.error('❌ 测试失败：', error)
  }
}

// 测试3：公务用车申请（并行会签）
const testCarUsage = async () => {
  console.log('\n===== 测试公务用车申请流程 =====\n')

  try {
    // 提交用车申请
    console.log('📝 提交公务用车申请')
    const result = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'car_usage',
        businessData: {
          applicantId: 'test_user_openid',
          applicantName: '王五',
          department: '技术部',
          carType: '轿车',
          startDate: '2026-03-20 09:00',
          endDate: '2026-03-20 18:00',
          route: '公司 → 客户公司 → 公司',
          purpose: '商务接待',
          passengerCount: 3
        }
      }
    })
    console.log('工单提交成功，工单ID：', result.result.data.orderId)
    console.log('当前步骤：', result.result.data.currentStep)
    console.log('是否并行审批：', result.result.data.isParallel)
    console.log('✅ 用车申请测试成功\n')

  } catch (error) {
    console.error('❌ 测试失败：', error)
  }
}

// 测试4：流程回退
const testWorkflowReturn = async () => {
  console.log('\n===== 测试流程回退功能 =====\n')

  try {
    // 首先提交一个工单
    console.log('📝 提交工单')
    const submitResult = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'leave_request',
        businessData: {
          applicantId: 'test_user_openid',
          applicantName: '赵六',
          department: '人事部',
          leaveType: '病假',
          days: 2,
          startDate: '2026-03-20',
          endDate: '2026-03-22',
          reason: '身体不适'
        }
      }
    })
    const orderId = submitResult.result.data.orderId
    console.log('工单ID：', orderId)

    // 审批人退回申请人补充资料
    console.log('↩️ 审批人退回申请人')
    const returnResult = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'returnTask',
        taskId: 'task_id_here',  // 实际使用时从待办列表获取
        returnTo: 0,  // 0表示退回到申请人
        comment: '请假理由不够详细，请补充具体病情说明'
      }
    })
    console.log('退回结果：', returnResult.result)
    console.log('✅ 流程回退测试成功\n')

  } catch (error) {
    console.error('❌ 测试失败：', error)
  }
}

// 测试5：补充资料
const testSupplementData = async () => {
  console.log('\n===== 测试补充资料功能 =====\n')

  try {
    // 申请人补充资料
    console.log('📝 申请人补充资料')
    const result = await wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'supplementData',
        orderId: 'order_id_here',  // 实际使用时从工单详情获取
        supplementData: {
          reason: '因感冒发烧，体温38.5度，医生建议休息2天',
          attachments: ['病假证明.jpg']
        }
      }
    })
    console.log('补充资料结果：', result.result)
    console.log('✅ 补充资料测试成功\n')

  } catch (error) {
    console.error('❌ 测试失败：', error)
  }
}

/**
 * 在小程序页面中使用的示例代码
 */
Page({
  /**
   * 提交工单
   */
  submitOrder: function(e) {
    const formData = e.detail.value
    
    wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'leave_request',
        businessData: formData
      }
    }).then(res => {
      if (res.result.code === 0) {
        wx.showToast({ title: '提交成功', icon: 'success' })
        // 跳转到工单详情页
        wx.navigateTo({
          url: `/pages/workflow/order-detail/order-detail?orderId=${res.result.data.orderId}`
        })
      } else {
        wx.showToast({ title: res.result.message, icon: 'none' })
      }
    }).catch(err => {
      console.error('提交失败：', err)
      wx.showToast({ title: '提交失败', icon: 'none' })
    })
  },

  /**
   * 审批任务
   */
  approveTask: function(taskId, action, comment) {
    wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'approveTask',
        taskId: taskId,
        action: action,  // 'approve' | 'reject' | 'return'
        comment: comment
      }
    }).then(res => {
      if (res.result.code === 0) {
        wx.showToast({ title: '操作成功', icon: 'success' })
        // 刷新页面
        this.onLoad()
      } else {
        wx.showToast({ title: res.result.message, icon: 'none' })
      }
    }).catch(err => {
      console.error('操作失败：', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  /**
   * 查询我的待办
   */
  loadMyTasks: function() {
    wx.showLoading({ title: '加载中...' })
    
    wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'getMyTasks',
        page: 1,
        pageSize: 20
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result.code === 0) {
        this.setData({
          taskList: res.result.data.list,
          total: res.result.data.total
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('加载失败：', err)
    })
  },

  /**
   * 查询我的工单
   */
  loadMyOrders: function() {
    wx.showLoading({ title: '加载中...' })
    
    wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'getMyOrders',
        page: 1,
        pageSize: 20
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result.code === 0) {
        this.setData({
          orderList: res.result.data.list,
          total: res.result.data.total
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('加载失败：', err)
    })
  }
})

// 导出测试函数（用于小程序云开发控制台测试）
module.exports = {
  testWorkflowEngine,
  testLeaveRequest,
  testCarUsage,
  testWorkflowReturn,
  testSupplementData
}
