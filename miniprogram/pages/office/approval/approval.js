const app = getApp()
const paginationBehavior = require('../../../behaviors/pagination.js')
const utils = require('../../../common/utils.js')

// 审批类型图标配置（静态配置）
const approvalTypeIcons = {
  'medical_application': { icon: '🏥', label: '就医申请', color: '#EF4444', bg: '#FEE2E2' },
  'user_registration': { icon: '📝', label: '注册申请', color: '#2563EB', bg: '#EFF6FF' },
  'user_profile_update': { icon: '📝', label: '信息修改', color: '#2563EB', bg: '#EFF6FF' },
  'car_purchase_application': { icon: '🚗', label: '购车申请', color: '#0891B2', bg: '#ECFEFF' },
  'car_purchase_loan': { icon: '💰', label: '购车借款', color: '#D97706', bg: '#FEF3C7' },
  'passport_application': { icon: '📕', label: '护照借用', color: '#7C3AED', bg: '#F3E8FF' }
}

// 角色图标配置（静态配置）
const roleIcons = {
  '馆领导': { icon: '👔', color: '#7C3AED', bg: '#F3E8FF' },
  '部门负责人': { icon: '🏛️', color: '#0891B2', bg: '#E0F2FE' },
  '馆员': { icon: '📚', color: '#059669', bg: '#D1FAE5' },
  '工勤': { icon: '🧰', color: '#EA580C', bg: '#FFEDD5' },
  '物业': { icon: '🏘️', color: '#DB2777', bg: '#FCE7F3' },
  '配偶': { icon: '💞', color: '#DC2626', bg: '#FEE2E2' },
  '家属': { icon: '👪', color: '#4F46E5', bg: '#E0E7FF' }
}

// 动态生成的审批类型列表
let approvalTypes = [
  { icon: '🏥', label: '就医申请', color: '#EF4444', bg: '#FEE2E2' },
  { icon: '📝', label: '注册申请', color: '#2563EB', bg: '#EFF6FF' }
]

// 全局常量缓存
let systemConstants = null

// 使用统一的时间格式化函数（立即初始化默认值，避免异步加载前被调用时报错）
let formatRelativeTime = (timestamp) => utils.formatRelativeTime(timestamp, -3)
let formatDateTime = (timestamp) => utils.formatDateTime(timestamp, -3)

function getStatusMeta(status) {
  if (status === 'approved') {
    return { label: '已通过', statusColor: '#16A34A', statusBg: '#DCFCE7' }
  }
  if (status === 'rejected') {
    return { label: '已驳回', statusColor: '#DC2626', statusBg: '#FEE2E2' }
  }
  if (status === 'terminated') {
    return { label: '已中止', statusColor: '#DC2626', statusBg: '#FEE2E2' }
  }
  return { label: '待审批', statusColor: '#D97706', statusBg: '#FEF3C7' }
}

function getAvatarColor(text) {
  const colors = ['#2563EB', '#059669', '#7C3AED', '#EA580C', '#DB2777', '#0891B2']
  if (!text) {
    return colors[0]
  }
  const code = text.charCodeAt(0)
  return colors[code % colors.length]
}

// 计算工作流进度（从工单数据获取步骤信息）
function calculateMedicalProgress(currentStep, totalSteps, stepNames) {
  if (!currentStep) {
    return { percent: 0, currentText: '等待提交' }
  }
  
  const steps = totalSteps || 3
  const percent = Math.min(Math.floor((currentStep / steps) * 100), 100)
  
  const currentText = stepNames ? 
    (stepNames[currentStep - 1] || '进行中') : 
    '进行中'
  
  return {
    percent,
    currentText,
    currentStep,
    totalSteps: steps
  }
}

