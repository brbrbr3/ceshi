// 工作流引擎核心云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 数据库集合引用
const templatesCollection = db.collection('workflow_templates')
const ordersCollection = db.collection('work_orders')
const tasksCollection = db.collection('workflow_tasks')
const logsCollection = db.collection('workflow_logs')
const usersCollection = db.collection('office_users')

// 常量定义
const TASK_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  RETURNED: 'returned'
}

const ORDER_STATUS = {
  PENDING: 'pending',
  SUPPLEMENT: 'supplement',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  TERMINATED: 'terminated'
}

const STEP_TYPE = {
  SERIAL: 'serial',
  PARALLEL: 'parallel',
  CONDITION: 'condition'
}

const APPROVER_TYPE = {
  USER: 'user',
  ROLE: 'role',
  DEPT: 'dept',
  DEPT_HEAD: 'dept_head',
  EXPRESSION: 'expression'
}

const TIMEOUT_ACTION = {
  AUTO_APPROVE: 'auto_approve',
  AUTO_REJECT: 'auto_reject',
  ESCALATE: 'escalate',
  REMIND: 'remind'
}

// 工具函数
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

// 生成工单编号
function generateOrderNo(orderType) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `WO${orderType.toUpperCase().slice(0, 4)}${year}${month}${date}${hour}${minute}${suffix}`
}

// 生成并行组ID
function generateParallelGroupId() {
  return `PG${Date.now()}${Math.random().toString(36).slice(2, 8)}`
}

// 获取嵌套字段的值
function getNestedValue(obj, path) {
  const keys = path.split('.')
  let value = obj
  
  for (const key of keys) {
    if (value && typeof value === 'object') {
      value = value[key]
    } else {
      return undefined
    }
  }
  
  return value
}

// 条件评估
function evaluateCondition(left, operator, right) {
  switch (operator) {
    case 'gt': return Number(left) > Number(right)
    case 'lt': return Number(left) < Number(right)
    case 'eq': return left === right
    case 'neq': return left !== right
    case 'gte': return Number(left) >= Number(right)
    case 'lte': return Number(left) <= Number(right)
    case 'in': return Array.isArray(right) && right.includes(left)
    case 'contains': return String(left).includes(String(right))
    default: return false
  }
}

// 评估步骤条件
function evaluateSteps(steps, businessData) {
  return steps.filter(step => {
    if (!step.condition) return true
    
    const { field, operator, value } = step.condition
    const fieldValue = getNestedValue(businessData, field)
    
    return evaluateCondition(fieldValue, operator, value)
  })
}

// 解析审批人
async function resolveApprovers(approverType, approverConfig, businessData) {
  try {
    switch (approverType) {
      case APPROVER_TYPE.USER:
        // 具体用户
        if (!approverConfig.userIds || approverConfig.userIds.length === 0) {
          return []
        }
        // 查询用户信息
        const userQueryResult = await usersCollection
          .where({ openid: db.command.in(approverConfig.userIds) })
          .get()
        return userQueryResult.data.map(user => ({
          id: user.openid,
          name: user.name
        }))
      
      case APPROVER_TYPE.ROLE:
        // 角色
        if (!approverConfig.roleIds || approverConfig.roleIds.length === 0) {
          return []
        }
        
        const approvers = []
        for (const roleId of approverConfig.roleIds) {
          let userQuery = {
            status: 'approved'
          }
          
          // 根据角色ID查询用户
          if (roleId === 'admin') {
            // 管理员角色
            userQuery.isAdmin = true
          } else if (roleId === 'department_head') {
            // 部门负责人角色
            userQuery.role = '部门负责人'
          } else if (roleId === 'accountant_supervisor') {
            // 会计主管：按岗位查询（position）
            userQuery.position = '会计主管'
          } else if (roleId === 'library_leader') {
            // 馆领导角色
            userQuery.role = '馆领导'
          } else {
            // 其他角色，按 role 字段查询
            const roleMap = {
              '馆员': '馆员',
              '工勤': '工勤',
              '物业': '物业',
              '配偶': '配偶',
              '家属': '家属'
            }
            if (roleMap[roleId]) {
              userQuery.role = roleMap[roleId]
            }
          }
          
          const roleUsersResult = await usersCollection.where(userQuery).get()
          if (roleUsersResult.data && roleUsersResult.data.length > 0) {
            roleUsersResult.data.forEach(user => {
              approvers.push({
                id: user.openid,
                name: user.name
              })
            })
          } else if (roleId === 'admin') {
            // 兜底机制：系统无管理员时，分配给超级管理员 system
            console.warn('未找到管理员用户，分配给超级管理员 system')
            approvers.push({
              id: 'system',
              name: '超级管理员'
            })
          }
        }

        return approvers
      
      case APPROVER_TYPE.DEPT:
        // 部门
        if (!approverConfig.deptId) {
          return []
        }
        // 这里可以从用户表按部门查询
        return [{ 
          id: `dept_${approverConfig.deptId}`, 
          name: `部门${approverConfig.deptId}` 
        }]
      
      case APPROVER_TYPE.DEPT_HEAD:
        // 同部门负责人审批：查找申请人同部门的部门负责人
        if (!businessData || !businessData.applicantId) {
          console.warn('dept_head 审批类型需要提供 applicantId')
          return []
        }
        
        // 1. 获取申请人信息
        const applicantRes = await usersCollection.where({
          openid: businessData.applicantId
        }).limit(1).get()
        
        if (!applicantRes.data || applicantRes.data.length === 0) {
          console.warn('未找到申请人信息')
          return []
        }
        
        const applicantDept = applicantRes.data[0].department
        
        if (!applicantDept) {
          console.warn('申请人未设置部门')
          return []
        }
        
        // 2. 查找同部门的部门负责人
        const deptHeadsRes = await usersCollection.where({
          role: '部门负责人',
          department: applicantDept,
          status: 'approved'
        }).get()
        
        if (!deptHeadsRes.data || deptHeadsRes.data.length === 0) {
          console.warn(`部门"${applicantDept}"未找到部门负责人`)
          return []
        }
        
        return deptHeadsRes.data.map(user => ({
          id: user.openid,
          name: user.name
        }))
      
      case APPROVER_TYPE.EXPRESSION:
        // 动态表达式(如申请人的直属领导)
        if (!approverConfig.expression) {
          return []
        }
        const expressionValue = getNestedValue(businessData, approverConfig.expression)
        if (!expressionValue) {
          return []
        }
        return [{ 
          id: expressionValue, 
          name: expressionValue 
        }]
      
      default:
        return []
    }
  } catch (error) {
    return []
  }
}

