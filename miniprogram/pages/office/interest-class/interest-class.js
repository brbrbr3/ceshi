const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')
const modalAnimation = require('../../../behaviors/modalAnimation.js')

// 教学模式快捷候选
const TEACHING_MODE_OPTIONS = ['集体教学', '一对一']

Page({
  behaviors: [paginationBehavior, modalAnimation],

  data: {
    fontStyle: '',
    currentUser: null,
    isReviewer: false,
    // 查看范围
    scopeText: '',
    scopeType: 'self', // 'all' | 'department' | 'self'
    // 搜索
    keyword: '',
    // 状态筛选（仅普通用户查看自己时有效）
    statusFilter: 'all', // 'all' | 'active' | 'ended'
    showStatusFilter: false,
    // 弹窗
    showFormPopup: false,
    showDetailPopup: false,
    formMode: 'create', // 'create' | 'edit'
    editingRecordId: '',
    detailRecord: null,
    submitting: false,
    _showGlobalLoading: false,
    // 表单
    form: {
      name: '',
      className: '',
      timeSlot: '',
      teachingMode: '',
      companion: '',
      remark: ''
    },
    teachingModeOptions: TEACHING_MODE_OPTIONS
  },

  async onLoad() {
    await this.initUserInfo()
  },

  async onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
    // 每次显示时刷新列表
    if (this.data.currentUser) {
      await this.refreshList()
    }
  },

  async initUserInfo() {
    try {
      const result = await app.checkUserRegistration()
      if (!result.registered || !result.user) {
        wx.reLaunch({ url: '/pages/auth/login/login' })
        return
      }
      const user = result.user
      const isAdmin = user.isAdmin === true
      const isLeader = user.role === '馆员' && user.department === '无'
      const isBanHead = user.role === '馆员' && user.department === '办' && user.isDepartmentHead === true
      const isDeptHead = user.isDepartmentHead === true

      // 状态筛选栏：管理员、领导、办部门负责人、普通用户可见（仅部门负责人不可见）
      const showStatusFilter = isAdmin || isBanHead || (isLeader && !isDeptHead) || (!isAdmin && !isLeader && !isBanHead && !isDeptHead)

      // scopeType 和 scopeText 由云函数返回后设置
      this.setData({
        currentUser: user,
        isReviewer: !!user.isReviewer,
        showStatusFilter,
        scopeType: 'self'
      })

      // 初始化完成后加载列表
      await this.refreshList()
    } catch (e) {
      console.error('获取用户信息失败:', e)
    }
  },

  /**
   * 重写 loadData，实现分页加载
   */
  async loadData(params) {
    const { page, pageSize } = params
    const { keyword, statusFilter } = this.data

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'interestClassReport',
        data: {
          action: 'list',
          params: {
            page,
            pageSize,
            keyword: keyword || '',
            status: statusFilter
          }
        }
      }).then(res => {
        if (this.data._showGlobalLoading) {
          wx.hideLoading()
          this.setData({ _showGlobalLoading: false })
        }
        if (res.result.code === 0) {
          const data = res.result.data
          const list = (data.list || []).map(item => this.formatRecord(item))

          // 用云函数返回的 scopeType 更新范围文字
          const scopeType = data.scopeType || 'self'
          this.setData({
            scopeType,
            scopeText: this.scopeTypeToText(scopeType)
          })

          resolve({
            data: list,
            hasMore: data.hasMore
          })
        } else {
          reject(new Error(res.result.message))
        }
      }).catch(error => {
        if (this.data._showGlobalLoading) {
          wx.hideLoading()
          this.setData({ _showGlobalLoading: false })
        }
        console.error('加载兴趣班备案列表失败:', error)
        reject(error)
      })
    })
  },

  /**
   * 格式化记录项
   */
  formatRecord(item) {
    const isOwn = this.data.currentUser && item._openid === this.data.currentUser.openid
    const isActive = item.status === 'active'
    return {
      ...item,
      isOwn,
      isActive,
      canOperate: isOwn && isActive,
      createdAtText: utils.formatRelativeTime(item.createdAt),
      createdDateText: utils.formatDate(item.createdAt),
      endedAtText: item.endedAt ? utils.formatDateTime(item.endedAt) : ''
    }
  },

  /**
   * 将云函数返回的 scopeType 映射为查看范围文案
   * （仿 trip-board 的 scopeTypeToText 模式）
   */
  scopeTypeToText(scopeType) {
    const user = this.data.currentUser
    if (!user) return ''
    const isAdmin = user.isAdmin === true
    const isBanHead = user.role === '馆员' && user.department === '办' && user.isDepartmentHead === true

    switch (scopeType) {
      case 'all':
        if (isAdmin || isBanHead) {
          return '查看范围：全体人员全部备案（含已结束）'
        }
        return '查看范围：全体人员生效中的备案'
      case 'department':
        return '查看范围：本部门生效中的备案'
      case 'self':
      default:
        return '查看范围：我的全部备案（含已结束）'
    }
  },

  // ========== 搜索 ==========

  handleSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    // 防抖 400ms 后自动搜索，无需点确认
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this._startSearch()
    }, 400)
  },

  handleSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._startSearch()
  },

  _startSearch() {
    wx.showLoading({ title: '搜索中...', mask: true })
    this.setData({ _showGlobalLoading: true })
    this.refreshList()
  },

  handleClearSearch() {
    this.setData({ keyword: '' })
    wx.showLoading({ title: '加载中...', mask: true })
    this.setData({ _showGlobalLoading: true })
    this.refreshList()
  },

  // ========== 状态筛选 ==========

  handleStatusFilterChange(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.statusFilter) return
    this.setData({ statusFilter: status })
    wx.showLoading({ title: '加载中...', mask: true })
    this.setData({ _showGlobalLoading: true })
    this.refreshList()
  },

  // ========== 表单弹窗 ==========

  handleShowCreate() {
    this.setData({
      showFormPopup: true,
      formMode: 'create',
      editingRecordId: '',
      form: {
        name: '',
        className: '',
        timeSlot: '',
        teachingMode: '',
        companion: '',
        remark: ''
      }
    })
  },

  handleShowEdit(e) {
    const record = e.currentTarget.dataset.record
    if (!record) return
    this.setData({
      showFormPopup: true,
      formMode: 'edit',
      editingRecordId: record._id,
      form: {
        name: record.name || '',
        className: record.className || '',
        timeSlot: record.timeSlot || '',
        teachingMode: record.teachingMode || '',
        companion: record.companion || '',
        remark: record.remark || ''
      }
    })
  },

  hideFormPopup() {
    this._closeModal('showFormPopup')
  },

  hideDetailPopup() {
    this._closeModal('showDetailPopup', () => {
      this.setData({ detailRecord: null })
    })
  },

  // 表单输入处理
  handleNameInput(e) {
    this.setData({ 'form.name': e.detail.value })
  },
  handleClassNameInput(e) {
    this.setData({ 'form.className': e.detail.value })
  },
  handleTimeSlotInput(e) {
    this.setData({ 'form.timeSlot': e.detail.value })
  },
  handleTeachingModeInput(e) {
    this.setData({ 'form.teachingMode': e.detail.value })
  },
  handleCompanionInput(e) {
    this.setData({ 'form.companion': e.detail.value })
  },
  handleRemarkInput(e) {
    this.setData({ 'form.remark': e.detail.value })
  },

  // 教学模式快捷选择
  handleSelectTeachingMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ 'form.teachingMode': mode })
  },

  /**
   * 表单校验
   */
  validateForm() {
    const { name, className, timeSlot, teachingMode } = this.data.form
    if (!String(name || '').trim()) {
      utils.showToast({ title: '请填写姓名', icon: 'none' })
      return false
    }
    if (!String(className || '').trim()) {
      utils.showToast({ title: '请填写兴趣班名称', icon: 'none' })
      return false
    }
    if (!String(timeSlot || '').trim()) {
      utils.showToast({ title: '请填写兴趣班时段', icon: 'none' })
      return false
    }
    if (!String(teachingMode || '').trim()) {
      utils.showToast({ title: '请填写教学模式', icon: 'none' })
      return false
    }
    return true
  },

  /**
   * 提交表单
   */
  handleSubmit() {
    if (this.data.submitting) return
    if (!this.validateForm()) return

    const { formMode, editingRecordId, form } = this.data
    const submitData = {
      name: form.name.trim(),
      className: form.className.trim(),
      timeSlot: form.timeSlot.trim(),
      teachingMode: form.teachingMode.trim(),
      companion: form.companion.trim(),
      remark: form.remark.trim()
    }

    this.setData({ submitting: true })

    const action = formMode === 'edit' ? 'edit' : 'create'
    const params = formMode === 'edit'
      ? { recordId: editingRecordId, ...submitData }
      : submitData

    wx.cloud.callFunction({
      name: 'interestClassReport',
      data: { action, params }
    }).then(res => {
      if (res.result.code === 0) {
        const msg = formMode === 'edit' ? '编辑成功，原备案已结束' : '备案成功'
        utils.showToast({ title: msg, icon: 'success' })
        this._closeModal('showFormPopup')
        this.refreshList()
      } else {
        utils.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    }).catch(error => {
      console.error('提交备案失败:', error)
      utils.showToast({ title: '操作失败，请重试', icon: 'none' })
    }).finally(() => {
      this.setData({ submitting: false })
    })
  },

  // ========== 结束兴趣班 ==========

  handleEnd(e) {
    const record = e.currentTarget.dataset.record
    if (!record) return

    wx.showModal({
      title: '确认结束',
      content: `确认结束「${record.className}」的兴趣班备案？结束后将保留记录但不可再编辑。`,
      confirmText: '确认结束',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.confirmEnd(record._id)
        }
      }
    })
  },

  confirmEnd(recordId) {
    if (this.data.submitting) return
    this.setData({ submitting: true })

    wx.cloud.callFunction({
      name: 'interestClassReport',
      data: {
        action: 'end',
        params: { recordId }
      }
    }).then(res => {
      if (res.result.code === 0) {
        utils.showToast({ title: '已结束该兴趣班', icon: 'success' })
        this.refreshList()
      } else {
        utils.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    }).catch(error => {
      console.error('结束备案失败:', error)
      utils.showToast({ title: '操作失败，请重试', icon: 'none' })
    }).finally(() => {
      this.setData({ submitting: false })
    })
  },

  // ========== 详情弹窗 ==========

  handleShowDetail(e) {
    const record = e.currentTarget.dataset.record
    if (!record) return
    this.setData({
      showDetailPopup: true,
      detailRecord: record
    })
  },

  // ========== 分页 ==========

  onReachBottom() {
    this.loadMore()
  },

  async onPullDownRefresh() {
    await this.refreshList()
    wx.stopPullDownRefresh()
  }
})
