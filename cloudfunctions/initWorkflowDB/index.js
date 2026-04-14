// 数据库初始化脚本
// 用于创建工作流相关的数据库集合并导入示例数据

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const usersCollection = db.collection('office_users')

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
        { field: 'department', label: '部门', condition: { field: 'department', op: '!=', value: '' } },
        { field: 'position', label: '岗位', condition: { field: 'position', op: '!=', value: '' } },
        { field: 'relativeName', label: '关系人姓名', condition: { field: 'relativeName', op: '!=', value: '' } },
        { field: 'mobile', label: '手机', condition: { field: 'mobile', op: '!=', value: '' } },
        { field: 'landline', label: '座机', condition: { field: 'landline', op: '!=', value: '' } }
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
        { field: 'name', label: '申请人' },
        { field: 'role', label: '角色' },
        { field: 'department', label: '部门' }
      ],
      detailFields: [
        { field: 'name', label: '申请人姓名' },
        { field: 'gender', label: '性别' },
        { field: 'birthday', label: '生日' },
        { field: 'role', label: '角色' },
        { field: 'department', label: '部门', condition: { field: 'department', op: '!=', value: '' } },
        { field: 'position', label: '岗位', condition: { field: 'position', op: '!=', value: '' } },
        { field: 'relativeName', label: '关系人姓名', condition: { field: 'relativeName', op: '!=', value: '' } },
        { field: 'mobile', label: '手机', condition: { field: 'mobile', op: '!=', value: '' } },
        { field: 'landline', label: '座机', condition: { field: 'landline', op: '!=', value: '' } },
        { field: 'updateReason', label: '修改原因' }
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
    version: 2,
    description: '就医申请审批流程（4步：部门负责人→会计主管→馆领导）',
    category: 'approval',
    steps: [
      {
        stepNo: 1,
        stepName: '部门负责人审批',
        stepType: 'serial',
        approverType: 'dept_head',//本部门负责人审批，该类型叫dept_head
        approverConfig: {},
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
        { field: 'medicalDate', label: '就医时间' },
        { field: 'institution', label: '就医机构' },
        { field: 'otherInstitution', label: '机构名称', condition: { field: 'otherInstitution', op: '!=', value: '' } },
        { field: 'reasonForSelection', label: '选择此机构的原因', condition: { field: 'reasonForSelection', op: '!=', value: '' } },
        { field: 'reason', label: '就医原因' }
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
  },

  {
    name: '馆内购车申请审批',
    code: 'car_purchase_application',
    version: 1,
    description: '馆内购车申请审批流程（3步：同部门负责人→办公室部门负责人→馆领导）',
    category: 'approval',
    steps: [
      {
        stepNo: 1,
        stepName: '部门负责人审批',
        stepType: 'serial',
        approverType: 'dept_head',
        approverConfig: {},
        approvalStrategy: 'sequential',
        canReject: true,
        canReturn: false,
        returnTo: 0,
        timeout: 72,
        timeoutAction: 'remind'
      },
      {
        stepNo: 2,
        stepName: '办公室审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['office_dept_head']
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
        { field: 'applicantName', label: '申请人' },
        { field: 'brand', label: '品牌' }
      ],
      detailFields: [
        { field: 'applicantName', label: '姓名' },
        { field: 'applicantDepartment', label: '部门' },
        { field: 'arrivalDate', label: '到馆日期' },
        { field: 'termMonths', label: '本次任期月数' },
        { field: 'position', label: '职别' },
        { field: 'carStandard', label: '对应购车标准（美元）' },
        { field: 'carMinStandard', label: '对应购车最低限额标准（美元）' },
        { field: 'plannedPurchaseDate', label: '拟购车日期' },
        { field: 'saleCompany', label: '售车公司' },
        { field: 'brand', label: '品牌' },
        { field: 'specModel', label: '规格型号' },
        { field: 'displacement', label: '排气量' },
        { field: 'isNewCar', label: '是否新车', type: 'boolean' },
        { field: 'usedTime', label: '已行驶时间', condition: { field: 'isNewCar', op: 'eq', value: false } },
        { field: 'usedMileage', label: '已行驶里程', condition: { field: 'isNewCar', op: 'eq', value: false } },
        { field: 'priceWithShipping', label: '售价（含运费）雷亚尔' },
        { field: 'priceInUSD', label: '折美元' },
        { field: 'isApplyLoan', label: '是否申请购车借款', type: 'boolean' }
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
    name: '馆内购车借款申请审批',
    code: 'car_purchase_loan',
    version: 1,
    description: '馆内购车借款申请审批流程（2步：财务主管→馆领导）',
    category: 'approval',
    steps: [
      {
        stepNo: 1,
        stepName: '财务主管审批',
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
        stepNo: 2,
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
        { field: 'applicantName', label: '申请人' },
        { field: 'carModel', label: '拟购车型' }
      ],
      detailFields: [
        { field: 'applicantName', label: '姓名' },
        { field: 'applicantDepartment', label: '部门' },
        { field: 'arrivalDate', label: '赴任日期' },
        { field: 'position', label: '职别' },
        { field: 'carSubsidy', label: '月购车补贴标准（人民币）' },
        { field: 'termMonths', label: '剩余任期月数' },
        { field: 'totalSubsidy', label: '剩余任期内可享购车补贴金额（人民币）' },
        { field: 'carModel', label: '拟购车型号' },
        { field: 'priceInUSD', label: '拟购车价格（美元）' },
        { field: 'exchangeRate', label: '当月美元人民币比价' },
        { field: 'isFirstResident', label: '是否车改后首次常驻', type: 'boolean' },
        { field: 'borrowableAmount', label: '可借金额（美元）' },
        { field: 'requestedAmount', label: '拟借金额（美元）' }
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
    name: '护照借用审批',
    code: 'passport_application',
    version: 2,
    description: '护照借用审批流程（2步：同部门负责人→馆领导）',
    category: 'approval',
    steps: [
      {
        stepNo: 1,
        stepName: '部门负责人审批',
        stepType: 'serial',
        approverType: 'dept_head',
        approverConfig: {},
        approvalStrategy: 'sequential',
        canReject: true,
        canReturn: false,
        returnTo: 0,
        timeout: 72,
        timeoutAction: 'remind'
      },
      {
        stepNo: 2,
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
        { field: 'borrowerNames', label: '借用的护照' },
        { field: 'borrowDate', label: '借用日期' }
      ],
      detailFields: [
        { field: 'applicantName', label: '申请人'},
        { field: 'borrowerNames', label: '借用的护照' },
        { field: 'borrowDate', label: '借用日期' },
        { field: 'expectedReturnDate', label: '预计归还日期', condition: { field: 'expectedReturnDate', op: '!=', value: '' } },
        { field: 'reason', label: '借用事由' }
      ]
    },
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]

async function assertAdmin(openid) {
  if (!openid) {
    throw new Error('获取微信身份失败，请稍后重试')
  }

  const userRes = await usersCollection.where({
    openid,
    status: 'approved',
    isAdmin: true
  }).limit(1).get()

  if (!userRes.data || userRes.data.length === 0) {
    throw new Error('仅管理员可执行此操作')
  }

  return userRes.data[0]
}

// 初始化集合和导入示例数据
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const startTime = Date.now()
  
  try {
    await assertAdmin(openid)
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
          // 已存在，更新
          await db.collection(COLLECTIONS.WORKFLOW_TEMPLATES)
            .doc(existingRes.data[0]._id)
            .update({
              data: {
                name: template.name,
                description: template.description,
                category: template.category,
                steps: template.steps,
                displayConfig: template.displayConfig,
                defaultTimeout: template.defaultTimeout,
                notifyOnSubmit: template.notifyOnSubmit,
                notifyOnComplete: template.notifyOnComplete,
                notifyOnTimeout: template.notifyOnTimeout,
                status: template.status,
                updatedAt: now
              }
            })
          console.log(`  ✓ 更新模板: ${template.name} (${template.code})`)
        } else {
          // 不存在，创建
          await db.collection(COLLECTIONS.WORKFLOW_TEMPLATES).add({
            data: {
              ...template,
              createdAt: now,
              updatedAt: now
            }
          })
          console.log(`  ✓ 创建模板: ${template.name} (${template.code})`)
        }
      } catch (error) {
        console.log(`  ✗ 处理模板失败: ${template.code}`, error.message)
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