// 记录工作流日志
async function logWorkflowAction(orderId, action, operatorId, operatorName, description, taskId, beforeData, afterData, changes) {
  try {
    const now = Date.now()
    await logsCollection.add({
      data: {
        orderId,
        taskId,
        action,
        operatorType: operatorId === 'system' ? 'system' : 'user',
        operatorId,
        operatorName,
        description,
        detail: description,
        beforeData,
        afterData,
        changes,
        createdAt: now
      }
    })
  } catch (error) {
    // 日志记录失败不影响主流程
  }
}

// 验证任务审批权限
async function hasPermission(task, operatorId) {
  if (!task || !operatorId) {
    return false
  }

  // 系统用户有权限
  if (operatorId === 'system') {
    return true
  }

  // 【新增】角色审批：检查是否在审批人列表中
  if (task.approverType === 'role' && task.approverList && task.approverList.length > 0) {
    return task.approverList.some(approver => approver.id === operatorId)
  }

  // 【新增】同部门负责人审批：检查是否在审批人列表中
  if (task.approverType === 'dept_head' && task.approverList && task.approverList.length > 0) {
    return task.approverList.some(approver => approver.id === operatorId)
  }

  // 具体用户审批：直接匹配 openid
  if (task.approverType === 'user' && task.approverId === operatorId) {
    return true
  }

  // 代理人匹配
  if (task.agentId === operatorId) {
    return true
  }

  // 【兼容旧格式】角色审批：检查用户是否具有该角色或岗位
  if (task.approverType === 'role' && !task.approverList) {
    try {
      // 解析角色ID
      const roleId = task.approverId.replace('role_', '')

      // 查询用户信息
      const userRes = await usersCollection.where({
        openid: operatorId,
        status: 'approved'
      }).limit(1).get()

      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]

        // 检查角色权限
        if (roleId === 'admin' && user.isAdmin) {
          return true
        }

        // 部门负责人（按角色）
        if (roleId === 'department_head' && user.role === '部门负责人') {
          return true
        }

        // 会计主管（按岗位 position）
        if (roleId === 'accountant_supervisor' && user.position === '会计主管') {
          return true
        }

        // 馆领导（按角色）
        if (roleId === 'library_leader' && user.role === '馆领导') {
          return true
        }
      }
    } catch (error) {
      // 角色权限检查失败，返回false
    }
  }

  return false
}

// 启动工作流
async function startWorkflow(orderType, businessData) {
  try {
    // 1. 查询激活的模板
    const templateRes = await templatesCollection
      .where({ 
        code: orderType,
        status: 'active'
      })
      .orderBy('version', 'desc')
      .limit(1)
      .get()
    
    if (!templateRes.data || templateRes.data.length === 0) {
      throw new Error('未找到对应的工作流模板')
    }
    
    const template = templateRes.data[0]
    
    // 2. 评估步骤条件,筛选实际执行的步骤
    const activeSteps = evaluateSteps(template.steps, businessData)
    
    if (!activeSteps || activeSteps.length === 0) {
      throw new Error('未找到可执行的步骤')
    }
    
    // 3. 生成工单编号
    const orderNo = generateOrderNo(orderType)
    const now = Date.now()
    
    // 4. 创建工单
    const orderRes = await ordersCollection.add({
      data: {
        orderNo,
        orderType,
        templateId: template._id,
        templateName: template.name,
        templateVersion: template.version,
        businessData,
        workflowSnapshot: {
          templateId: template._id,
          version: template.version,
          steps: activeSteps,
          displayConfig: template.displayConfig || null
        },
        workflowStatus: ORDER_STATUS.PENDING,
        currentStep: 1,
        submittedAt: now,
        startedAt: now,
        supplementCount: 0,
        needSupplement: false,
        createdAt: now,
        updatedAt: now
      }
    })
    
    const orderId = orderRes._id
    
    // 5. 创建第一个任务节点
    const firstStep = activeSteps[0]
    const tasks = await createTasks(orderId, firstStep, businessData)
    
    // 检查是否成功创建任务
    if (!tasks || tasks.length === 0) {
      // 没有创建到任务（因为没有找到审批人），删除工单并返回错误
      console.warn(`步骤"${firstStep.stepName}"未找到审批人，无法启动工作流`)
      await ordersCollection.doc(orderId).remove()
      throw new Error(`步骤"${firstStep.stepName}"未找到审批人，请联系管理员配置审批人`)
    }
    
    // 6. 记录日志（异步执行，不阻塞主流程）
    logWorkflowAction(
      orderId,
      'start',
      businessData.applicantId || 'unknown',
      '申请人',
      '提交工单',
      null,
      null,
      { orderNo, orderType },
      null
    ).catch(() => {
      // 日志记录失败不影响主流程
    })
    
    // 7. 发送任务分配通知（异步执行，不阻塞主流程）
    if (tasks && tasks.length > 0) {
      const orderData = {
        _id: orderId,
        orderNo,
        orderType,
        businessData
      }
      sendTaskAssignedNotification(tasks, orderData).catch(() => {
        // 通知发送失败不影响主流程
      })
    }
    
    return success({
      orderId,
      orderNo,
      templateId: template._id,
      templateName: template.name,
      currentStep: firstStep.stepNo,
      currentStepName: firstStep.stepName
    }, '工单提交成功')

  } catch (error) {
    throw error
  }
}

// 获取角色显示名称
function getRoleDisplayName(roleId) {
  const roleNames = {
    'admin': '管理员',
    'department_head': '部门负责人',
    'accountant_supervisor': '会计主管',
    'library_leader': '馆领导'
  }
  return roleNames[roleId] || roleId
}