function mapRequestItem(request) {
  const statusMeta = getStatusMeta(request.status)
  const avatar = request.avatarText || (request.name ? request.name.slice(0, 1) : '智')

  // 根据申请类型生成不同的详情
  let detail = ''
  let requestType = request.requestType || 'XX申请'

  // 从工单数据获取工作流步骤信息
  const workflowSnapshot = request.workflowSnapshot || {}
  const workflowSteps = workflowSnapshot.steps || request.steps || []
  const totalSteps = workflowSteps.length

  // 从 displayConfig 动态生成 detail（如果配置存在）
  const displayConfig = request.displayConfig || workflowSnapshot.displayConfig || null

  if (displayConfig && displayConfig.cardFields && displayConfig.cardFields.length > 0) {
    // 动态生成 detail
    const detailParts = []
    for (const fieldConfig of displayConfig.cardFields) {
      // 检查条件是否满足
      if (fieldConfig.condition) {
        const cond = fieldConfig.condition
        const fieldValue = request[cond.field]
        const op = cond.op || '==' // 向后兼容：op 缺失时默认为 ==
        let shouldShow = false

        if (op === '==' && fieldValue === cond.value) {
          shouldShow = true
        } else if (op === '!=' && fieldValue !== cond.value) {
          shouldShow = true
        }

        if (!shouldShow) continue
      }

      const value = request[fieldConfig.field]
      if (value !== undefined && value !== null && value !== '') {
        detailParts.push(`${fieldConfig.label}：${value}`)
      }
    }
    detail = detailParts.join(' · ')
  } 
  else {
    wx.showModal({
      title: '提示',
      content: '动态渲染失败，请开发者检查代码',
      showCancel: false,
      confirmText: '好的'
    })
  }

  // 动态判断是否显示进度条：待审批状态 + 工作流步骤>=2 + 有当前步骤信息
  const showProgress = request.status === 'pending' && totalSteps >= 2 && request.currentStep

  // 生成审批备注信息
  let reviewRemark = request.reviewRemark || ''
  if (request.status === 'approved' || request.status === 'rejected' || request.status === 'terminated') {
    const actionText = request.status === 'approved' ? '批准' : (request.status === 'rejected' ? '驳回' : '中止')
    const reviewedBy = request.reviewedBy || ''
    const reviewedTime = request.reviewedAt ? formatDateTime(request.reviewedAt) : ''

    // 特殊处理中止状态
    if (request.status === 'terminated') {
      // 优先判断是否系统中止
      if (reviewedBy === '系统') {
        // 系统自动中止（因下一步骤未找到审批人）
        reviewRemark = `因下一步骤未找到审批人，系统于${reviewedTime}自动中止该申请`
      } else {
        // 判断是否申请人自行中止
        const applicantOpenid = request.openid || ''
        const currentOpenid = app.globalData.openid || ''
        const isApplicantTerminated = applicantOpenid === currentOpenid || reviewedBy === request.name

        if (isApplicantTerminated) {
          const applicantInfo = `申请人${request.name}已于${reviewedTime}自行中止该申请`
          if (reviewRemark) {
            reviewRemark = `${applicantInfo}，原因：${reviewRemark}`
          } else {
            reviewRemark = applicantInfo
          }
        } else {
          // 其他人中止
          let approverRole = '审批人'
          const currentStep = request.currentStep || 0
          if (workflowSteps[currentStep - 1]) {
            approverRole = workflowSteps[currentStep - 1].stepName || '审批人'
          }

          const rolePrefix = reviewedBy.includes('管理员') || reviewedBy.includes('部门负责人') || reviewedBy.includes('会计主管') || reviewedBy.includes('馆领导') ? '' : approverRole
          const approvalInfo = `${rolePrefix}${reviewedBy}已于${reviewedTime}中止该申请`

          if (reviewRemark) {
            reviewRemark = `${approvalInfo}，原因：${reviewRemark}`
          } else {
            reviewRemark = approvalInfo
          }
        }
      }
    } else {
      // 统一使用工作流步骤数据获取审批人角色（不再硬编码判断申请类型）
      let approverRole = '审批人'
      const currentStep = request.currentStep || 0
      if (workflowSteps[currentStep - 1]) {
        approverRole = workflowSteps[currentStep - 1].stepName || '审批人'
      }

      const rolePrefix = reviewedBy.includes('管理员') || reviewedBy.includes('部门负责人') || reviewedBy.includes('会计主管') || reviewedBy.includes('馆领导') ? '' : approverRole
      const approvalInfo = `${rolePrefix}${reviewedBy}已于${reviewedTime}${actionText}该申请`

      if (reviewRemark) {
        reviewRemark = `${approvalInfo}，原因：${reviewRemark}`
      } else {
        reviewRemark = approvalInfo
      }
    }
  }

  // 计算进度（使用已提取的工作流步骤信息）
  let progress = null
  if (showProgress) {
    const stepNames = workflowSteps.map(s => s.stepName)
    progress = calculateMedicalProgress(request.currentStep, totalSteps, stepNames)
  }

  return {
    id: request._id,
    requestNo: request.requestNo,
    name: request.name,
    dept: request.dept || '',
    detail: detail,
    requestType: requestType,
    orderType: request.orderType,
    status: request.status,
    statusLabel: statusMeta.label,
    statusColor: statusMeta.statusColor,
    statusBg: statusMeta.statusBg,
    avatar,
    avatarColor: getAvatarColor(avatar),
    time: formatRelativeTime(request.updatedAt || request.submittedAt),
    urgent: !!request.isAdmin,
    raw: request,
    reviewRemark: reviewRemark,
    showProgress: showProgress,
    progress: progress,
    openid: request.openid || '',
    orderId: request.orderId || request._id,
    _id: request._id,
    taskId: request.taskId,
    isCurrentApprover: request.isCurrentApprover,
    displayConfig: displayConfig,
    // 展开原始 request 的所有字段，支持动态 displayConfig 访问
    // 这样 passport_application 的 borrowerNames、borrowDate 等字段也能被访问到
    ...request
  }
}

