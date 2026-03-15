// 数据库初始化脚本
// 用于创建工作流相关的数据库集合并导入示例数据

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 集合名称
const COLLECTIONS = {
  WORKFLOW_TEMPLATES: 'workflow_templates',
  WORK_ORDERS: 'work_orders',
  WORKFLOW_TASKS: 'workflow_tasks',
  WORKFLOW_LOGS: 'workflow_logs',
  WORKFLOW_SUBSCRIPTIONS: 'workflow_subscriptions'
}

// 示例模板数据
const EXAMPLE_TEMPLATES = [
  {
    name: '用户注册审批',
    code: 'user_registration',
    version: 1,
    description: '新用户注册审批流程',
    category: 'approval',
    steps: [{
      stepNo: 1,
      stepName: '管理员审批',
      stepType: 'serial',
      approverType: 'role',
      approverConfig: {
        roleIds: ['admin']
      },
      approvalStrategy: 'sequential',
      canReject: true,
      canReturn: false,
      returnTo: 0,
      timeout: 72,
      timeoutAction: 'remind'
    }],
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  {
    name: '就医申请审批',
    code: 'medical_application',
    version: 1,
    description: '就医申请审批流程',
    category: 'approval',
    steps: [
      {
        stepNo: 1,
        stepName: '部门负责人审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['department_head']
        },
        approvalStrategy: 'sequential',
        canReject: true,
        canReturn: false,
        returnTo: 0,
        timeout: 72,
        timeoutAction: 'remind'
      },
      {
        stepNo: 2,
        stepName: '会计主管审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['accountant_supervisor']
        },
        approvalStrategy: 'sequential',
        canReject: true,
        canReturn: false,
        returnTo: 0,
        timeout: 72,
        timeoutAction: 'remind'
      },
      {
        stepNo: 3,
        stepName: '馆领导审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['library_leader']
        },
        approvalStrategy: 'sequential',
        canReject: true,
        canReturn: false,
        returnTo: 0,
        timeout: 72,
        timeoutAction: 'remind'
      }
    ],
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]

// 示例订阅消息配置
const EXAMPLE_SUBSCRIPTIONS = [
  {
    templateId: 'task_assigned_template',
    notifyType: 'task_assigned',
    orderType: '',
    pagePath: '/pages/workflow/task-detail/task-detail',
    dataMapping: {
      thing1: '审批任务',
      thing2: '任务名称',
      time3: '截止时间',
      phrase4: '待审批'
    },
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    templateId: 'task_completed_template',
    notifyType: 'task_completed',
    orderType: '',
    pagePath: '/pages/workflow/order-detail/order-detail',
    dataMapping: {
      thing1: '审批结果',
      thing2: '审批意见',
      time3: '完成时间',
      phrase4: '已完成'
    },
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    templateId: 'task_timeout_template',
    notifyType: 'task_timeout',
    orderType: '',
    pagePath: '/pages/workflow/task-detail/task-detail',
    dataMapping: {
      thing1: '任务超时',
      thing2: '截止时间',
      time3: '超时时间',
      phrase4: '请及时处理'
    },
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    templateId: 'process_returned_template',
    notifyType: 'process_returned',
    orderType: '',
    pagePath: '/pages/workflow/order-detail/order-detail',
    dataMapping: {
      thing1: '流程退回',
      thing2: '退回原因',
      time3: '退回时间',
      phrase4: '需补充资料'
    },
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]

// 初始化集合和导入示例数据
exports.main = async (event, context) => {
  const startTime = Date.now()
  
  try {
    console.log('=== 开始初始化工作流数据库 ===')
    
    // 1. 创建集合（如果不存在）
    console.log('步骤1: 检查/创建数据库集合')
    const collectionsToCheck = [
      COLLECTIONS.WORKFLOW_TEMPLATES,
      COLLECTIONS.WORK_ORDERS,
      COLLECTIONS.WORKFLOW_TASKS,
      COLLECTIONS.WORKFLOW_LOGS,
      COLLECTIONS.WORKFLOW_SUBSCRIPTIONS
    ]
    
    for (const collectionName of collectionsToCheck) {
      try {
        // 尝试查询集合，如果不存在会报错，忽略
        await db.collection(collectionName).limit(1).get()
        console.log(`  ✓ 集合 ${collectionName} 已存在`)
      } catch (error) {
        if (error.errCode === 'DATABASE_COLLECTION_NOT_EXIST') {
          console.log(`  ✗ 集合 ${collectionName} 不存在，需要在控制台手动创建`)
        } else {
          console.log(`  ✓ 集合 ${collectionName} 存在`)
        }
      }
    }
    
    // 2. 导入示例模板数据
    console.log('步骤2: 导入示例工作流模板')
    const now = Date.now()
    
    for (const template of EXAMPLE_TEMPLATES) {
      try {
        // 检查模板是否已存在
        const existingRes = await db.collection(COLLECTIONS.WORKFLOW_TEMPLATES)
          .where({
            code: template.code,
            version: template.version
          })
          .limit(1)
          .get()
        
        if (existingRes.data && existingRes.data.length > 0) {
          console.log(`  - 模板 ${template.code} v${template.version} 已存在，跳过`)
        } else {
          await db.collection(COLLECTIONS.WORKFLOW_TEMPLATES).add({
            data: {
              ...template,
              createdAt: now,
              updatedAt: now
            }
          })
          console.log(`  ✓ 导入模板: ${template.name} (${template.code})`)
        }
      } catch (error) {
        console.log(`  ✗ 导入模板失败: ${template.code}`, error.message)
      }
    }
    
    // 3. 导入示例订阅配置
    console.log('步骤3: 导入示例订阅消息配置')
    for (const sub of EXAMPLE_SUBSCRIPTIONS) {
      try {
        // 检查配置是否已存在
        const existingRes = await db.collection(COLLECTIONS.WORKFLOW_SUBSCRIPTIONS)
          .where({
            templateId: sub.templateId
          })
          .limit(1)
          .get()
        
        if (existingRes.data && existingRes.data.length > 0) {
          console.log(`  - 订阅配置 ${sub.templateId} 已存在，跳过`)
        } else {
          await db.collection(COLLECTIONS.WORKFLOW_SUBSCRIPTIONS).add({
            data: {
              ...sub,
              createdAt: now,
              updatedAt: now
            }
          })
          console.log(`  ✓ 导入订阅配置: ${sub.notifyType}`)
        }
      } catch (error) {
        console.log(`  ✗ 导入订阅配置失败: ${sub.notifyType}`, error.message)
      }
    }
    
    const duration = Date.now() - startTime
    console.log(`\n=== 初始化完成，耗时: ${duration}ms ===`)
    
    return {
      code: 0,
      message: '工作流数据库初始化完成',
      data: {
        duration,
        templatesImported: EXAMPLE_TEMPLATES.length,
        subscriptionsImported: EXAMPLE_SUBSCRIPTIONS.length,
        collectionsChecked: collectionsToCheck.length
      }
    }
    
  } catch (error) {
    console.error('初始化失败:', error)
    return {
      code: -1,
      message: error.message || '初始化失败',
      data: null
    }
  }
}