// 创建任务节点
async function createTasks(orderId, step, businessData) {
  try {
    const parallelGroupId = step.stepType === STEP_TYPE.PARALLEL 
      ? generateParallelGroupId() 
      : null
    
    // 解析审批人
    const approvers = await resolveApprovers(step.approverType, step.approverConfig, businessData)
    
    if (!approvers || approvers.length === 0) {
      console.warn(`步骤"${step.stepName}"未找到审批人，工单将停留在当前步骤`)
      return []
    }
    
    const now = Date.now()
    const timeoutHours = step.timeout || 72
    const timeoutAt = now + (timeoutHours * 60 * 60 * 1000)
    
    // 判断是否为串行步骤 + 角色审批（包括 dept_head 类型）
    const isSequential = step.approvalStrategy === 'sequential' || step.stepType === 'serial'
    const isRoleApproval = step.approverType === 'role' || step.approverType === 'dept_head'
    
    if (isSequential && isRoleApproval) {
      // 【串行 + 角色/部门负责人】：创建单个共享任务，所有审批人共享
      console.log('创建共享任务（串行角色审批），审批人列表:', approvers.map(a => a.name).join(', '))
      
      const roleId = step.approverType === 'dept_head' 
        ? 'dept_head' 
        : step.approverConfig.roleIds[0]
      const roleDisplayName = step.approverType === 'dept_head'
        ? '同部门负责人'
        : getRoleDisplayName(roleId)
      
      const task = {
        orderId,
        stepNo: step.stepNo,
        stepName: step.stepName,
        stepType: step.stepType,
        // 角色级别信息
        approverType: step.approverType === 'dept_head' ? 'dept_head' : 'role',
        approverId: roleId,
        approverName: roleDisplayName,
        // 所有有权限的审批人列表
        approverList: approvers,
        // 实际审批人（审批后填充）
        actualApproverId: null,
        actualApproverName: null,
        // 状态
        taskStatus: TASK_STATUS.PENDING,
        createdAt: now,
        assignedAt: now,
        timeoutAt,
        timeoutAction: step.timeoutAction || TIMEOUT_ACTION.REMIND,
        isTimeout: false,
        parallelGroupId: null,
        comment: '',
        attachments: []
      }
      
      await tasksCollection.add({ data: task })
      return [task]
      
    } else if (step.stepType === STEP_TYPE.PARALLEL) {
      // 【并行步骤】：为每个审批人创建独立任务
      console.log('创建并行任务，审批人数量:', approvers.length)
      
      const tasks = approvers.map(approver => ({
        orderId,
        stepNo: step.stepNo,
        stepName: step.stepName,
        stepType: step.stepType,
        approverType: 'user',
        approverId: approver.id,
        approverName: approver.name,
        approverList: [approver],  // 兼容格式
        actualApproverId: null,
        actualApproverName: null,
        taskStatus: TASK_STATUS.PENDING,
        createdAt: now,
        assignedAt: now,
        timeoutAt,
        timeoutAction: step.timeoutAction || TIMEOUT_ACTION.REMIND,
        isTimeout: false,
        parallelGroupId,
        comment: '',
        attachments: []
      }))
      
      for (const task of tasks) {
        await tasksCollection.add({ data: task })
      }
      return tasks
      
    } else {
      // 【其他情况（具体用户）】：为每个用户创建独立任务
      console.log('创建用户任务，用户数量:', approvers.length)
      
      const tasks = approvers.map(approver => ({
        orderId,
        stepNo: step.stepNo,
        stepName: step.stepName,
        stepType: step.stepType,
        approverType: 'user',
        approverId: approver.id,
        approverName: approver.name,
        approverList: [approver],  // 兼容格式
        actualApproverId: null,
        actualApproverName: null,
        taskStatus: TASK_STATUS.PENDING,
        createdAt: now,
        assignedAt: now,
        timeoutAt,
        timeoutAction: step.timeoutAction || TIMEOUT_ACTION.REMIND,
        isTimeout: false,
        parallelGroupId: null,
        comment: '',
        attachments: []
      }))
      
      for (const task of tasks) {
        await tasksCollection.add({ data: task })
      }
      return tasks
    }

  } catch (error) {
    console.error('创建任务失败:', error)
    return []
  }
}

// 审批任务
async function approveTask(taskId, action, comment, operatorId, operatorName, attachments) {
  try {
    // 1. 获取任务和工单
    const taskRes = await tasksCollection.doc(taskId).get()
    if (!taskRes.data) {
      throw new Error('任务不存在')
    }

    const task = taskRes.data
    const orderRes = await ordersCollection.doc(task.orderId).get()
    if (!orderRes.data) {
      throw new Error('工单不存在')
    }

    const order = orderRes.data

    // 2. 验证审批权限
    const hasPermissionResult = await hasPermission(task, operatorId)
    if (!hasPermissionResult) {
      throw new Error('无权审批此任务')
    }

    // 3. 【并发控制】检查工单状态
    if (order.workflowStatus !== ORDER_STATUS.PENDING) {
      const statusText = {
        'completed': '已完成',
        'rejected': '已驳回',
        'cancelled': '已取消',
        'terminated': '已中止',
        'supplement': '待补充'
      }[order.workflowStatus] || order.workflowStatus
      throw new Error(`工单已${statusText}，请刷新页面`)
    }

    // 4. 检查任务状态，如果不是 pending，给出更详细的错误信息
    if (task.taskStatus !== TASK_STATUS.PENDING) {
      const statusText = {
        'approved': '已通过',
        'rejected': '已驳回',
        'cancelled': '已取消',
        'returned': '已退回'
      }[task.taskStatus] || task.taskStatus
      
      // 如果已有实际审批人，显示谁审批的
      if (task.actualApproverName) {
        throw new Error(`任务已被${task.actualApproverName}${statusText}，请刷新页面`)
      }
      throw new Error(`任务${statusText}，请刷新页面后重试`)
    }

    const now = Date.now()

    // 5. 【并发控制】再次获取任务状态（乐观锁检查）
    const freshTaskRes = await tasksCollection.doc(taskId).get()
    if (freshTaskRes.data.taskStatus !== TASK_STATUS.PENDING) {
      if (freshTaskRes.data.actualApproverName) {
        throw new Error(`任务已被${freshTaskRes.data.actualApproverName}处理，请刷新页面`)
      }
      throw new Error('任务已被处理，请刷新页面后重试')
    }

    // 6. 更新任务状态（记录实际审批人）
    await tasksCollection.doc(taskId).update({
      data: {
        taskStatus: action === 'approve' ? TASK_STATUS.APPROVED : (action === 'return' ? TASK_STATUS.RETURNED : TASK_STATUS.REJECTED),
        action,
        comment,
        attachments: attachments || [],
        actualApproverId: operatorId,        // 记录实际审批人ID
        actualApproverName: operatorName,    // 记录实际审批人姓名
        startedAt: task.startedAt || now,
        completedAt: now,
        updatedAt: now
      }
    })

    // 7. 记录日志
    const actionText = {
      'approve': '通过',
      'reject': '驳回',
      'return': '退回'
    }[action] || action

    await logWorkflowAction(
      order._id,
      action,
      operatorId,
      operatorName,
      `审批操作: ${actionText}`,
      taskId,
      { taskStatus: task.taskStatus },
      { taskStatus: action === 'approve' ? TASK_STATUS.APPROVED : (action === 'return' ? TASK_STATUS.RETURNED : TASK_STATUS.REJECTED), actualApprover: operatorName, comment },
      null
    )

    // 8. 根据操作类型处理流程
    let warningMessage = null
    if (action === 'approve') {
      const handleResult = await handleApproval(task, order, operatorId, operatorName, comment)
      warningMessage = handleResult.warningMessage
    } else if (action === 'reject') {
      await handleRejection(task, order, operatorId, operatorName, comment)
    } else if (action === 'return') {
      await handleReturn(task, order, operatorId, operatorName, comment)
    }

    // 如果有警告消息，使用警告消息；否则使用成功消息
    const message = warningMessage || (actionText + '成功')
    return success({ success: true }, message)

  } catch (error) {
    throw error
  }
}