Page({
  behaviors: [paginationBehavior],
  data: {
    loading: true,
    actionLoading: false,
    canReview: false,
    activeTab: '', // 将在 loadApprovalData 中根据权限动态设置
    approvalTypes,
    tabs: [], // 将在 loadApprovalData 中动态生成
    // 审批tab配置常量（从云函数加载）
    approvalTabs: [
      { key: 'pending', label: '待审批' },
      { key: 'mine', label: '我发起的' },
      { key: 'done', label: '已处理' }
    ],
    approvalTabPermission: {
      withReview: ['pending', 'mine', 'done'],
      withoutReview: ['mine']
    },
    summary: {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0
    },
    tabCounts: { mine: 0, pending: 0, done: 0 },
    _countsLoaded: false, // 是否已加载过总数（用于控制tab badge只在首次进入时更新）
    pendingList: [],
    mineList: [],
    doneList: [],
    currentList: [],
    emptyText: '暂无申请',
    showDetail: false,
    selectedRequest: null,
    currentUser: null,
    workflowLogs: [],
    currentOpenid: '',
    
    pagination: {
      pending: { page: 1, hasMore: true, loading: false },
      mine: { page: 1, hasMore: true, loading: false },
      done: { page: 1, hasMore: true, loading: false }
    },

    // 常量数据
    roleOptions: null
  },

  async onLoad() {
    // 初始化每个 tab 的分页配置
    this.initPagination({
      initialPageSize: 10,
      loadMorePageSize: 10
    })
    
    // 加载常量
    await this.loadConstants()
    
    // 加载数据
    this.loadApprovalData()
  },
  
  async loadConstants() {
    try {
      // 获取常量
      const allConstants = await app.getAllConstants()
      systemConstants = allConstants
      
      // 设置时间格式化函数（使用新的同步函数）
      const timezoneOffset = allConstants.TIMEZONE_OFFSET || -3
      formatRelativeTime = (timestamp) => utils.formatRelativeTime(timestamp, timezoneOffset)
      formatDateTime = (timestamp) => utils.formatDateTime(timestamp, timezoneOffset)

      // 更新 approvalTypes
      const roleOptions = allConstants.roles || []
      if (roleOptions.length > 0) {
        approvalTypes = [
          { icon: '🏥', label: '就医申请', color: '#EF4444', bg: '#FEE2E2' },
          { icon: '📝', label: '注册申请', color: '#2563EB', bg: '#EFF6FF' },
          ...roleOptions.map(role => ({
            icon: roleIcons[role]?.icon || '👤',
            label: role,
            color: roleIcons[role]?.color || '#6B7280',
            bg: roleIcons[role]?.bg || '#F3F4F6'
          }))
        ]
      }
      
      // 获取审批中心tab配置
      const approvalTabs = allConstants.APPROVAL_TABS || [
        { key: 'pending', label: '待审批' },
        { key: 'mine', label: '我发起的' },
        { key: 'done', label: '已处理' }
      ]
      const approvalTabPermission = allConstants.APPROVAL_TAB_PERMISSION || {
        withReview: ['pending', 'mine', 'done'],
        withoutReview: ['mine']
      }
      
      // 保存常量到 data
      this.setData({
        approvalTypes,
        roleOptions: roleOptions,
        approvalTabs,
        approvalTabPermission
      })
      
    } catch (error) {
      console.error('加载常量失败:', error)
      // 使用默认值
      formatRelativeTime = (timestamp) => utils.formatRelativeTime(timestamp, -3)
      formatDateTime = (timestamp) => utils.formatDateTime(timestamp, -3)
      this.setData({
        approvalTabs: [
          { key: 'pending', label: '待审批' },
          { key: 'mine', label: '我发起的' },
          { key: 'done', label: '已处理' }
        ],
        approvalTabPermission: {
          withReview: ['pending', 'mine', 'done'],
          withoutReview: ['mine']
        }
      })
    }
  },

  /**
   * 根据权限动态生成tabs
   * @param {boolean} canReview - 是否有审批权限
   * @returns {Array} tab列表
   */
  generateTabs(canReview) {
    const { approvalTabs, approvalTabPermission } = this.data
    const permissionKey = canReview ? 'withReview' : 'withoutReview'
    const allowedKeys = approvalTabPermission[permissionKey] || ['mine']
    return approvalTabs.filter(tab => allowedKeys.includes(tab.key))
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
  if (this.data.fontStyle !== fontStyle) {
    this.setData({ fontStyle })
  }
    // 检查是否有跳转目标（从消息中心或申请提交跳转过来）
    const targetTab = app.globalData.targetApprovalTab
    if (targetTab) {
      // 清除全局变量
      app.globalData.targetApprovalTab = null
      // 设置目标tab
      this.setData({
        activeTab: targetTab
      })
    }

    // 每次进入页面都刷新数据
    wx.showLoading({
      title: '加载中',
      mask: true
    })

    // 重置所有 tab 的分页状态和计数标志
    this.setData({
      currentList: [],
      loading: true,
      _countsLoaded: false,
      'pagination.pending.page': 1,
      'pagination.pending.hasMore': true,
      'pagination.mine.page': 1,
      'pagination.mine.hasMore': true,
      'pagination.done.page': 1,
      'pagination.done.hasMore': true
    })

    this.loadApprovalData(false).finally(() => {
      wx.hideLoading()
    })
  },

  getListByTab(tab, lists) {
    if (tab === 'mine') {
      return lists.mineList
    }
    if (tab === 'done') {
      return lists.doneList
    }
    return lists.pendingList
  },

  getEmptyText(tab, canReview) {
    if (tab === 'mine') {
      return '暂无我发起的申请'
    }
    if (tab === 'done') {
      return '暂无已处理申请'
    }
    return '暂无待审批申请'
  },

  loadApprovalData(loadMore = false, forceTab = null) {
    // 优先使用传入的 forceTab（避免 setData 异步导致读到旧值）
    const activeTab = forceTab || this.data.activeTab || 'mine'
    const { page, loading } = this.data.pagination[activeTab] || { page: 1, loading: false }

    if (loading && loadMore) {
      return Promise.resolve()
    }

    if (loadMore && !this.data.pagination[activeTab]?.hasMore) {
      return Promise.resolve()
    }

    this.setData({
      loading: true,
      currentOpenid: app.globalData.openid || '',
      [`pagination.${activeTab}.loading`]: true
    })

    const currentPage = loadMore ? (page || 1) : 1
    const pageSize = 10

    return app.callOfficeAuth('getApprovalData', {
      page: currentPage,
      pageSize: pageSize
    })
      .then((data) => {
        const pendingList = (data.pendingList || []).map(r => mapRequestItem(r))
        const mineList = (data.mineList || []).map(r => mapRequestItem(r))
        const doneList = (data.doneList || []).map(r => mapRequestItem(r))
        const canReview = !!data.canReview

        // 确定当前激活的tab（只在非 loadMore 时允许调整）
        let targetTab = activeTab
        let newCounts = this.data.tabCounts
        // 只在页面首次进入（_countsLoaded=false）时从后端获取并缓存总数
        if (!this.data._countsLoaded && data.counts) {
          newCounts = data.counts
        }
        if (!loadMore) {
          // 验证当前tab是否合法
          const tabs = this.generateTabs(canReview)
          const allowedKeys = tabs.map(t => t.key)
          if (!targetTab || !allowedKeys.includes(targetTab)) {
            targetTab = allowedKeys[0] || 'mine'
          }
        }

        // 动态生成tabs（count 始终用缓存值）
        const tabs = this.generateTabs(canReview).map(tab => ({
          ...tab,
          count: newCounts && newCounts[tab.key] !== undefined
            ? newCounts[tab.key]
            : 0
        }))

        const paginationInfo = data.pagination || {}
        const hasMoreInfo = paginationInfo.hasMore || {}

        let newLists = { pendingList: this.data.pendingList, mineList: this.data.mineList, doneList: this.data.doneList }

        if (!loadMore) {
          // 首次加载/切换tab：替换整个列表
          newLists = { pendingList, mineList, doneList }
        } else {
          // 触底加载：只追加当前tab的列表
          newLists[activeTab + 'List'] = [...this.data[activeTab + 'List'], ...(activeTab === 'pending' ? pendingList : (activeTab === 'mine' ? mineList : doneList))]
        }

        // 更新数据——始终用 activeTab（调用方的tab），不用 finalActiveTab
        this.setData({
          canReview,
          currentUser: data.currentUser,
          ...(!loadMore ? { summary: data.summary || this.data.summary, tabCounts: newCounts, activeTab: targetTab, _countsLoaded: true } : {}),
          ...newLists,
          tabs,
          currentList: this.getListByTab(activeTab, newLists),
          emptyText: this.getEmptyText(activeTab, canReview),
          loading: false,
          // 分页状态写入正确的tab
          // 非loadMore时，已加载完第1页，下次loadMore应请求第2页，所以存为2
          [`pagination.${activeTab}.page`]: loadMore ? (currentPage + 1) : 2,
          [`pagination.${activeTab}.hasMore`]: hasMoreInfo[activeTab + 'List'] !== undefined
            ? hasMoreInfo[activeTab + 'List']
            : (activeTab === 'pending' ? pendingList.length >= pageSize : (activeTab === 'mine' ? mineList.length >= pageSize : doneList.length >= pageSize)),
          [`pagination.${activeTab}.loading`]: false
        })
      })
      .catch((error) => {
        utils.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })
        this.setData({
          loading: false,
          [`pagination.${activeTab}.loading`]: false
        })
      })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab

    this.setData({
      activeTab: tab,
      currentList: [],
      loading: true
    })

    wx.showLoading({
      title: '加载中',
      mask: true
    })

    this.setData({
      [`pagination.${tab}.page`]: 1,
      [`pagination.${tab}.hasMore`]: true
    })

    // 直接传入 tab，避免 setData 异步导致 activeTab 未更新
    this.loadApprovalData(false, tab).finally(() => {
      wx.hideLoading()
    })
  },

  onReachBottom() {
    this.loadApprovalData(true)
  },

  onPullDownRefresh() {
    const activeTab = this.data.activeTab
    this.setData({
      [`pagination.${activeTab}.page`]: 1,
      [`pagination.${activeTab}.hasMore`]: true
    })
    this.loadApprovalData(false).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadWorkflowLogs(orderId) {
    if (!orderId) {
      return
    }

    app.callOfficeAuth('getWorkflowLogs', { orderId })
      .then((data) => {
        const formattedLogs = (data || []).map(log => ({
          ...log,
          formattedTime: formatDateTime(log.createdAt)
        }))

        this.setData({
          workflowLogs: formattedLogs
        })
      })
      .catch((error) => {
        console.error('加载工作流日志失败:', error)
        this.setData({
          workflowLogs: []
        })
      })
  },

  closeDetail() {
    this.setData({
      showDetail: false,
      selectedRequest: null
    })
  },

  /**
   * 列表卡片组件事件：点击卡片
   */
  openRequestDetail(e) {
    const requestId = e.detail ? e.detail.id : e.currentTarget.dataset.id
    const target = (this.data.currentList || []).find((item) => item.id === requestId)
    if (!target) {
      return
    }

    this.setData({
      selectedRequest: target,
      showDetail: true
    })

    const orderId = target.orderId || target._id
    this.loadWorkflowLogs(orderId)
  },

  /**
   * 列表卡片组件事件：同意
   */
  handleCardApprove(e) {
    const itemId = e.detail.id
    this.processCardReview(itemId, 'approve')
  },

  /**
   * 列表卡片组件事件：驳回
   */
  handleCardReject(e) {
    const itemId = e.detail.id
    this.processCardReview(itemId, 'reject')
  },

  /**
   * 处理列表卡片审批
   */
  processCardReview(itemId, decision) {
    if (!this.data.canReview || this.data.actionLoading) {
      return
    }

    const target = (this.data.currentList || []).find((item) => item.id === itemId)
    if (!target) {
      utils.showToast({
        title: '未找到申请记录',
        icon: 'none'
      })
      return
    }

    // 设置 selectedRequest 并执行审批
    this.setData({
      selectedRequest: {
        ...target.raw,
        reviewRemark: target.reviewRemark
      }
    })

    this.confirmReview(decision)
  },

  /**
   * 详情弹窗组件事件：同意
   */
  handleDetailApprove() {
    this.confirmReview('approve')
  },

  /**
   * 详情弹窗组件事件：驳回
   */
  handleDetailReject() {
    this.confirmReview('reject')
  },

  showLaunchTip() {
    wx.showToast({
      title: this.data.canReview ? '当前页面用于审批用户的申请' : '当前账号仅可查看自己的申请状态',
      icon: 'none'
    })
  },

  copyAndResubmitMedical() {
    const request = this.data.selectedRequest
    if (!request) {
      return
    }

    if (request.orderType !== 'medical_application') {
      utils.showToast({
        title: '该申请类型不支持复制',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '重新创建申请',
      content: '将使用此申请的信息创建新的就医申请，是否继续？',
      success: (res) => {
        if (res.confirm) {
          const copyData = {
            patientName: request.patientName || '',
            relation: request.relation || '',
            medicalDate: request.medicalDate || '',
            institution: request.institution || '',
            otherInstitution: request.otherInstitution || '',
            reasonForSelection: request.reasonForSelection || '',
            reason: request.reason || ''
          }

          // 跳转到新页面，loading 将在目标页面显示
          wx.navigateTo({
            url: `/pages/office/medical-application/medical-application?mode=copy&data=${encodeURIComponent(JSON.stringify(copyData))}`
          })

          this.closeDetail()
        }
      }
    })
  },

  terminateOrder() {
    const request = this.data.selectedRequest
    if (!request) {
      return
    }

    if (request.status !== 'pending') {
      utils.showToast({
        title: '只能中止待审批的申请',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认中止',
      content: '确定要中止此申请吗？中止后申请将无法继续处理。',
      confirmText: '确认中止',
      confirmColor: '#DC2626',
      success: (res) => {
        if (res.confirm) {
          this.setData({ actionLoading: true })

          const orderId = request.orderId

          wx.cloud.callFunction({
            name: 'workflowEngine',
            data: {
              action: 'terminateOrder',
              orderId: orderId,
              openid: app.globalData.openid
            }
          })
            .then((result) => {
              if (result.result.code !== 0) {
                throw new Error(result.result.message || '中止失败')
              }

              utils.showToast({
                title: '申请已中止',
                icon: 'success'
              })

              this.closeDetail()
              this.loadApprovalData()
            })
            .catch((error) => {
              utils.showToast({
                title: error.message || '中止失败',
                icon: 'none'
              })
            })
            .then(() => {
              this.setData({ actionLoading: false })
            })
        }
      }
    })
  },

  handleReview(e) {
    if (!this.data.canReview || this.data.actionLoading) {
      return
    }

    const itemId = e.currentTarget.dataset.id
    const decision = e.currentTarget.dataset.decision

    if (this.data.selectedRequest) {
      this.confirmReview(decision)
      return
    }

    const target = (this.data.currentList || []).find((item) => item.id === itemId)
    if (!target) {
      utils.showToast({
        title: '未找到申请记录',
        icon: 'none'
      })
      return
    }

    this.setData({
      selectedRequest: {
        ...target.raw,
        reviewRemark: target.reviewRemark
      }
    })

    this.confirmReview(decision)
  },

  confirmReview(decision) {
    const title = decision === 'approve' ? '确认批准' : '确认驳回'

    const request = this.data.selectedRequest
    const isMedicalApplication = request.orderType === 'medical_application'

    let content = ''
    
      if (decision === 'approve') {
        content = '确认批准？'
      } else {
        content = '确认驳回？'
      }
    

    wx.showModal({
      title,
      content,
      showCancel: true,
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.reviewRequest(decision)
        }
      }
    })
  },

  reviewRequest(decision) {
    this.setData({ actionLoading: true })

    const reviewRemark = this.data.reviewRemark || ''

    const currentUser = this.data.currentUser || app.globalData.userProfile
    const openid = app.globalData.openid
    const operatorName = currentUser ? currentUser.name : '审批人'

    const request = this.data.selectedRequest

    // 所有工单审批统一走工作流引擎（工作流引擎会验证权限）
    wx.cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'approveTask',
        taskId: request.taskId,
        approveAction: decision,
        comment: reviewRemark || (decision === 'approve' ? '已批准' : '已驳回'),
        operatorId: openid,
        operatorName: operatorName
      }
    })
      .then((result) => {
        if (result.result.code !== 0) {
          throw new Error(result.result.message || '审批失败')
        }

        const message = result.result.message || (decision === 'approve' ? '已批准' : '已驳回')

        // 检查是否是警告消息（后端已自动中止）
        const isWarningMessage = message.includes('已自动中止')

        if (isWarningMessage) {
          // 后端已自动中止，直接显示提示
          wx.showModal({
            title: '提示',
            content: message,
            showCancel: false,
            confirmText: '我知道了',
            confirmColor: '#ff0000'
          })
        } else {
          utils.showToast({
            title: message,
            icon: 'success'
          })
        }

        this.closeDetail()
        this.loadApprovalData()
      })
      .catch((error) => {
        utils.showToast({
          title: error.message || '处理失败',
          icon: 'none'
        })
      })
      .then(() => {
        this.setData({ actionLoading: false })
      })
  }
})
