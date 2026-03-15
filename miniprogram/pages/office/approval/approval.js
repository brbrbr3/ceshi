const app = getApp()
const util = require('../../../util/util.js')

const approvalTypes = [
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

function mapRequestItem(request) {
  const statusMeta = getStatusMeta(request.status)
  const avatar = request.avatarText || (request.name ? request.name.slice(0, 1) : '智')
  return {
    id: request._id,
    requestNo: request.requestNo,
    name: request.name,
    dept: `${request.role} · ${request.gender}`,
    detail: `${request.birthday} · ${request.isAdmin ? '申请管理员' : '普通成员'}`,
    status: statusMeta.label,
    statusColor: statusMeta.statusColor,
    statusBg: statusMeta.statusBg,
    avatar,
    avatarColor: getAvatarColor(avatar),
    time: formatRelativeTime(request.updatedAt || request.submittedAt),
    urgent: !!request.isAdmin,
    raw: request
  }
}

Page({
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
    selectedRequest: null
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
      return '暂无我发起的注册申请'
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

    this.setData({
      selectedRequest: target.raw,
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

  handleReview(e) {
    if (!this.data.canReview || this.data.actionLoading || !this.data.selectedRequest) {
      return
    }

    const decision = e.currentTarget.dataset.decision
    const title = decision === 'approve' ? '确认批准' : '确认驳回'
    const content = decision === 'approve'
      ? '批准后，该用户将自动写入用户表并可登录首页。'
      : '驳回后，用户可重新进入注册页修改资料并再次提交。'

    wx.showModal({
      title,
      content,
      success: (res) => {
        if (res.confirm) {
          this.reviewRequest(decision)
        }
      }
    })
  },

  reviewRequest(decision) {
    this.setData({ actionLoading: true })

    // 获取审批意见
    const reviewRemark = this.data.reviewRemark || ''

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
})