// 处理审批通过
async function handleApproval(task, order, approverId, approverName, comment) {
  console.log('==== handleApproval 开始 ====')
  console.log('task:', task)
  console.log('order:', order._id, order.orderNo, order.currentStep)
  
  const snapshot = order.workflowSnapshot
  const currentStep = snapshot.steps.find(s => s.stepNo === task.stepNo)
  
  if (!currentStep) {
    throw new Error('未找到当前步骤配置')
  }
  
  console.log('currentStep:', currentStep)
  console.log('stepType:', currentStep.stepType)
  console.log('是否为并行步骤:', currentStep.stepType === STEP_TYPE.PARALLEL)
  
  let warningMessage = null
  
  // 判断是否为并行步骤
  if (currentStep.stepType === STEP_TYPE.PARALLEL) {
    console.log('进入并行任务处理逻辑')
    const parallelTasksRes = await tasksCollection
      .where({
        orderId: order._id,
        stepNo: task.stepNo,
        parallelGroupId: task.parallelGroupId
      })
      .get()
    
    console.log('并行任务列表:', parallelTasksRes.data.map(t => ({
      _id: t._id,
      approverId: t.approverId,
      taskStatus: t.taskStatus
    })))
    
    const allApproved = parallelTasksRes.data.every(t =>
      t.taskStatus === TASK_STATUS.APPROVED || t._id === task._id
    )
    
    console.log('所有并行任务是否已通过:', allApproved)
    
    if (!allApproved) {
      // 并行任务未全部完成,等待其他任务
      console.log('并行任务未全部完成，等待其他任务')
      return { warningMessage: null }
    }
    
    // 取消未处理的并行任务
    const pendingTasks = parallelTasksRes.data.filter(t => t.taskStatus === TASK_STATUS.PENDING)
    console.log('需要取消的待处理任务:', pendingTasks.map(t => t._id))
    for (const pendingTask of pendingTasks) {
      if (pendingTask._id !== task._id) {
        await tasksCollection.doc(pendingTask._id).update({
          data: {
            taskStatus: TASK_STATUS.CANCELLED,
            cancelledAt: Date.now(),
            updatedAt: Date.now()
          }
        })
      }
    }
  }
  
  // 检查是否有下一步骤
  const nextStep = snapshot.steps.find(s => s.stepNo === task.stepNo + 1)
  console.log('nextStep:', nextStep)
  
  if (nextStep) {
    console.log('有下一步骤，尝试创建下一步任务')
    // 动态评估下一步骤条件(如果业务数据可能被修改)
    const activeSteps = evaluateSteps([nextStep], order.businessData)
    
    console.log('activeSteps:', activeSteps)
    
    if (activeSteps.length > 0) {
      try {
        // 创建下一步任务
        const nextTasks = await createTasks(order._id, activeSteps[0], order.businessData)
        
        console.log('创建的下一步任务:', nextTasks.map(t => ({
          _id: t._id,
          stepName: t.stepName,
          approverId: t.approverId
        })))
        
        // 检查是否成功创建任务
        if (!nextTasks || nextTasks.length === 0) {
          // 没有创建到任务（因为没有找到审批人），自动中止工单
          console.log('未找到下一步审批人，自动中止工单')
          await autoTerminateOrder(order, '因下一步骤未找到审批人，系统自动中止申请')
          warningMessage = '审批通过，但下一步骤未找到审批人，系统已自动中止申请'
        } else {
          // 成功创建任务，更新工单当前步骤
          await ordersCollection.doc(order._id).update({
            data: {
              currentStep: activeSteps[0].stepNo,
              updatedAt: Date.now()
            }
          })
          
          // 发送任务分配通知给下一步审批人
          await sendTaskAssignedNotification(nextTasks, order)
        }
      } catch (createError) {
        // 创建下一步任务失败（比如没有找到审批人），自动中止工单
        console.error('创建下一步任务失败:', createError)
        await autoTerminateOrder(order, '因下一步骤未找到审批人，系统自动中止申请')
        warningMessage = '审批通过，但下一步骤未找到审批人，系统已自动中止申请'
      }
    }
  } else {
    console.log('流程完成')
    // 流程完成
    await completeWorkflow(order._id, 'approved', approverId, approverName, comment)
  }
  
  console.log('==== handleApproval 结束 ====')
  return { warningMessage }
}

// 处理审批驳回
async function handleRejection(task, order, approverId, approverName, comment) {
  try {
    // 更新工单状态为已驳回
    await ordersCollection.doc(order._id).update({
      data: {
        workflowStatus: ORDER_STATUS.REJECTED,
        finalDecision: 'rejected',
        completedAt: Date.now(),
        totalDuration: Date.now() - (order.startedAt || order.submittedAt),
        updatedAt: Date.now()
      }
    })

    // 取消所有待处理任务
    await cancelPendingTasks(order._id)

    // 发送驳回通知给申请人（包含驳回人信息）
    await sendTaskCompletedNotification(order, 'rejected', comment, approverName)
  } catch (error) {
    // 如果工单状态更新失败，尝试修复
    console.error('handleRejection 错误:', error)

    // 重新获取工单状态
    const orderRes = await ordersCollection.doc(order._id).get()
    if (orderRes.data && orderRes.data.workflowStatus === ORDER_STATUS.PENDING) {
      // 如果工单状态仍然是 pending，强制更新
      try {
        await ordersCollection.doc(order._id).update({
          data: {
            workflowStatus: ORDER_STATUS.REJECTED,
            finalDecision: 'rejected',
            completedAt: Date.now(),
            totalDuration: Date.now() - (orderRes.data.startedAt || orderRes.data.submittedAt),
            updatedAt: Date.now()
          }
        })
      } catch (retryError) {
        console.error('修复工单状态失败:', retryError)
        throw new Error('驳回操作已完成，但数据同步可能存在延迟，请稍后刷新查看')
      }
    }

    throw error
  }
}

