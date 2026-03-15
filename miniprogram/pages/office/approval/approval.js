const app = getApp()
const util = require('../../../util/util.js')

const approvalTypes = [
  { icon: '🏥', label: '就医申请', color: '#EF4444', bg: '#FEE2E2' },
  { icon: '📝', label: '注册申请', color: '#2563EB', bg: '#EFF6FF' },
  { icon: '👔', label: '馆领导', color: '#7C3AED', bg: '#F3E8FF' },
  { icon: '🏛️', label: '部门负责人', color: '#0891B2', bg: '#E0F2FE' },
  { icon: '📚', label: '馆员', color: '#059669', bg: '#D1FAE5' },
  { icon: '🧰', label: '工勤', color: '#EA580C', bg: '#FFEDD5' },
  { icon: '🏘️', label: '物业', color: '#DB2777', bg: '#FCE7F3' },
  { icon: '💞', label: '配偶', color: '#DC2626', bg: '#FEE2E2' },
  { icon: '👪', label: '家属', color: '#4F46E5', bg: '#E0E7FF' }
]

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return '刚刚'
  }

  const diff = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < hour) {
    return `${Math.max(1, Math.floor(diff / minute))} 分钟前`
  }
  if (diff < day) {
    return `${Math.max(1, Math.floor(diff / hour))} 小时前`
  }

  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const dayText = String(date.getDate()).padStart(2, '0')
  return `${month}-${dayText}`
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function getStatusMeta(status) {
  if (status === 'approved') {
    return { label: '已通过', statusColor: '#16A34A', statusBg: '#DCFCE7' }
  }
  if (status === 'rejected') {
    return { label: '已驳回', statusColor: '#DC2626', statusBg: '#FEE2E2' }
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

// 计算就医申请的进度
function calculateMedicalProgress(currentStep, totalSteps = 3) {
  if (!currentStep) {
    return { percent: 0, currentText: '等待提交' }
  }
  
  const percent = Math.min(Math.floor((currentStep / totalSteps) * 100), 100)
  
  const stepNames = ['', '部门负责人审批', '会计主管审批', '馆领导审批']
  const currentText = stepNames[currentStep] || '进行中'
  
  return {
    percent,
    currentText,
    currentStep,
    totalSteps
  }
}

function mapRequestItem(request) {
  const statusMeta = getStatusMeta(request.status)
  const avatar = request.avatarText || (request.name ? request.name.slice(0, 1) : '智')
  
  // 根据申请类型生成不同的详情
  let detail = ''
  let requestType = '注册申请'
  let showProgress = false
  
  if (request.orderType === 'medical_application') {
    // 就医申请
    const patientName = request.patientName || ''
    const relation = request.relation || ''
    const medicalDate = request.medicalDate || ''
    const institution = request.institution || ''
    const detailParts = []
    
    if (patientName) {
      detailParts.push(`就医人：${patientName}`)
    }
    if (relation) {
      detailParts.push(`关系：${relation}`)
    }
    if (medicalDate) {
      detailParts.push(`时间：${medicalDate}`)
    }
    if (institution) {
      detailParts.push(`机构：${institution}`)
    }
    
    detail = detailParts.join(' · ')
    requestType = '就医申请'
    showProgress = request.status === 'pending'
  } else {
    // 注册申请
    const detailParts = [request.birthday]
    if (request.position && request.position !== '无') {
      detailParts.push(request.position)
    }
    detailParts.push(request.isAdmin ? '申请管理员' : '普通成员')
    detail = detailParts.join(' · ')
    requestType = '注册申请'
    showProgress = false
  }

  // 生成审批备注信息
  let reviewRemark = request.reviewRemark || ''
  if (request.status === 'approved' || request.status === 'rejected') {
    const actionText = request.status === 'approved' ? '批准' : '驳回'
    const reviewedBy = request.reviewedBy || '管理员'
    const reviewedTime = request.reviewedAt ? formatDateTime(request.reviewedAt) : ''
    
    // 如果 reviewedBy 不包含"管理员"，则添加前缀
    const adminPrefix = reviewedBy.includes('管理员') ? '' : '管理员'
    const approvalInfo = `${adminPrefix}${reviewedBy}已于${reviewedTime}${actionText}该申请`
    
    if (reviewRemark) {
      // 如果有驳回原因，则拼接：审批信息，原因
      reviewRemark = `${approvalInfo}，原因：${reviewRemark}`
    } else {
      reviewRemark = approvalInfo
    }
  }

  // 计算进度（就医申请）
  let progress = null
  if (showProgress && request.currentStep) {
    progress = calculateMedicalProgress(request.currentStep)
  }

  return {
    id: request._id,
    requestNo: request.requestNo,
    name: request.name,
    dept: request.dept || '',
    detail: detail,
    requestType: requestType,
    orderType: request.orderType, // 保留原始 orderType
    status: statusMeta.label,
    statusColor: statusMeta.statusColor,
    statusBg: statusMeta.statusBg,
    avatar,
    avatarColor: getAvatarColor(avatar),
    time: formatRelativeTime(request.updatedAt || request.submittedAt),
    urgent: !!request.isAdmin,
    raw: request,
    reviewRemark: reviewRemark,
    showProgress: showProgress,
    progress: progress
  }
}

Page({
  filters: {
    formatDateTime
  },
  data: {
    loading: true,
    actionLoading: false,
    canReview: false,
    activeTab: 'pending',
    approvalTypes,
    tabs: [
      { key: 'pending', label: '待审批', count: 0 },
      { key: 'mine', label: '我发起的', count: 0 },
      { key: 'done', label: '已处理', count: 0 }
    ],
    summary: {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0
    },
    pendingList: [],
    mineList: [],
    doneList: [],
    currentList: [],
    emptyText: '暂无注册申请',
    showDetail: false,
    selectedRequest: null,
    currentUser: null
  },

  onShow() {
    this.loadApprovalData()
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
    if (!canReview && tab !== 'mine') {
      return '仅管理员可查看当前分组'
    }
    if (tab === 'mine') {
      return '暂无我发起的申请'
    }
    if (tab === 'done') {
      return '暂无已处理申请'
    }
    return '暂无待审批申请'
  },

  loadApprovalData() {
    this.setData({ loading: true })

    app.callOfficeAuth('getApprovalData')
      .then((data) => {
        const pendingList = (data.pendingList || []).map(mapRequestItem)
        const mineList = (data.mineList || []).map(mapRequestItem)
        const doneList = (data.doneList || []).map(mapRequestItem)
        const canReview = !!data.canReview
        const activeTab = canReview ? this.data.activeTab : (mineList.length ? 'mine' : 'pending')
        const lists = { pendingList, mineList, doneList }

        this.setData({
          canReview,
          currentUser: data.currentUser, // 保存当前用户信息
          summary: data.summary || this.data.summary,
          pendingList,
          mineList,
          doneList,
          activeTab,
          tabs: [
            { key: 'pending', label: '待审批', count: pendingList.length },
            { key: 'mine', label: '我发起的', count: mineList.length },
            { key: 'done', label: '已处理', count: doneList.length }
          ],
          currentList: this.getListByTab(activeTab, lists),
          emptyText: this.getEmptyText(activeTab, canReview)
        })
      })
      .catch((error) => {
        util.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })
      })
      .then(() => {
        this.setData({ loading: false })
      })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    const currentList = this.getListByTab(tab, this.data)
    this.setData({
      activeTab: tab,
      currentList,
      emptyText: this.getEmptyText(tab, this.data.canReview)
    })
  },

  openRequestDetail(e) {
    const requestId = e.currentTarget.dataset.id
    const target = (this.data.currentList || []).find((item) => item.id === requestId)
    if (!target) {
      return
    }

    // 使用 target 对象而不是 target.raw，因为 reviewRemark 已经在 mapRequestItem 中处理过
    this.setData({
      selectedRequest: {
        ...target.raw,
        reviewRemark: target.reviewRemark
      },
      showDetail: true
    })
  },

  closeDetail() {
    this.setData({
      showDetail: false,
      selectedRequest: null
    })
  },

  showLaunchTip() {
    wx.showToast({
      title: this.data.canReview ? '当前页面用于处理注册审批' : '当前账号仅可查看自己的申请状态',
      icon: 'none'
    })
  },

  copyAndResubmitMedical() {
    const request = this.data.selectedRequest
    if (!request) {
      return
    }

    // 只支持就医申请的复制
    if (request.orderType !== 'medical_application') {
      util.showToast({
        title: '该申请类型不支持复制',
        icon: 'none'
      })
      return
    }

    // 询问用户是否要复制
    wx.showModal({
      title: '重新创建申请',
      content: '将使用此申请的信息创建新的就医申请，是否继续？',
      success: (res) => {
        if (res.confirm) {
          // 导航到就医申请页面，传递复制数据
          const copyData = {
            patientName: request.patientName || '',
            relation: request.relation || '',
            medicalDate: request.medicalDate || '',
            institution: request.institution || '',
            otherInstitution: request.otherInstitution || '',
            reasonForSelection: request.reasonForSelection || '',
            reason: request.reason || ''
          }

          wx.navigateTo({
            url: `/pages/office/medical-application/medical-application?mode=copy&data=${encodeURIComponent(JSON.stringify(copyData))}`
          })

          this.closeDetail()
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

    // 如果已经打开详情弹窗，使用 selectedRequest
    if (this.data.selectedRequest) {
      this.confirmReview(decision)
      return
    }

    // 否则，从列表中找到对应的 item
    const target = (this.data.currentList || []).find((item) => item.id === itemId)
    if (!target) {
      util.showToast({
        title: '未找到申请记录',
        icon: 'none'
      })
      return
    }

    // 设置当前选中的请求（不打开弹窗），确保使用处理过的 reviewRemark
    this.setData({
      selectedRequest: {
        ...target.raw,
        reviewRemark: target.reviewRemark
      }
    })

    // 确认审批
    this.confirmReview(decision)
  },

  confirmReview(decision) {
    const title = decision === 'approve' ? '确认批准' : '确认驳回'

    // 根据申请类型显示不同的提示文本
    const request = this.data.selectedRequest
    const isMedicalApplication = request.orderType === 'medical_application'

    let content = ''
    if (isMedicalApplication) {
      // 就医申请
      if (decision === 'approve') {
        content = '批准后，该就医申请将流转到下一审批环节。'
      } else {
        content = '驳回后，申请人可重新提交就医申请。'
      }
    } else {
      // 注册申请
      if (decision === 'approve') {
        content = '批准后，该用户将自动写入用户表并可登录首页。'
      } else {
        content = '驳回后，用户可重新进入注册页修改资料并再次提交。'
      }
    }

    wx.showModal({
      title,
      content,
      success: (res) => {
        if (res.confirm) {
          this.reviewRequest(decision)
        } else {
          // 取消审批，清除 selectedRequest（如果未打开弹窗）
          if (!this.data.showDetail) {
            this.setData({ selectedRequest: null })
          }
        }
      }
    })
  },

  reviewRequest(decision) {
    this.setData({ actionLoading: true })

    // 获取审批意见
    const reviewRemark = this.data.reviewRemark || ''
    
    // 获取当前用户信息
    const currentUser = this.data.currentUser || app.globalData.userProfile
    const openid = app.globalData.openid
    const operatorName = currentUser ? currentUser.name : '审批人'

    // 判断是就医申请还是注册申请
    const request = this.data.selectedRequest
    const isMedicalApplication = request.orderType === 'medical_application'

    if (isMedicalApplication) {
      // 就医申请，调用 workflowEngine 云函数
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
          
          util.showToast({
            title: decision === 'approve' ? '已批准' : '已驳回',
            icon: 'success'
          })

          this.closeDetail()
          this.loadApprovalData()
        })
        .catch((error) => {
          util.showToast({
            title: error.message || '处理失败',
            icon: 'none'
          })
        })
        .then(() => {
          this.setData({ actionLoading: false })
        })
    } else {
      // 注册申请，调用 officeAuth 云函数
      app.callOfficeAuth('reviewRegistration', {
        taskId: this.data.selectedRequest.taskId || this.data.selectedRequest._id,
        decision,
        reviewRemark
      })
        .then((result) => {
          util.showToast({
            title: decision === 'approve' ? '已批准' : '已驳回',
            icon: 'success'
          })

          // 添加本地通知
          if (result && result.request) {
            const notificationType = decision === 'approve' ? '注册申请通过' : '注册申请被驳回'
            const notificationContent = `您提交的${result.request.name}的${result.request.role}申请${decision === 'approve' ? '已通过' : '已被驳回'}${decision === 'rejected' && result.reviewRemark ? '，原因：' + result.reviewRemark : ''}`
            app.addApprovalNotification(notificationType, notificationContent)
          }

          this.closeDetail()
          this.loadApprovalData()
        })
        .catch((error) => {
          util.showToast({
            title: error.message || '处理失败',
            icon: 'none'
          })
        })
        .then(() => {
          this.setData({ actionLoading: false })
        })
    }
  }
})
