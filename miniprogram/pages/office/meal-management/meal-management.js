const app = getApp()
const utils = require('../../../common/utils.js')

// ==================== 常量定义 ====================

/** Tab1 可见角色 */
const MEAL_TAB1_ROLES = ['馆领导', '部门负责人', '馆员', '工勤']

/** Tab2 可见岗位 */
const MEAL_TAB2_POSITIONS = ['会计主管', '会计', '出纳', '招待员', '厨师']

/** 配偶角色中出纳岗位可进入（特殊权限） */
const SPECIAL_ACCESS = { role: '配偶', position: '出纳' }

/** 调整类型元数据 */
const ADJUST_TYPE_META = {
  enroll: { label: '入伙', color: '#16A34A', bg: '#DCFCE7', textColor: '#166534' },
  withdraw: { label: '退伙', color: '#DC2626', bg: '#FEE2E2', textColor: '#991B1B' },
  suspend: { label: '停餐', color: '#F59E0B', bg: '#FEF3C7', textColor: '#92400E' },
  extra: { label: '加餐', color: '#2563EB', bg: '#DBEAFE', textColor: '#1E40AF' }
}

/** 获取下个周一的日期字符串 YYYY-MM-DD */
function getNextMonday() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysToAdd = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7
  now.setDate(now.getDate() + daysToAdd)
  return utils.formatDateObj(now)
}