// 处理退回
async function handleReturn(task, order, approverId, approverName, comment) {
  const snapshot = order.workflowSnapshot
  
  // 默认退回到申请人
  const returnToStep = task.returnToStep || 0
  
  if (returnToStep === 0) {
    // 退回到申请人
    await returnToApplicant(task, order, comment)
  } else {
    // 退回到指定步骤
    await returnToStep(order, returnToStep, task.stepNo, comment)
  }
}

// 退回到申请人
async function returnToApplicant(task, order, comment) {
  await ordersCollection.doc(order._id).update({
    data: {
      workflowStatus: ORDER_STATUS.SUPPLEMENT,
      needSupplement: true,
      supplementReason: comment,
      updatedAt: Date.now()
    }
  })
  
  // 取消所有待处理任务
  await cancelPendingTasks(order._id)
  
  // 发送退回通知给申请人
  await sendProcessReturnedNotification(order, comment)
}

// 退回到指定步骤
async function returnToStep(order, returnToStepNo, currentStepNo, comment) {
  // 将被退回的任务标记为已退回
  const currentTasksRes = await tasksCollection
    .where({
      orderId: order._id,
      stepNo: currentStepNo
    })
    .get()
  
  const now = Date.now()
  for (const task of currentTasksRes.data) {
    await tasksCollection.doc(task._id).update({
      data: {
        taskStatus: TASK_STATUS.RETURNED,
        returnedFromStep: currentStepNo,
        returnReason: comment,
        returnedAt: now,
        updatedAt: now
      }
    })
  }
  
  // 重新激活目标步骤的任务
  const targetTasksRes = await tasksCollection
    .where({
      orderId: order._id,
      stepNo: returnToStepNo
    })
    .get()
  
  for (const task of targetTasksRes.data) {
    await tasksCollection.doc(task._id).update({
      data: {
        taskStatus: TASK_STATUS.PENDING,
        updatedAt: now
      }
    })
  }
  
  // 更新工单当前步骤
  await ordersCollection.doc(order._id).update({
    data: {
      currentStep: returnToStepNo,
      updatedAt: now
    }
  })
  
  // 取消当前步骤和后续步骤的待处理任务
  await cancelPendingTasks(order._id, returnToStepNo)
  
  // 发送退回通知给目标步骤审批人
  if (targetTasksRes.data && targetTasksRes.data.length > 0) {
    const returnTasks = targetTasksRes.data.map(task => ({
      _id: task._id,
      orderId: task.orderId,
      stepNo: task.stepNo,
      stepName: task.stepName,
      stepType: task.stepType,
      approverType: task.approverType,
      approverId: task.approverId,
      approverName: task.approverName,
      taskStatus: task.taskStatus,
      createdAt: task.createdAt,
      assignedAt: now,
      comment: comment
    }))
    await sendTaskAssignedNotification(returnTasks, order)
  }
}

// 取消待处理任务
async function cancelPendingTasks(orderId, fromStepNo = 0) {
  const now = Date.now()
  let query = { orderId, taskStatus: TASK_STATUS.PENDING }
  
  if (fromStepNo > 0) {
    query.stepNo = _.gt(fromStepNo)
  }
  
  const pendingTasksRes = await tasksCollection.where(query).get()
  
  for (const task of pendingTasksRes.data) {
    await tasksCollection.doc(task._id).update({
      data: { 
        taskStatus: TASK_STATUS.CANCELLED, 
        cancelledAt: now,
        updatedAt: now
      }
    })
  }
}

// 发送小程序内通知
// 获取工单类型的中文名称
// 从 workflow_templates 的 name 字段处理得到
// 处理规则：先去掉末尾的"审批"，再去掉末尾的"申请"，最后加上"申请"二字
async function getOrderTypeName(orderType, templateName = null) {
  // 辅助函数：处理模板名称
  const processTemplateName = (name) => {
    if (!name) return null
    let result = name
    // 去掉末尾的"审批"
    if (result.endsWith('审批')) {
      result = result.slice(0, -2)
    }
    // 去掉末尾的"申请"
    if (result.endsWith('申请')) {
      result = result.slice(0, -2)
    }
    result += '申请'
    return result || '申请'
  }

  // 1. 如果已有 templateName，直接处理返回
  if (templateName) {
    return processTemplateName(templateName)
  }

  // 2. 从数据库查询模板名称
  try {
    const templateRes = await templatesCollection
      .where({ 
        code: orderType,
        status: 'active'
      })
      .orderBy('version', 'desc')
      .limit(1)
      .get()
    
    if (templateRes.data && templateRes.data.length > 0) {
      return processTemplateName(templateRes.data[0].name)
    }
  } catch (error) {
    console.error('查询模板名称失败:', error)
  }

  // 3. fallback: 硬编码映射（兼容旧数据）
  const typeMap = {
    'medical_application': '就医',
    'user_registration': '注册',
    'user_profile_update': '信息修改',
    'notification_publish': '公告发布',
    'passport_application': '护照借用'
  }
  return typeMap[orderType] || '审批'
}

