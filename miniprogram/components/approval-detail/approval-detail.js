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
    // 动画状态
    animVisible: false,

    // 动态计算的字段列表
    detailFields: [],

    // 状态配置
    statusConfig: {
      approved: { label: '已通过', color: '#16A34A' },
      rejected: { label: '已驳回', color: '#DC2626' },
      terminated: { label: '已中止', color: '#DC2626' },
      pending: { label: '待审批', color: '#D97706' }
    }
  },

  observers: {
    'visible': function(visible) {
      if (visible) {
        // 打开：先渲染元素，等待一帧后触发动画
        this.setData({ animVisible: false })
        wx.nextTick(() => {
          this.setData({ animVisible: true })
        })
      } else {
        // 关闭：直接触发关闭动画
        this.setData({ animVisible: false })
      }
    },
    'request': function(request) {
      if (!request) {
        this.setData({ detailFields: [] })
        return
      }
      
      // 使用 displayConfig（来自工作流模板快照）
      const displayConfig = request.displayConfig || request.workflowSnapshot?.displayConfig || null
      let fields = []
      
      if (displayConfig && displayConfig.detailFields && displayConfig.detailFields.length > 0) {
        fields = displayConfig.detailFields.map(f => ({
          field: f.field,
          label: f.label,
          condition: f.condition,
          type: f.type || 'text',
          value: this.formatFieldValueByConfig(f, request)
        }))
      }
      
      // 过滤掉条件不满足的字段
      fields = fields.filter(f => this.shouldShowField(f, request))
      
      this.setData({ detailFields: fields })
    }
  },

  methods: {
    /**
     * 关闭弹窗（带动画）
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
      const condition = field.condition
      if (!condition) return true
      
      // 新格式条件：{ field, op, value } - op 默认为 '=='
      if (typeof condition === 'object') {
        const fieldValue = request[condition.field]
        const op = condition.op || '==' // 向后兼容：op 缺失时默认为 ==
        
        if (op === '==' && fieldValue === condition.value) {
          return true
        }
        if (op === '!=' && fieldValue !== condition.value) {
          return true
        }
        return false
      }
      return true
    },

    /**
     * 格式化字段值（新格式配置）
     */
    formatFieldValueByConfig(fieldConfig, request) {
      const value = request[fieldConfig.field]
      
      if (fieldConfig.type === 'boolean') {
        return value ? '是' : '否'
      }
      
      return value || ''
    }
  }
})