Page({
  data: {
    loading: true,
    activeTab: '',
    tabs: [],
    currentUser: null,

    // ========== 我的工作餐数据 ==========
    mealStatus: null,
    showFirstSetup: false,
    showAdjustModal: false,
    setupData: {
      isEnrolled: true,
      mealCount: 1
    },
    adjustData: {
      type: '',
      startDate: '',
      endDate: '',
      count: 1
    },
    submitLoading: false,

    // ========== 我的调整历史 ==========
    myAdjustmentList: [],       // 当前用户的调整记录（Tab1 展示）
    hasMoreAdjustments: false,

    // ========== 工作餐管理数据（管理端）==========
    adjustmentList: [],
    hasMore: false,
    page: 1,

    // ========== 日期选择器配置 ==========
    minStartDate: ''
  },

  onLoad() {
    this.setData({ minStartDate: getNextMonday() })
    this.initPage()
  },

  /**
   * 页面初始化入口（同步调用，展示加载中动画）
   * 流程：显示loading → 查用户信息 → 调云函数查餐食状态+调整历史 → 结果处理
   */
  initPage() {
    wx.showLoading({ title: '加载中...', mask: true })

    app.checkUserRegistration()
      .then(result => {
        if (!result.registered || !result.user) {
          wx.hideLoading()
          this.setData({ loading: false, noPermission: true })
          return
        }

        const user = result.user
        let availableTabs = []
        let defaultTab = ''

        if (MEAL_TAB1_ROLES.includes(user.role)) {
          availableTabs.push({ key: 'myMeal', label: '我的工作餐' })
          defaultTab = 'myMeal'
        }

        if (MEAL_TAB2_POSITIONS.includes(user.position)) {
          availableTabs.push({ key: 'management', label: '工作餐管理' })
          if (!defaultTab) defaultTab = 'management'
        }

        
        this.setData({
          currentUser: user,
          tabs: availableTabs,
          activeTab: defaultTab,
          noPermission: availableTabs.length === 0
        })

        if (!defaultTab) {
          wx.hideLoading()
          this.setData({ loading: false })
          return
        }

        if (defaultTab === 'myMeal') {
          // 加载我的工作餐状态 + 历史记录
          this.loadMyMealData()
        } else {
          this.loadAdjustmentList(false)
            .finally(() => {
              wx.hideLoading()
              this.setData({ loading: false })
            })
        }
      })
      .catch(err => {
        console.error('初始化失败:', err)
        wx.hideLoading()
        this.setData({ loading: false, noPermission: true })
      })
  },

  onShow() {
    // 从其他页面返回时刷新数据（非首次加载）
    if (this.data.currentUser && !this.data.loading) {
      this.refreshCurrentTab()
    } else {
    }
  },

  onPullDownRefresh() {
    this.refreshCurrentTab().then(() => wx.stopPullDownRefresh())
  },

  /** 刷新当前 tab 数据 */
  refreshCurrentTab() {
    if (this.data.activeTab === 'myMeal') {
      return this.loadMyMealData()
    } else {
      return this.loadAdjustmentList(false)
    }
  },

  // ==================== 我的工作餐逻辑 ====================

  /**
   * 加载用户餐食状态 + 调整历史（回调链，不使用 async/await）
   */
  loadMyMealData() {
    return Promise.all([
      wx.cloud.callFunction({ name: 'mealManager', data: { action: 'getMyMealStatus' } }),
      wx.cloud.callFunction({ name: 'mealManager', data: { action: 'getMyAdjustments' } })
    ]).then(([statusRes, adjRes]) => {
      // 处理订阅状态
      if (statusRes.result.code !== 0) throw new Error(statusRes.result.message)

      const mealStatus = statusRes.result.data

      if (!mealStatus) {
        // 无记录 → 弹出首次设置弹窗
        this.setData({
          mealStatus: null,
          showFirstSetup: true,
          setupData: { isEnrolled: true, mealCount: 1 }
        })
      } else {
        this.setData({
          mealStatus: mealStatus,
          showFirstSetup: false
        })
      }

      // 处理调整历史
      if (adjRes.result.code !== 0) throw new Error(adjRes.result.message)

      const { list, hasMore } = adjRes.result.data || { list: [], hasMore: false }
      const formattedList = (list || []).map(item => ({
        ...item,
        ...ADJUST_TYPE_META[item.adjustmentType] || {},
        formattedTime: item.createdAt ? utils.formatRelativeTime(item.createdAt) : ''
      }))

      this.setData({
        myAdjustmentList: formattedList,
        hasMoreAdjustments: hasMore,
        loading: false
      })

      wx.hideLoading()
    }).catch(err => {
      console.error('加载餐食数据失败:', err)
      wx.hideLoading()
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  /** 打开调整弹窗 */
  openAdjustModal() {
    const status = this.data.mealStatus
    if (!status) {
      this.setData({ showFirstSetup: true })
      return
    }

    const isEnrolled = status.isEnrolled

    this.setData({
      showAdjustModal: true,
      adjustData: {
        type: isEnrolled ? 'extra' : 'enroll',
        startDate: '',
        endDate: '',
        count: isEnrolled ? status.mealCount : 1
      }
    })
  },

  closeAdjustModal() {
    this.setData({ showAdjustModal: false })
  },

  closeFirstSetup() {
    this.setData({ showFirstSetup: false })
    wx.navigateBack({
      delta: 1
    })
  },

  // ==================== 表单交互 ====================

  handleSwitchChange(e) {
    const value = e.detail.value
    this.setData({
      'setupData.isEnrolled': value,
      'setupData.mealCount': value ? 1 : 0
    })
  },

  handleAdjustTypeChange(e) {
    this.setData({ 'adjustData.type': e.detail.value })
  },

  handleCountChange(e) {
    const field = e.currentTarget.dataset.field
    const action = e.currentTarget.dataset.action
    let current = field === 'setup'
      ? this.data.setupData.mealCount
      : this.data.adjustData.count

    if (action === 'add') current++
    else if (action === 'minus' && current > 1) current--

    const maxCount = this.data.mealStatus ? this.data.mealStatus.mealCount : 99
    if (current > maxCount && !this.data.adjustData.type.includes('enroll')) {
      current = maxCount
    }

    if (field === 'setup') {
      this.setData({ 'setupData.mealCount': Math.max(1, current) })
    } else {
      this.setData({ 'adjustData.count': Math.max(1, current) })
    }
  },

  onStartDateChange(e) {
    this.setData({ 'adjustData.startDate': e.detail.value })
  },

  onEndDateChange(e) {
    this.setData({ 'adjustData.endDate': e.detail.value })
  },

  // ==================== 提交操作 ====================

  handleSubmitSetup() {
    const { isEnrolled, mealCount } = this.data.setupData

    if (!isEnrolled) {
      this.submitSaveStatus(isEnrolled, mealCount)
      return
    }

    if (mealCount < 1) {
      utils.showToast({ title: '订餐份数至少为1', icon: 'none' })
      return
    }

    this.submitSaveStatus(isEnrolled, mealCount)
  },

  submitSaveStatus(isEnrolled, mealCount) {
    if (this.data.submitLoading) return
    this.data.submitLoading = true

    wx.showLoading({ title: '保存中...', mask: true })

    wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'saveMealStatus',
        params: { isEnrolled, mealCount },
        userInfo: {
          name: this.data.currentUser.name,
          role: this.data.currentUser.role,
          position: this.data.currentUser.position
        }
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      utils.showToast({ title: '保存成功', icon: 'success' })
      this.setData({
        showFirstSetup: false,
        mealStatus: res.result.data
      })
      // 刷新历史列表
      this.loadMyAdjustHistory()
    }).catch(err => {
      utils.showToast({ title: err.message || '保存失败', icon: 'none' })
    }).finally(() => {
      wx.hideLoading()
      this.data.submitLoading = false
    })
  },

  handleSubmitAdjust() {
    const data = this.data.adjustData

    if (!data.type) {
      utils.showToast({ title: '请选择调整类型', icon: 'none' })
      return
    }

    if ((data.type === 'suspend' || data.type === 'withdraw' || data.type === 'extra') && !data.startDate) {
      utils.showToast({ title: '请选择开始日期', icon: 'none' })
      return
    }

    if (data.type === 'suspend' && !data.endDate) {
      utils.showToast({ title: '请选择结束日期', icon: 'none' })
      return
    }

    if (data.type === 'suspend' && data.startDate && data.endDate && data.endDate < data.startDate) {
      utils.showToast({ title: '结束日期不得早于开始日期', icon: 'none' })
      return
    }

    if (data.count < 1) {
      utils.showToast({ title: '份数必须大于0', icon: 'none' })
      return
    }

    if (this.data.submitLoading) return
    this.data.submitLoading = true

    wx.showLoading({ title: '提交中...', mask: true })

    wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'submitMealAdjustment',
        params: {
          adjustmentType: data.type,
          startDate: data.startDate,
          endDate: data.endDate,
          count: data.count
        },
        userInfo: {
          name: this.data.currentUser.name,
          role: this.data.currentUser.role,
          position: this.data.currentUser.position
        }
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      utils.showToast({ title: '提交成功', icon: 'success' })
      this.setData({ showAdjustModal: false })
      // 同时刷新状态和历史
      this.loadMyMealData()
    }).catch(err => {
      utils.showToast({ title: err.message || '提交失败', icon: 'none' })
    }).finally(() => {
      wx.hideLoading()
      this.data.submitLoading = false
    })
  },

  /**
   * 仅刷新用户的调整历史（提交操作后调用，不重置整个页面状态）
   */
  loadMyAdjustHistory() {
    wx.cloud.callFunction({
      name: 'mealManager',
      data: { action: 'getMyAdjustments' }
    }).then(res => {
      if (res.result.code !== 0) return

      const { list, hasMore } = res.result.data || { list: [], hasMore: false }
      const formattedList = (list || []).map(item => ({
        ...item,
        ...ADJUST_TYPE_META[item.adjustmentType] || {},
        formattedTime: item.createdAt ? utils.formatRelativeTime(item.createdAt) : ''
      }))

      this.setData({
        myAdjustmentList: formattedList,
        hasMoreAdjustments: hasMore
      })
    }).catch(err => {
      console.error('刷新历史失败:', err)
    })
  },

  // ==================== Tab 切换 ====================

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return

    this.setData({ activeTab: tab })
    wx.showLoading({ title: '加载中...', mask: true })

    if (tab === 'myMeal') {
      this.loadMyMealData()
    } else {
      this.page = 1
      this.loadAdjustmentList(false).finally(() => wx.hideLoading())
    }
  },

  // ==================== 工作餐管理逻辑（管理端）====================

  loadAdjustmentList(loadMore) {
    if (loadMore && !this.data.hasMore) return Promise.resolve()

    const page = loadMore ? ++this.page : (this.page = 1)

    return wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'getAdjustmentList',
        params: { page, pageSize: 20 }
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      const { list, hasMore } = res.result.data
      const formattedList = (list || []).map(item => ({
        ...item,
        ...ADJUST_TYPE_META[item.adjustmentType] || {},
        formattedTime: item.createdAt ? utils.formatRelativeTime(item.createdAt) : ''
      }))

      this.setData({
        adjustmentList: loadMore ? [...this.data.adjustmentList, ...formattedList] : formattedList,
        hasMore,
        loading: false
      })
    }).catch(err => {
      console.error('加载调整列表失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  onReachBottom() {
    if (this.data.activeTab === 'management' && this.data.hasMore) {
      this.loadAdjustmentList(true)
    }
  }
})
