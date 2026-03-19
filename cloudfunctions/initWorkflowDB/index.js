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
  WORKFLOW_LOGS: 'workflow_logs'
  // 注意：workflow_subscriptions 已移除，订阅消息功能已删除
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
    displayConfig: {
      cardFields: [
        { field: 'name', label: '申请人' },
        { field: 'role', label: '角色' },
        { field: 'department', label: '部门' }
      ],
      detailFields: [
        { field: 'name', label: '申请人姓名' },
        { field: 'gender', label: '性别' },
        { field: 'birthday', label: '生日' },
        { field: 'role', label: '角色' },
        { field: 'position', label: '职位' },
        { field: 'department', label: '部门' },
        { field: 'relativeName', label: '关系人姓名' }
      ]
    },
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  {
    name: '用户信息修改审批',
    code: 'user_profile_update',
    version: 1,
    description: '用户修改个人信息审批流程',
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
      canReturn: true,
      returnTo: 0,
      timeout: 72,
      timeoutAction: 'remind'
    }],
    displayConfig: {
      cardFields: [
        { field: 'userName', label: '申请人' },
        { field: 'modifyFields', label: '修改字段' }
      ],
      detailFields: [
        { field: 'userName', label: '申请人姓名' },
        { field: 'modifyFields', label: '修改字段' },
        { field: 'modifyContent', label: '修改内容' }
      ]
    },
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
    description: '就医申请审批流程（4步：部门负责人→会计主管→馆领导）',
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
    displayConfig: {
      cardFields: [
        { field: 'patientName', label: '就医人' },
        { field: 'relation', label: '关系' }
      ],
      detailFields: [
        { field: 'patientName', label: '就医人姓名' },
        { field: 'relation', label: '与申请人关系' },
        { field: 'institution', label: '就医机构' },
        { field: 'otherInstitution', label: '机构名称', condition: { field: 'institution', value: '其他' } }
      ]
    },
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },

  {
    name: '通知公告发布',
    code: 'notification_publish',
    version: 1,
    description: '发布通知公告（0步审批，直接发布）',
    category: 'approval',
    steps: [],
    defaultTimeout: 72,
    notifyOnSubmit: false,
    notifyOnComplete: false,
    notifyOnTimeout: false,
    status: 'active',
    createdAt: 1757917052000,
    updatedAt: 1757917052000
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
      COLLECTIONS.WORKFLOW_LOGS
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

    const duration = Date.now() - startTime
    console.log(`\n=== 初始化完成，耗时: ${duration}ms ===`)
    
    return {
      code: 0,
      message: '工作流数据库初始化完成',
      data: {
        duration,
        templatesImported: EXAMPLE_TEMPLATES.length,
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
