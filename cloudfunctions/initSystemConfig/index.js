// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 系统配置初始化脚本
 * 将所有常量写入 sys_config 集合
 */

// 系统配置数据
const SYSTEM_CONFIGS = [
  // ==================== 角色相关 ====================
  {
    type: 'role',
    key: 'ROLE_OPTIONS',
    value: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],
    description: '角色选项列表',
    sort: 1
  },
  {
    type: 'role',
    key: 'ROLE_POSITION_MAP',
    value: {
      '工勤': ['会计', '招待员', '厨师'],
      '配偶': ['无']
    },
    description: '角色-岗位映射关系',
    sort: 2
  },
  {
    type: 'role',
    key: 'NEED_DEPARTMENT_ROLES',
    value: ['部门负责人', '馆员', '工勤'],
    description: '需要填写部门的角色列表',
    sort: 3
  },
  {
    type: 'role',
    key: 'NEED_RELATIVE_ROLES',
    value: ['配偶', '家属'],
    description: '需要填写亲属信息的角色列表',
    sort: 4
  },
  {
    type: 'role',
    key: 'DEFAULT_ROLE',
    value: '馆员',
    description: '默认角色',
    sort: 5
  },

  // ==================== 岗位相关 ====================
  {
    type: 'position',
    key: 'POSITION_OPTIONS',
    value: ['无', '会计主管', '会计', '招待员', '厨师'],
    description: '岗位选项列表',
    sort: 10
  },
  {
    type: 'position',
    key: 'DEFAULT_POSITION',
    value: '无',
    description: '默认岗位',
    sort: 11
  },

  // ==================== 部门相关 ====================
  {
    type: 'department',
    key: 'DEPARTMENT_OPTIONS',
    value: ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', '党委办'],
    description: '部门选项列表',
    sort: 20
  },
  {
    type: 'department',
    key: 'DEFAULT_DEPARTMENT',
    value: '',
    description: '默认部门',
    sort: 21
  },
  {
    type: 'department',
    key: 'WORKER_DEPARTMENT',
    value: '办公室',
    description: '工勤人员固定部门',
    sort: 22
  },

  // ==================== 性别相关 ====================
  {
    type: 'gender',
    key: 'GENDER_OPTIONS',
    value: ['男', '女'],
    description: '性别选项列表',
    sort: 30
  },
  {
    type: 'gender',
    key: 'DEFAULT_GENDER',
    value: '男',
    description: '默认性别',
    sort: 31
  },

  // ==================== 请求状态 ====================
  {
    type: 'request_status',
    key: 'REQUEST_STATUS',
    value: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      TERMINATED: 'terminated'
    },
    description: '请求状态枚举',
    sort: 40
  },
  {
    type: 'request_status',
    key: 'REQUEST_STATUS_TEXT',
    value: {
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回',
      terminated: '已中止'
    },
    description: '请求状态文本映射',
    sort: 41
  },
  {
    type: 'request_status',
    key: 'REQUEST_STATUS_STYLE',
    value: {
      pending: { color: '#D97706', bg: '#FEF3C7' },
      approved: { color: '#16A34A', bg: '#DCFCE7' },
      rejected: { color: '#DC2626', bg: '#FEE2E2' },
      terminated: { color: '#DC2626', bg: '#FEE2E2' }
    },
    description: '请求状态样式配置',
    sort: 42
  },

  // ==================== 工作流状态 ====================
  {
    type: 'workflow',
    key: 'TASK_STATUS',
    value: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      CANCELLED: 'cancelled',
      RETURNED: 'returned'
    },
    description: '工作流任务状态',
    sort: 50
  },
  {
    type: 'workflow',
    key: 'ORDER_STATUS',
    value: {
      PENDING: 'pending',
      SUPPLEMENT: 'supplement',
      COMPLETED: 'completed',
      REJECTED: 'rejected',
      CANCELLED: 'cancelled',
      TERMINATED: 'terminated'
    },
    description: '工作流工单状态',
    sort: 51
  },
  {
    type: 'workflow',
    key: 'STEP_TYPE',
    value: {
      SERIAL: 'serial',
      PARALLEL: 'parallel',
      CONDITION: 'condition'
    },
    description: '工作流步骤类型',
    sort: 52
  },
  {
    type: 'workflow',
    key: 'APPROVER_TYPE',
    value: {
      USER: 'user',
      ROLE: 'role',
      DEPT: 'dept',
      EXPRESSION: 'expression'
    },
    description: '审批人类型',
    sort: 53
  },
  {
    type: 'workflow',
    key: 'TIMEOUT_ACTION',
    value: {
      AUTO_APPROVE: 'auto_approve',
      AUTO_REJECT: 'auto_reject',
      ESCALATE: 'escalate',
      REMIND: 'remind'
    },
    description: '超时处理动作',
    sort: 54
  },
  {
    type: 'workflow',
    key: 'MEDICAL_APPROVAL_STEPS',
    value: [
      { stepNo: 1, stepName: '部门负责人审批', roleId: 'department_head' },
      { stepNo: 2, stepName: '会计主管审批', roleId: 'accountant_supervisor' },
      { stepNo: 3, stepName: '馆领导审批', roleId: 'library_leader' }
    ],
    description: '就医申请审批步骤',
    sort: 55
  },

  // ==================== 时区配置 ====================
  {
    type: 'timezone',
    key: 'TIMEZONE_OFFSET',
    value: -3,
    description: '时区偏移量（小时，相对于 UTC）',
    sort: 60
  },
  {
    type: 'timezone',
    key: 'TIMEZONE_NAME',
    value: 'America/Sao_Paulo',
    description: '时区名称',
    sort: 61
  },

  // ==================== 集合名称 ====================
  {
    type: 'collection',
    key: 'COLLECTIONS',
    value: {
      WORKFLOW_TEMPLATES: 'workflow_templates',
      WORK_ORDERS: 'work_orders',
      WORKFLOW_TASKS: 'workflow_tasks',
      WORKFLOW_LOGS: 'workflow_logs',
      WORKFLOW_SUBSCRIPTIONS: 'workflow_subscriptions',
      USERS: 'office_users',
      SYS_CONFIG: 'sys_config'
    },
    description: '数据库集合名称',
    sort: 70
  }
]