async function sendAppNotification(openid, notificationData) {
  try {
    await db.collection('notifications').add({
      data: {
        openid: openid,
        read: false,
        createdAt: Date.now(),
        ...notificationData
      }
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 批量发送小程序内通知
async function sendBatchAppNotifications(notifications) {
  try {
    const promises = notifications.map(notification =>
      db.collection('notifications').add({
        data: {
          openid: notification.openid,
          read: false,
          createdAt: Date.now(),
          ...notification.data
        }
      })
    )
    await Promise.all(promises)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}



// 发送任务分配通知
async function sendTaskAssignedNotification(tasks, order) {
  if (!tasks || tasks.length === 0) return

  // 准备通知列表
  let notifications = []

  for (const task of tasks) {
    // 直接使用 task.approverList（包含所有有权限的审批人）
    // 任务创建时已正确解析并设置 approverList
    const orderTypeName = await getOrderTypeName(order.orderType, order.templateName)
    if (task.approverList && task.approverList.length > 0) {
      for (const approver of task.approverList) {
        notifications.push({
          openid: approver.id,
          data: {
            type: 'task_assigned',
            title: '新的审批任务',
            content: `${order.businessData.applicantName || '申请人'}的${orderTypeName || '申请'}待您审批，点击查看`,
            orderId: order._id,
            orderNo: order.orderNo,
            orderType: order.orderType,
            stepName: task.stepName,
            taskId: task._id,
            applicantName: order.businessData.applicantName
          }
        })
      }
    }
  }

  // 批量写入小程序内通知
  if (notifications.length > 0) {
    await sendBatchAppNotifications(notifications)
  }
}

// 发送审批完成通知
async function sendTaskCompletedNotification(order, approvalResult, comment, approverName) {
  const orderTypeName = await getOrderTypeName(order.orderType, order.templateName)
  let content = ''
  
  if (approvalResult === 'rejected') {
    // 驳回时包含驳回人信息
    content = `您的${orderTypeName}已被${approverName || '审批人'}驳回，请点击查看`
  } else {
    content = comment || `您的${orderTypeName}已通过审批`
  }
  
  // 发送小程序内通知给申请人
  await sendAppNotification(order.businessData.applicantId, {
    type: 'task_completed',
    title: approvalResult === 'approved' ? '审批通过' : '审批驳回',
    content: content,
    orderId: order._id,
    orderNo: order.orderNo,
    orderType: order.orderType,
    approvalResult: approvalResult,
    comment: comment
  })
}

// 发送流程退回通知
async function sendProcessReturnedNotification(order, returnReason) {
  // 发送小程序内通知给申请人
  await sendAppNotification(order.businessData.applicantId, {
    type: 'process_returned',
    title: '流程退回',
    content: returnReason || '请补充资料',
    orderId: order._id,
    orderNo: order.orderNo,
    orderType: order.orderType,
    returnReason: returnReason
  })
}

// 发送工作流完成通知
async function sendWorkflowCompletedNotification(order, finalStatus) {
    const orderTypeName = await getOrderTypeName(order.orderType, order.templateName)
// 发送小程序内通知给申请人
  await sendAppNotification(order.businessData.applicantId, {
    type: 'workflow_completed',
    title: finalStatus === 'approved' ? '审批通过' : '审批驳回',
    content: finalStatus === 'approved' ? `您的${orderTypeName}已通过审批，点击查看` : `您的${orderTypeName}已被驳回，点击查看`,
    orderId: order._id,
    orderNo: order.orderNo,
    orderType: order.orderType,
    finalStatus: finalStatus
  })
}

// 发送工单中止通知
async function sendOrderTerminatedNotification(order, reason) {
  const orderTypeName = await getOrderTypeName(order.orderType, order.templateName)
  await sendAppNotification(order.businessData.applicantId, {
    type: 'order_terminated',
    title: '申请已中止',
    content: `您的${orderTypeName}意外中止，点击查看`,
    orderId: order._id,
    orderNo: order.orderNo,
    orderType: order.orderType,
    reason: reason
  })
}

// 自动中止工单（系统操作）
async function autoTerminateOrder(order, reason) {
  const now = Date.now()
  
  // 更新工单状态
  await ordersCollection.doc(order._id).update({
    data: {
      workflowStatus: ORDER_STATUS.TERMINATED,
      finalDecision: 'terminated',
      reviewRemark: reason,
      reviewedBy: '系统',
      reviewedAt: now,
      completedAt: now,
      totalDuration: now - (order.startedAt || order.submittedAt),
      updatedAt: now
    }
  })
  
  // 取消所有待处理任务
  await cancelPendingTasks(order._id)
  
  // 记录日志（操作人为"系统"）
  await logWorkflowAction(
    order._id,
    'terminate',
    'system',
    '系统',
    '中止工单',
    null,
    { workflowStatus: ORDER_STATUS.PENDING },
    { workflowStatus: ORDER_STATUS.TERMINATED, reason },
    null
  )
  
  // 发送中止通知给申请人
  await sendOrderTerminatedNotification(order, reason)
}

// 完成工作流
async function completeWorkflow(orderId, decision, approverId, approverName, comment) {
  const now = Date.now()
  
  const orderRes = await ordersCollection.doc(orderId).get()
  const order = orderRes.data
  
  // 更新工单状态
  await ordersCollection.doc(orderId).update({
    data: {
      workflowStatus: decision === 'approved' ? ORDER_STATUS.COMPLETED : ORDER_STATUS.REJECTED,
      finalDecision: decision,
      completedAt: now,
      totalDuration: now - (order.startedAt || order.submittedAt),
      updatedAt: now
    }
  })
  
  // 记录日志
  await logWorkflowAction(
    orderId,
    'complete',
    approverId || 'system',
    approverName || '系统',
    `流程${decision === 'approved' ? '通过' : '驳回'}`,
    null,
    { workflowStatus: order.workflowStatus },
    { workflowStatus: decision === 'approved' ? ORDER_STATUS.COMPLETED : ORDER_STATUS.REJECTED },
    null
  )

  // 特殊处理：用户注册审批通过，自动创建用户记录
  if (order.orderType === 'user_registration' && decision === 'approved') {
    const usersCollection = db.collection('office_users')
    const businessData = order.businessData || {}

    // 检查是否已存在用户
    const existingUserResult = await usersCollection
      .where({ openid: businessData.applicantId })
      .limit(1)
      .get()

    const now = Date.now()
    const userPayload = {
      openid: businessData.applicantId,
      name: businessData.applicantName || '',
      gender: businessData.gender || '',
      birthday: businessData.birthday || '',
      role: businessData.role || '馆员',
      isAdmin: !!businessData.isAdmin,
      avatarText: businessData.avatarText || '',
      relativeName: businessData.relativeName || '',
      position: businessData.position || '',
      department: businessData.department || '',
      status: 'approved',
      sourceOrderId: order.orderId,
      approvedAt: now,
      approvedBy: approverId || 'system',
      createdAt: existingUserResult.data && existingUserResult.data.length > 0
        ? (existingUserResult.data[0].createdAt || now)
        : now,
      updatedAt: now
    }

    try {
      if (existingUserResult.data && existingUserResult.data.length > 0) {
        // 更新已有用户
        await usersCollection.doc(existingUserResult.data[0]._id).update({ data: userPayload })
      } else {
        // 创建新用户
        await usersCollection.add({ data: userPayload })
      }
    } catch (error) {
      // 不抛出错误，允许流程继续
    }
  }

  // 特殊处理：用户信息修改审批通过，更新用户信息
  if (order.orderType === 'user_profile_update' && decision === 'approved') {
    const usersCollection = db.collection('office_users')
    const businessData = order.businessData || {}
    const userId = businessData.userId

    if (userId) {
      const now = Date.now()
      const updatePayload = {
        gender: businessData.gender || '',
        birthday: businessData.birthday || '',
        role: businessData.role || '馆员',
        isAdmin: !!businessData.isAdmin,
        relativeName: businessData.relativeName || '',
        position: businessData.position || '',
        department: businessData.department || '',
        updatedAt: now
      }

      try {
        await usersCollection.doc(userId).update({ data: updatePayload })
      } catch (error) {
        // 不抛出错误，允许流程继续
      }
    }
  }

  // 特殊处理：护照借用审批通过，创建 passport_records 记录
  if (order.orderType === 'passport_application' && decision === 'approved') {
    const passportRecordsCollection = db.collection('passport_records')
    const businessData = order.businessData || {}

    try {
      await passportRecordsCollection.add({
        data: {
          orderId: order._id,
          orderNo: order.orderNo,
          // 申请人信息
          applicantId: businessData.applicantId,
          applicantName: businessData.applicantName,
          // 借用的护照信息
          borrowerNames: businessData.borrowerNames || [],
          borrowerOpenids: businessData.borrowerOpenids || [],
          borrowerInfoList: businessData.borrowerInfoList || [],
          // 借用信息
          borrowDate: businessData.borrowDate,
          expectedReturnDate: businessData.expectedReturnDate || '',
          reason: businessData.reason || '',
          // 状态：已批准待借出
          status: 'approved',
          // 借出信息（管理员借出后填写）
          borrowedAt: null,
          borrowedBy: null,
          borrowedByName: null,
          // 归还信息（归还后填写）
          returnedAt: null,
          returnedBy: null,
          returnedByName: null,
          // 时间戳
          createdAt: now,
          updatedAt: now
        }
      })
      console.log('护照借用记录创建成功（状态：approved），订单号:', order.orderNo)
    } catch (error) {
      console.error('创建护照借用记录失败:', error)
      // 不抛出错误，允许流程继续
    }
  }

  // 发送完成通知给申请人
  await sendWorkflowCompletedNotification(order, decision)
}

// 查询我的工单列表
async function getMyOrders(openid, status, page = 1, pageSize = 20) {
  try {
    const query = {
      'businessData.applicantId': openid
    }
    
    if (status) {
      query.workflowStatus = status
    }
    
    const countRes = await ordersCollection.where(query).count()
    const dataRes = await ordersCollection
      .where(query)
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
    throw error
  }
}

// 查询我的待办任务
async function getMyTasks(openid, page = 1, pageSize = 20) {
  try {
    // 使用 _.or 查询两种格式的任务
    // 1. 新格式：approverList 数组中包含当前用户
    // 2. 旧格式：approverId 直接匹配当前用户
    const countRes = await tasksCollection.where(
      _.or([
        // 新格式：共享任务，检查 approverList
        {
          approverList: _.elemMatch({ id: openid }),
          taskStatus: TASK_STATUS.PENDING
        },
        // 旧格式：具体用户任务，检查 approverId
        {
          approverId: openid,
          taskStatus: TASK_STATUS.PENDING
        }
      ])
    ).count()
    
    const dataRes = await tasksCollection
      .where(
        _.or([
          {
            approverList: _.elemMatch({ id: openid }),
            taskStatus: TASK_STATUS.PENDING
          },
          {
            approverId: openid,
            taskStatus: TASK_STATUS.PENDING
          }
        ])
      )
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
    
    // 查询工单信息
    const orderIds = dataRes.data.map(t => t.orderId)
    const ordersRes = await ordersCollection
      .where({
        _id: _.in(orderIds)
      })
      .get()
    
    const ordersMap = {}
    ordersRes.data.forEach(order => {
      ordersMap[order._id] = order
    })
    
    // 组装返回数据
    const list = dataRes.data.map(task => ({
      ...task,
      order: ordersMap[task.orderId] || null
    }))
    
    return success({
      list,
      total: countRes.total,
      page,
      pageSize
    })

  } catch (error) {
    throw error
  }
}

// 查询工单详情
async function getOrderDetail(orderId, openid) {
  try {
    const orderRes = await ordersCollection.doc(orderId).get()
    if (!orderRes.data) {
      throw new Error('工单不存在')
    }
    
    const order = orderRes.data
    
    // 验证权限: 申请人或审批人
    const applicantId = order.businessData.applicantId
    if (applicantId !== openid) {
      // 检查是否为审批人
      const taskRes = await tasksCollection
        .where({
          orderId,
          approverId: openid
        })
        .get()
      
      if (!taskRes.data || taskRes.data.length === 0) {
        throw new Error('无权查看此工单')
      }
    }
    
    // 查询任务列表
    const tasksRes = await tasksCollection
      .where({ orderId })
      .orderBy('stepNo', 'asc')
      .get()
    
    // 查询日志
    const logsRes = await logsCollection
      .where({ orderId })
      .orderBy('createdAt', 'desc')
      .get()
    
    return success({
      order,
      tasks: tasksRes.data,
      logs: logsRes.data
    })

  } catch (error) {
    throw error
  }
}

// 补充资料
async function supplementOrder(orderId, openid, supplementData, comment) {
  try {
    const orderRes = await ordersCollection.doc(orderId).get()
    if (!orderRes.data) {
      throw new Error('工单不存在')
    }
    
    const order = orderRes.data
    
    // 验证权限: 申请人
    if (order.businessData.applicantId !== openid) {
      throw new Error('无权补充此工单')
    }
    
    // 验证状态: 必须是待补充状态
    if (order.workflowStatus !== ORDER_STATUS.SUPPLEMENT) {
      throw new Error('工单当前不允许补充资料')
    }
    
    // 合并补充数据
    const mergedBusinessData = {
      ...order.businessData,
      ...supplementData
    }
    
    const now = Date.now()
    
    // 更新工单
    await ordersCollection.doc(orderId).update({
      data: {
        businessData: mergedBusinessData,
        supplementCount: order.supplementCount + 1,
        needSupplement: false,
        supplementReason: '',
        workflowStatus: ORDER_STATUS.PENDING,
        updatedAt: now
      }
    })
    
    // 重新创建被退回步骤的任务
    const snapshot = order.workflowSnapshot
    const stepToRestore = snapshot.steps.find(s => s.stepNo === order.currentStep)
    
    if (stepToRestore) {
      await createTasks(orderId, stepToRestore, mergedBusinessData)
    }
    
    // 记录日志
    await logWorkflowAction(
      orderId,
      'supplement',
      openid,
      order.businessData.applicantName || '申请人',
      '补充资料',
      null,
      { workflowStatus: ORDER_STATUS.SUPPLEMENT },
      { workflowStatus: ORDER_STATUS.PENDING },
      null
    )
    
    return success({}, '补充资料成功,流程已恢复')

  } catch (error) {
    throw error
  }
}

// 撤回工单
async function cancelOrder(orderId, openid) {
  try {
    const orderRes = await ordersCollection.doc(orderId).get()
    if (!orderRes.data) {
      throw new Error('工单不存在')
    }

    const order = orderRes.data

    // 验证权限: 申请人
    if (order.businessData.applicantId !== openid) {
      throw new Error('无权撤回此工单')
    }

    // 验证状态: 只能撤回待审批状态的工单
    if (order.workflowStatus !== ORDER_STATUS.PENDING) {
      throw new Error('只能撤回待审批的工单')
    }

    const now = Date.now()

    // 更新工单状态
    await ordersCollection.doc(orderId).update({
      data: {
        workflowStatus: ORDER_STATUS.CANCELLED,
        completedAt: now,
        totalDuration: now - (order.startedAt || order.submittedAt),
        updatedAt: now
      }
    })

    // 取消所有待处理任务
    await cancelPendingTasks(orderId)

    // 记录日志
    await logWorkflowAction(
      orderId,
      'cancel',
      openid,
      order.businessData.applicantName || '申请人',
      '撤回工单',
      null,
      { workflowStatus: ORDER_STATUS.PENDING },
      { workflowStatus: ORDER_STATUS.CANCELLED },
      null
    )

    return success({}, '工单已撤回')

  } catch (error) {
    throw error
  }
}

// 中止工单（申请人或审批人）
async function terminateOrder(orderId, openid, operatorName = '审批人', reason = '流程无法继续，已中止') {
  try {
    const orderRes = await ordersCollection.doc(orderId).get()
    if (!orderRes.data) {
      throw new Error('工单不存在')
    }

    const order = orderRes.data

    // 验证权限: 申请人或有权限的审批人
    const isApplicant = order.businessData.applicantId === openid
    if (!isApplicant) {
      // 检查是否是审批人（通过角色判断）
      const userRes = await usersCollection.where({ openid }).get()
      if (!userRes.data || userRes.data.length === 0) {
        throw new Error('无权中止此工单')
      }
      const user = userRes.data[0]
      if (user.role !== '馆领导' && user.role !== '部门负责人' && user.role !== '会计主管') {
        throw new Error('无权中止此工单')
      }
    }

    // 验证状态: 只能中止待审批状态的工单
    if (order.workflowStatus !== ORDER_STATUS.PENDING) {
      throw new Error('只能中止待审批的工单')
    }

    const now = Date.now()

    // 更新工单状态
    await ordersCollection.doc(orderId).update({
      data: {
        workflowStatus: ORDER_STATUS.TERMINATED,
        finalDecision: 'terminated',
        completedAt: now,
        totalDuration: now - (order.startedAt || order.submittedAt),
        updatedAt: now
      }
    })

    // 取消所有待处理任务
    await cancelPendingTasks(orderId)

    // 记录日志
    await logWorkflowAction(
      orderId,
      'terminate',
      openid,
      isApplicant ? (order.businessData.applicantName || '申请人') : operatorName,
      '中止工单',
      null,
      { workflowStatus: ORDER_STATUS.PENDING },
      { workflowStatus: ORDER_STATUS.TERMINATED, reason },
      null
    )

    return success({}, '工单已中止')

  } catch (error) {
    throw error
  }
}

// 云函数入口
exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event && event.action

  // 只有需要 openid 的操作才进行验证
  const actionsRequireOpenid = ['getMyOrders', 'getMyTasks', 'getOrderDetail', 'supplementOrder', 'cancelOrder', 'terminateOrder', 'approveTask']

  // 对于 approveTask，如果提供了 operatorId，则不依赖 wxContext.OPENID
  const requireOpenid = actionsRequireOpenid.includes(action) && action !== 'approveTask'
  if (requireOpenid && !openid) {
    return fail('获取微信身份失败,请稍后重试', 401)
  }
  
  // 对于 approveTask，必须提供 operatorId 或 openid
  if (action === 'approveTask' && !event.operatorId && !openid) {
    return fail('缺少操作员信息', 401)
  }

  
  try {
    switch (action) {
      case 'submitOrder':
        return await startWorkflow(event.orderType, event.businessData)

      case 'approveTask':
        // 兼容 approveAction 参数，避免参数名冲突
        const actionType = event.approveAction || event.action
        return await approveTask(
          event.taskId,
          actionType,
          event.comment,
          event.operatorId || openid,  // 优先使用传入的 operatorId
          event.operatorName || wxContext.SERVERID || '审批人',
          event.attachments
        )
      
      case 'getMyOrders':
        return await getMyOrders(openid, event.status, event.page, event.pageSize)
      
      case 'getMyTasks':
        return await getMyTasks(openid, event.page, event.pageSize)
      
      case 'getOrderDetail':
        return await getOrderDetail(event.orderId, openid)
      
      case 'supplementOrder':
        return await supplementOrder(event.orderId, openid, event.supplementData, event.comment)
      
      case 'cancelOrder':
        return await cancelOrder(event.orderId, openid)

      case 'terminateOrder':
        return await terminateOrder(event.orderId, openid, event.operatorName, event.reason)

      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常,请稍后重试', 500)
  }
}
