/**
 * approval-detail 审批详情弹窗组件
 * 用于展示申请详情、审批历史和操作按钮
 */
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    // 是否显示弹窗
    visible: {
      type: Boolean,
      value: false
    },
    // 申请详情数据
    request: {
      type: Object,
      value: null
    },
    // 工作流日志（审批历史）
    workflowLogs: {
      type: Array,
      value: []
    },
    // 当前用户是否有审批权
    canReview: {
      type: Boolean,
      value: false
    },
    // 当前用户 openid
    currentOpenid: {
      type: String,
      value: ''
    },
    // 操作加载状态
    actionLoading: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 不同申请类型的字段配置
    fieldConfigs: {
      medical_application: [
        { key: 'patientName', label: '就医人姓名' },
        { key: 'relation', label: '与申请人关系' },
        { key: 'medicalDate', label: '就医时间' },
        { key: 'institution', label: '就医机构' },
        { key: 'otherInstitution', label: '机构名称', condition: 'institution === "其他"' },
        { key: 'reasonForSelection', label: '选择此机构的原因', condition: 'institution === "其他"' },
        { key: 'reason', label: '就医原因' }
      ],
      user_registration: [
        { key: 'name', label: '姓名' },
        { key: 'gender', label: '性别' },
        { key: 'birthday', label: '出生日期' },
        { key: 'role', label: '角色' },
        { key: 'department', label: '部门', condition: 'department' },
        { key: 'relativeName', label: '亲属姓名', condition: 'relativeName' },
        { key: 'position', label: '岗位' },
        { key: 'isAdmin', label: '管理员', type: 'boolean' }
      ],
      user_profile_update: [
        { key: 'name', label: '姓名' },
        { key: 'gender', label: '性别' },
        { key: 'birthday', label: '出生日期' },
        { key: 'role', label: '角色' },
        { key: 'department', label: '部门', condition: 'department' },
        { key: 'position', label: '岗位' },
        { key: 'updateReason', label: '修改原因', condition: 'updateReason' }
      ]
    },

    // 状态配置
    statusConfig: {
      approved: { label: '已通过', color: '#16A34A' },
      rejected: { label: '已驳回', color: '#DC2626' },
      terminated: { label: '已中止', color: '#DC2626' },
      pending: { label: '待审批', color: '#D97706' }
    }
  },

  methods: {
    /**
     * 关闭弹窗
     */
    handleClose() {
      this.triggerEvent('close')
    },

    /**
     * 阻止冒泡
     */
    noop() {},

    /**
     * 点击同意
     */
    handleApprove() {
      this.triggerEvent('approve', { decision: 'approve' })
    },

    /**
     * 点击驳回
     */
    handleReject() {
      this.triggerEvent('reject', { decision: 'reject' })
    },

    /**
     * 中止申请
     */
    handleTerminate() {
      this.triggerEvent('terminate')
    },

    /**
     * 复制就医申请
     */
    handleCopyMedical() {
      this.triggerEvent('copyMedical')
    },

    /**
     * 获取状态配置
     */
    getStatusInfo(status) {
      return this.data.statusConfig[status] || this.data.statusConfig.pending
    },

    /**
     * 判断是否显示字段（根据条件）
     */
    shouldShowField(field, request) {
      if (!field.condition) return true
      
      // 简单条件解析
      if (field.condition === 'department') {
        return !!request.department
      }
      if (field.condition === 'relativeName') {
        return !!request.relativeName
      }
      if (field.condition === 'updateReason') {
        return !!request.updateReason
      }
      if (field.condition === 'institution === "其他"') {
        return request.institution === '其他'
      }
      return true
    },

    /**
     * 格式化字段值
     */
    formatFieldValue(field, request) {
      const value = request[field.key]
      
      if (field.type === 'boolean') {
        return value ? '是' : '否'
      }
      
      return value || ''
    }
  }
})