// 初始化系统配置
exports.main = async (event, context) => {
  const startTime = Date.now()
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: []
  }

  try {
    console.log('=== 开始初始化系统配置 ===')
    console.log(`共 ${SYSTEM_CONFIGS.length} 项配置`)

    const now = Date.now()

    for (const config of SYSTEM_CONFIGS) {
      try {
        // 检查配置是否已存在
        const existingRes = await db.collection('sys_config')
          .where({
            type: config.type,
            key: config.key
          })
          .limit(1)
          .get()

        if (existingRes.data && existingRes.data.length > 0) {
          // 已存在，更新
          await db.collection('sys_config')
            .doc(existingRes.data[0]._id)
            .update({
              data: {
                value: config.value,
                description: config.description,
                sort: config.sort,
                updatedAt: now
              }
            })
          console.log(`  ✓ 更新配置: ${config.key}`)
          results.success++
        } else {
          // 不存在，创建
          await db.collection('sys_config').add({
            data: {
              ...config,
              createdAt: now,
              updatedAt: now
            }
          })
          console.log(`  ✓ 创建配置: ${config.key}`)
          results.success++
        }
      } catch (error) {
        console.error(`  ✗ 配置 ${config.key} 处理失败:`, error.message)
        results.failed++
        results.errors.push({
          key: config.key,
          error: error.message
        })
      }
    }

    const duration = Date.now() - startTime
    console.log(`\n=== 初始化完成 ===`)
    console.log(`成功: ${results.success}, 跳过: ${results.skipped}, 失败: ${results.failed}`)
    console.log(`耗时: ${duration}ms`)

    return {
      code: 0,
      message: '系统配置初始化完成',
      data: {
        duration,
        total: SYSTEM_CONFIGS.length,
        ...results
      }
    }

  } catch (error) {
    console.error('初始化失败:', error)
    return {
      code: -1,
      message: error.message || '初始化失败',
      data: results
    }
  }
}
