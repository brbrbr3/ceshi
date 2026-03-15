// 工作流模板示例数据
// 可直接导入到 workflow_templates 集合中

const exampleTemplates = [
  // 示例1: 用户注册审批(单步审批)
  {
    name: '用户注册审批',
    code: 'user_registration',
    version: 1,
    description: '新用户注册审批流程,由管理员审批',
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
    createdAt: 1710403200000,
    updatedAt: 1710403200000
  },

  // 示例2: 请假申请审批(多步串行+条件分支)
  {
    name: '请假申请审批',
    code: 'leave_request',
    version: 1,
    description: '员工请假审批流程,根据请假天数走不同路径',
    category: 'request',
    steps: [{
        stepNo: 1,
        stepName: '直属领导审批',
        stepType: 'serial',
        approverType: 'expression',
        approverConfig: {
          expression: 'applicant.leaderId'
        },
        canReject: true,
        canReturn: true,
        returnTo: 0,
        timeout: 24,
        timeoutAction: 'remind'
      },
      {
        stepNo: 2,
        stepName: 'HR审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['hr_manager']
        },
        condition: {
          field: 'days',
          operator: 'gt',
          value: 3
        },
        canReject: true,
        canReturn: true,
        returnTo: 1,
        timeout: 24,
        timeoutAction: 'remind'
      },
      {
        stepNo: 3,
        stepName: '馆领导审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['director']
        },
        condition: {
          field: 'days',
          operator: 'gt',
          value: 7
        },
        canReject: true,
        canReturn: true,
        returnTo: 2,
        timeout: 48,
        timeoutAction: 'escalate'
      }
    ],
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: 1710403200000,
    updatedAt: 1710403200000
  },

  // 示例3: 购车流程(并行审批+会签)
  {
    name: '公务用车申请',
    code: 'car_usage',
    version: 1,
    description: '公务用车申请流程,需要部门和财务同时审批',
    category: 'request',
    steps: [{
        stepNo: 1,
        stepName: '资料审核(会签)',
        stepType: 'parallel',
        parallelConfig: {
          parallelType: 'and', // 会签:所有审批人都通过
          minApprovals: 2
        },
        approverType: 'role',
        approverConfig: {
          roleIds: ['dept_manager', 'finance_manager']
        },
        canReject: true,
        canReturn: true,
        returnTo: 0,
        timeout: 48,
        timeoutAction: 'remind'
      },
      {
        stepNo: 2,
        stepName: '车辆调度',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['driver']
        },
        canReject: true,
        canReturn: false,
        returnTo: 1,
        timeout: 24,
        timeoutAction: 'remind'
      }
    ],
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: 1710403200000,
    updatedAt: 1710403200000
  },

  // 示例4: 采购审批(并行或签)
  {
    name: '采购申请审批',
    code: 'purchase_request',
    version: 1,
    description: '采购申请流程,任一部门负责人审批即可',
    category: 'request',
    steps: [{
        stepNo: 1,
        stepName: '部门审批(或签)',
        stepType: 'parallel',
        parallelConfig: {
          parallelType: 'or', // 或签:一人通过即可
          minApprovals: 1
        },
        approverType: 'role',
        approverConfig: {
          roleIds: ['dept_manager_a', 'dept_manager_b']
        },
        canReject: true,
        canReturn: true,
        returnTo: 0,
        timeout: 24,
        timeoutAction: 'remind'
      },
      {
        stepNo: 2,
        stepName: '财务审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['finance_manager']
        },
        canReject: true,
        canReturn: true,
        returnTo: 1,
        timeout: 48,
        timeoutAction: 'auto_reject'
      }
    ],
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: 1710403200000,
    updatedAt: 1710403200000
  },

  // 示例5: 固定资产采购(复杂流程:并行+条件+回退)
  {
    name: '固定资产采购审批',
    code: 'asset_purchase',
    version: 1,
    description: '固定资产采购审批流程,金额不同审批路径不同',
    category: 'request',
    steps: [{
        stepNo: 1,
        stepName: '部门审批',
        stepType: 'serial',
        approverType: 'expression',
        approverConfig: {
          expression: 'applicant.deptLeaderId'
        },
        canReject: true,
        canReturn: true,
        returnTo: 0,
        timeout: 24,
        timeoutAction: 'remind'
      },
      {
        stepNo: 2,
        stepName: '技术审核',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['tech_director']
        },
        condition: {
          field: 'amount',
          operator: 'gt',
          value: 10000
        },
        canReject: true,
        canReturn: true,
        returnTo: 1,
        timeout: 24,
        timeoutAction: 'remind'
      },
      {
        stepNo: 3,
        stepName: '财务审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['finance_manager']
        },
        canReject: true,
        canReturn: true,
        returnTo: 2,
        timeout: 48,
        timeoutAction: 'remind'
      },
      {
        stepNo: 4,
        stepName: '馆领导审批',
        stepType: 'serial',
        approverType: 'role',
        approverConfig: {
          roleIds: ['director']
        },
        condition: {
          field: 'amount',
          operator: 'gt',
          value: 50000
        },
        canReject: true,
        canReturn: true,
        returnTo: 3,
        timeout: 72,
        timeoutAction: 'escalate'
      }
    ],
    defaultTimeout: 72,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: 1710403200000,
    updatedAt: 1710403200000
  },

  // 示例6: 补充资料流程(支持退回)
  {
    name: '资料补充审批',
    code: 'document_review',
    version: 1,
    description: '资料审核流程,支持退回申请人补充资料',
    category: 'request',
    steps: [{
      stepNo: 1,
      stepName: '初审',
      stepType: 'serial',
      approverType: 'role',
      approverConfig: {
        roleIds: ['reviewer_1']
      },
      canReject: true,
      canReturn: true,
      returnTo: 0, // 退回到申请人
      timeout: 24,
      timeoutAction: 'remind'
    }, {
      stepNo: 2,
      stepName: '复审',
      stepType: 'serial',
      approverType: 'role',
      approverConfig: {
        roleIds: ['reviewer_2']
      },
      canReject: true,
      canReturn: true,
      returnTo: 1, // 退回到上一步
      timeout: 24,
      timeoutAction: 'remind'
    }],
    defaultTimeout: 48,
    notifyOnSubmit: true,
    notifyOnComplete: true,
    notifyOnTimeout: true,
    status: 'active',
    createdAt: 1710403200000,
    updatedAt: 1710403200000
  }
]

// 导出为JSON格式,便于导入数据库
const jsonData = JSON.stringify(exampleTemplates, null, 2)

console.log('示例模板数量:', exampleTemplates.length)
console.log('JSON数据:\n', jsonData)
