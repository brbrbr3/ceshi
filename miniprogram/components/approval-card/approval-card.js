/**
 * approval-card 审批列表卡片组件
 * 用于在审批中心列表中展示单个申请条目
 */
Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    // 申请数据对象（经过 mapRequestItem 映射后的数据）
    request: {
      type: Object,
      value: {}
    },
    // 是否显示操作按钮（同意/驳回）
    showActions: {
      type: Boolean,
      value: false
    },
    // 操作加载状态
    actionLoading: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 申请类型图标配置
    approvalTypeIcons: {
      'medical_application': { icon: '🏥', label: '就医申请', color: '#EF4444', bg: '#FEE2E2' },
      'user_registration': { icon: '📝', label: '注册申请', color: '#2563EB', bg: '#EFF6FF' },
      'user_profile_update': { icon: '📝', label: '信息修改', color: '#2563EB', bg: '#EFF6FF' }
    }
  },

  methods: {
    /**
     * 点击卡片
     */
    handleTap() {
      this.triggerEvent('tap', {
        id: this.properties.request.id
      })
    },

    /**
     * 点击同意按钮
     */
    handleApprove(e) {
      this.triggerEvent('approve', {
        id: this.properties.request.id,
        decision: 'approve'
      })
    },

    /**
     * 点击驳回按钮
     */
    handleReject(e) {
      this.triggerEvent('reject', {
        id: this.properties.request.id,
        decision: 'reject'
      })
    }
  }
})
