const app = getApp()
const utils = require('../../../common/utils.js')

// ==================== 常量定义 ====================

/** Tab1 可见角色 */
const MEAL_TAB1_ROLES = ['馆领导', '部门负责人', '馆员', '工勤']

/** Tab2 可见岗位 */
const MEAL_TAB2_POSITIONS = ['会计主管', '会计', '出纳', '招待员', '厨师']

/** Tab3（副食预订）可见角色 — 与Tab1相同 */
const MEAL_TAB3_ROLES = ['馆领导', '部门负责人', '馆员', '工勤']

/** Tab4（副食管理）可见岗位 — 与Tab2相同 */
const MEAL_TAB4_POSITIONS = ['会计主管', '会计', '出纳', '招待员', '厨师']

/** 配偶角色中出纳岗位可进入（特殊权限） */
const SPECIAL_ACCESS = {
  role: '配偶',
  position: '出纳'
}

/** 调整类型元数据 */
const ADJUST_TYPE_META = {
  enroll: {
    label: '入伙',
    color: '#16A34A',
    bg: '#DCFCE7',
    textColor: '#166534'
  },
  withdraw: {
    label: '退伙',
    color: '#DC2626',
    bg: '#FEE2E2',
    textColor: '#991B1B'
  },
  suspend: {
    label: '停餐',
    color: '#F59E0B',
    bg: '#FEF3C7',
    textColor: '#92400E'
  },
  extra: {
    label: '加餐',
    color: '#2563EB',
    bg: '#DBEAFE',
    textColor: '#1E40AF'
  }
}

/** 获取下个周一的日期字符串 YYYY-MM-DD
 *  周一~周五：获取下一个周一
 *  周六、周日：获取下下个周一
 */
function getNextMonday() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  // 周一(1)~周五(5): 距下个周一 8-dayOfWeek 天; 周六(6)/周日(0): 再多加7天
  const daysToAdd = (dayOfWeek === 0 || dayOfWeek === 6)
    ? (8 - dayOfWeek) % 7 + 7
    : 8 - dayOfWeek
  now.setDate(now.getDate() + daysToAdd)
  return utils.formatDateObj(now)
}

Page({
  data: {
    loading: true,
    activeTab: 'myMeal',
    subtitle: '办理工作餐入伙、加餐、临时停餐与退伙',
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
    myAdjustmentList: [], // 当前用户的调整记录（Tab1 展示）
    hasMoreAdjustments: false,

    // ========== 工作餐管理数据（管理端）==========
    adjustmentList: [],
    hasMore: false,
    page: 1,

    // ========== 日期选择器配置 ==========
    minStartDate: '',
    dateToday: '',

    // ========== 副食预订数据（Tab3）==========
    sideDishOrderList: [], // 征订单列表
    showSideDishDetailModal: false, // 预订详情弹窗
    currentSideDishOrder: null, // 当前查看的征订单
    sideDishBookCount: 1, // 预订弹窗中的份数

    // ========== 副食管理数据（Tab4）==========
    sideDishManageList: [], // 管理端征订单列表
    hasMoreSideDish: false,
    sideDishPage: 1,
    showCreateSideDishModal: false, // 新建征订表单弹窗
    createSideDishData: { // 新建表单数据
      title: '',
      description: '',
      maxCount: 1,
      deadline: ''
    },
    showBookingDetailModal: false, // 管理端预订详情弹窗
    bookingDetailOrder: null, // 查看详情的征订单
    bookingDetailList: [], // 预订人员列表
    bookingSummary: null, // 预订统计
    sideDishSubmitLoading: false // 副食操作提交loading
  },

  onLoad() {
    this.setData({
      minStartDate: getNextMonday()
    })
    this.setData({
      dateToday: utils.getTodayDate()
    })
    this.initPage()
  },

  /**
   * 页面初始化入口（同步调用，展示加载中动画）
   * 流程：显示loading → 查用户信息 → 调云函数查餐食状态+调整历史 → 结果处理
   */
  initPage() {
    wx.showLoading({
      title: '加载中...',
      mask: true
    })

    app.checkUserRegistration()
      .then(result => {
        if (!result.registered || !result.user) {
          wx.hideLoading()
          this.setData({
            loading: false,
            noPermission: true
          })
          return
        }

        const user = result.user
        let availableTabs = []
        let defaultTab = ''

        if (MEAL_TAB1_ROLES.includes(user.role)) {
          availableTabs.push({
            key: 'myMeal',
            label: '我的工作餐'
          })
          defaultTab = 'myMeal'
        }

        if (MEAL_TAB2_POSITIONS.includes(user.position)) {
          availableTabs.push({
            key: 'management',
            label: '工作餐管理'
          })
          if (!defaultTab) defaultTab = 'management'
        }

        // 副食预订 Tab（角色判断）
        if (MEAL_TAB3_ROLES.includes(user.role)) {
          // 避免重复添加
          if (!availableTabs.find(t => t.key === 'sideOrder')) {
            availableTabs.push({
              key: 'sideOrder',
              label: '副食预订'
            })
            if (!defaultTab) defaultTab = 'sideOrder'
          }
        }

        // 副食管理 Tab（岗位判断）
        if (MEAL_TAB4_POSITIONS.includes(user.position)) {
          if (!availableTabs.find(t => t.key === 'sideManage')) {
            availableTabs.push({
              key: 'sideManage',
              label: '副食管理'
            })
            if (!defaultTab) defaultTab = 'sideManage'
          }
        }


        this.setData({
          currentUser: user,
          tabs: availableTabs,
          activeTab: defaultTab,
          noPermission: availableTabs.length === 0
        })

        if (!defaultTab) {
          wx.hideLoading()
          this.setData({
            loading: false
          })
          return
        }

        if (defaultTab === 'myMeal') {
          // 加载我的工作餐状态 + 历史记录
          this.loadMyMealData()
        } else if (defaultTab === 'management') {
          this.loadAdjustmentList(false)
            .finally(() => {
              wx.hideLoading()
              this.setData({
                loading: false
              })
            })
        } else if (defaultTab === 'sideOrder') {
          this.loadSideDishOrders()
        } else if (defaultTab === 'sideManage') {
          this.loadSideDishManageList(false)
            .finally(() => {
              wx.hideLoading()
              this.setData({
                loading: false
              })
            })
        }
      })
      .catch(err => {
        console.error('初始化失败:', err)
        wx.hideLoading()
        this.setData({
          loading: false,
          noPermission: true
        })
      })
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
  if (this.data.fontStyle !== fontStyle) {
    this.setData({ fontStyle })
  }
    // 从其他页面返回时刷新数据（非首次加载）
    if (this.data.currentUser && !this.data.loading) {
      this.refreshCurrentTab()
    } else {}
  },

  onPullDownRefresh() {
    this.refreshCurrentTab().then(() => wx.stopPullDownRefresh())
  },

  /** 刷新当前 tab 数据 */
  refreshCurrentTab() {
    if (this.data.activeTab === 'myMeal') {
      return this.loadMyMealData()
    } else if (this.data.activeTab === 'management') {
      return this.loadAdjustmentList(false)
    } else if (this.data.activeTab === 'sideOrder') {
      return this.loadSideDishOrders()
    } else {
      return this.loadSideDishManageList(false)
    }
  },

  // ==================== 我的工作餐逻辑 ====================

  /**
   * 加载用户餐食状态 + 调整历史（回调链，不使用 async/await）
   */
  loadMyMealData() {
    return Promise.all([
      wx.cloud.callFunction({
        name: 'mealManager',
        data: {
          action: 'getMyMealStatus'
        }
      }),
      wx.cloud.callFunction({
        name: 'mealManager',
        data: {
          action: 'getMyAdjustments'
        }
      })
    ]).then(([statusRes, adjRes]) => {
      // 处理订阅状态
      if (statusRes.result.code !== 0) throw new Error(statusRes.result.message)

      const mealStatus = statusRes.result.data

      if (!mealStatus) {
        // 无记录 → 弹出首次设置弹窗
        this.setData({
          mealStatus: null,
          showFirstSetup: true,
          setupData: {
            isEnrolled: true,
            mealCount: 1
          }
        })
      } else {
        this.setData({
          mealStatus: mealStatus,
          showFirstSetup: false
        })
      }

      // 处理调整历史
      if (adjRes.result.code !== 0) throw new Error(adjRes.result.message)

      const {
        list,
        hasMore
      } = adjRes.result.data || {
        list: [],
        hasMore: false
      }
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
      utils.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
      this.setData({
        loading: false
      })
    })
  },

  /** 打开调整弹窗 */
  openAdjustModal() {
    const status = this.data.mealStatus
    if (!status) {
      this.setData({
        showFirstSetup: true
      })
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
    this.setData({
      showAdjustModal: false
    })
  },

  closeFirstSetup() {
    this.setData({
      showFirstSetup: false
    })
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
    this.setData({
      'adjustData.type': e.detail.value
    })
  },

  handleCountChange(e) {
    const field = e.currentTarget.dataset.field
    const action = e.currentTarget.dataset.action
    let current = field === 'setup' ?
      this.data.setupData.mealCount :
      this.data.adjustData.count

    if (action === 'add') current++
    else if (action === 'minus' && current > 1) current--

    const maxCount = this.data.mealStatus ? this.data.mealStatus.mealCount : 99
    if (current > maxCount && !this.data.adjustData.type.includes('enroll')) {
      current = maxCount
    }

    if (field === 'setup') {
      this.setData({
        'setupData.mealCount': Math.max(1, current)
      })
    } else {
      this.setData({
        'adjustData.count': Math.max(1, current)
      })
    }
  },

  onStartDateChange(e) {
    this.setData({
      'adjustData.startDate': e.detail.value
    })
  },

  onEndDateChange(e) {
    this.setData({
      'adjustData.endDate': e.detail.value
    })
  },

  // ==================== 提交操作 ====================

  handleSubmitSetup() {
    const {
      isEnrolled,
      mealCount
    } = this.data.setupData

    if (!isEnrolled) {
      this.submitSaveStatus(isEnrolled, mealCount)
      return
    }

    if (mealCount < 1) {
      utils.showToast({
        title: '订餐份数至少为1',
        icon: 'none'
      })
      return
    }

    this.submitSaveStatus(isEnrolled, mealCount)
  },

  submitSaveStatus(isEnrolled, mealCount) {
    if (this.data.submitLoading) return
    this.data.submitLoading = true

    wx.showLoading({
      title: '保存中...',
      mask: true
    })

    wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'saveMealStatus',
        params: {
          isEnrolled,
          mealCount
        },
        userInfo: {
          name: this.data.currentUser.name,
          role: this.data.currentUser.role,
          position: this.data.currentUser.position
        }
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      utils.showToast({
        title: '保存成功',
        icon: 'success'
      })
      this.setData({
        showFirstSetup: false,
        mealStatus: res.result.data
      })
      // 刷新历史列表
      this.loadMyAdjustHistory()
    }).catch(err => {
      utils.showToast({
        title: err.message || '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      wx.hideLoading()
      this.data.submitLoading = false
    })
  },

  handleSubmitAdjust() {
    const data = this.data.adjustData

    if (!data.type) {
      utils.showToast({
        title: '请选择调整类型',
        icon: 'none'
      })
      return
    }

    if ((data.type === 'suspend' || data.type === 'withdraw' || data.type === 'extra') && !data.startDate) {
      utils.showToast({
        title: '请选择开始日期',
        icon: 'none'
      })
      return
    }

    if (data.type === 'suspend' && !data.endDate) {
      utils.showToast({
        title: '请选择结束日期',
        icon: 'none'
      })
      return
    }

    if (data.type === 'suspend' && data.startDate && data.endDate && data.endDate < data.startDate) {
      utils.showToast({
        title: '结束日期不得早于开始日期',
        icon: 'none'
      })
      return
    }

    if (data.count < 1) {
      utils.showToast({
        title: '份数必须大于0',
        icon: 'none'
      })
      return
    }

    if (this.data.submitLoading) return
    this.data.submitLoading = true

    wx.showLoading({
      title: '提交中...',
      mask: true
    })

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

      utils.showToast({
        title: '提交成功',
        icon: 'success'
      })
      this.setData({
        showAdjustModal: false
      })
      // 同时刷新状态和历史
      this.loadMyMealData()
    }).catch(err => {
      utils.showToast({
        title: err.message || '提交失败',
        icon: 'none'
      })
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
      data: {
        action: 'getMyAdjustments'
      }
    }).then(res => {
      if (res.result.code !== 0) return

      const {
        list,
        hasMore
      } = res.result.data || {
        list: [],
        hasMore: false
      }
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

    this.setData({
      activeTab: tab,
      subtitle: {
        myMeal: '办理工作餐入伙、加餐、临时停餐与退伙',
        management: '查看工作餐调整记录',
        sideOrder: '预订副食',
        sideManage: '添加副食征订，查看副食预订情况'
      } [tab] || ''
    })
    wx.showLoading({
      title: '加载中...',
      mask: true
    })

    if (tab === 'myMeal') {
      this.loadMyMealData()
    } else if (tab === 'management') {
      this.page = 1
      this.loadAdjustmentList(false).finally(() => wx.hideLoading())
    } else if (tab === 'sideOrder') {
      this.loadSideDishOrders()
    } else if (tab === 'sideManage') {
      this.sideDishPage = 1
      this.loadSideDishManageList(false).finally(() => wx.hideLoading())
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
        params: {
          page,
          pageSize: 20
        }
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      const {
        list,
        hasMore
      } = res.result.data
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
      utils.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
      this.setData({
        loading: false
      })
    })
  },

  onReachBottom() {
    if (this.data.activeTab === 'management' && this.data.hasMore) {
      this.loadAdjustmentList(true)
    }
    if (this.data.activeTab === 'sideManage' && this.data.hasMoreSideDish) {
      this.loadSideDishManageList(true)
    }
  },

  // ==================== 副食预订逻辑（Tab3）====================

  /** 加载副食征订单列表（附带当前用户的预订状态） */
  loadSideDishOrders() {
    return wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'getSideDishOrders'
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      const list = res.result.data || []
      const formatted = list.map(item => ({
        ...item,
        isTodayOrBefore: item.deadline && item.deadline <= utils.getLocalDateString(),
        formattedDeadline: item.deadline || '',
        formattedTime: item.createdAt ? utils.formatRelativeTime(item.createdAt) : ''
      }))

      this.setData({
        sideDishOrderList: formatted,
        loading: false
      })
      wx.hideLoading()
    }).catch(err => {
      console.error('加载副食征订单失败:', err)
      wx.hideLoading()
      utils.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
      this.setData({
        loading: false
      })
    })
  },

  /** 打开副食预订详情弹窗 */
  openSideDishDetail(e) {
    const order = e.currentTarget.dataset.order
    if (!order) return

    const isExpired = order.isExpired || order.isTodayOrBefore

    this.setData({
      showSideDishDetailModal: true,
      currentSideDishOrder: { ...order, isExpired },
      sideDishBookCount: order.myBookedCount > 0 ? order.myBookedCount : 1
    })
  },

  closeSideDishDetail() {
    this.setData({
      showSideDishDetailModal: false,
      currentSideDishOrder: null
    })
  },

  /** 副食预订份数调整 */
  handleSideDishCountChange(e) {
    const action = e.currentTarget.dataset.action
    let count = this.data.sideDishBookCount
    const maxCount = (this.data.currentSideDishOrder && this.data.currentSideDishOrder.maxCount || 1) * 2

    if (action === 'add') {
      if (count < maxCount) count++
    } else {
      if (count > 1) count--
    }

    this.setData({
      sideDishBookCount: count
    })
  },

  /** 提交/修改副食预订 */
  handleSubmitSideDishBooking() {
    const order = this.data.currentSideDishOrder
    if (!order) return

    if (this.data.sideDishSubmitLoading) return
    this.data.sideDishSubmitLoading = true

    wx.showLoading({
      title: '提交中...',
      mask: true
    })

    wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'bookSideDish',
        params: {
          orderId: order._id,
          action: 'book',
          count: this.data.sideDishBookCount
        },
        userInfo: {
          name: this.data.currentUser.name,
          role: this.data.currentUser.role,
          position: this.data.currentUser.position
        }
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      utils.showToast({
        title: '预订成功',
        icon: 'success'
      })
      this.setData({
        showSideDishDetailModal: false,
        currentSideDishOrder: null
      })
      // 刷新列表
      this.loadSideDishOrders()
    }).catch(err => {
      utils.showToast({
        title: err.message || '预订失败',
        icon: 'none'
      })
    }).finally(() => {
      wx.hideLoading()
      this.data.sideDishSubmitLoading = false
    })
  },

  /** 取消副食预订 */
  handleCancelSideDishBooking() {
    const order = this.data.currentSideDishOrder
    if (!order || !order.myBookingId) return

    wx.showModal({
      title: '确认取消',
      content: `确定要取消该副食预订吗？`,
      confirmColor: '#DC2626',
      success: (res) => {
        if (!res.confirm) return

        wx.showLoading({
          title: '处理中...',
          mask: true
        })

        wx.cloud.callFunction({
          name: 'mealManager',
          data: {
            action: 'bookSideDish',
            params: {
              orderId: order._id,
              action: 'cancel'
            }
          }
        }).then(result => {
          if (result.result.code !== 0) throw new Error(result.result.message)

          utils.showToast({
            title: '已取消预订',
            icon: 'success'
          })
          this.setData({
            showSideDishDetailModal: false,
            currentSideDishOrder: null
          })
          this.loadSideDishOrders()
        }).catch(err => {
          utils.showToast({
            title: err.message || '操作失败',
            icon: 'none'
          })
        }).finally(() => {
          wx.hideLoading()
        })
      }
    })
  },

  // ==================== 副食管理逻辑（Tab4）====================

  /** 打开新建副食征订弹窗 */
  openCreateSideDishModal() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const defaultDeadline = utils.formatDateObj(tomorrow)

    this.setData({
      showCreateSideDishModal: true,
      createSideDishData: {
        title: '',
        description: '',
        maxCount: 1,
        deadline: defaultDeadline
      }
    })
  },

  closeCreateSideDishModal() {
    this.setData({
      showCreateSideDishModal: false
    })
  },

  /** 新建征订表单 - 字段变更 */
  handleCreateFieldChange(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`createSideDishData.${field}`]: value
    })
  },

  /** 新建征订表单 - 份数调整 */
  handleCreateCountChange(e) {
    const action = e.currentTarget.dataset.action
    let count = this.data.createSideDishData.maxCount
    if (action === 'add') count++
    else if (action === 'minus' && count > 1) count--
    this.setData({
      'createSideDishData.maxCount': count
    })
  },

  /** 新建征订表单 - 截止日期变更 */
  handleCreateDeadlineChange(e) {
    this.setData({
      'createSideDishData.deadline': e.detail.value
    })
  },

  /** 提交创建副食征订单 */
  handleSubmitCreateSideDish() {
    const data = this.data.createSideDishData

    if (!data.title || !data.title.trim()) {
      utils.showToast({
        title: '请输入标题',
        icon: 'none'
      })
      return
    }

    if (!data.description || !data.description.trim()) {
      utils.showToast({
        title: '请输入副食详情',
        icon: 'none'
      })
      return
    }

    if (!data.deadline) {
      utils.showToast({
        title: '请选择截止日期',
        icon: 'none'
      })
      return
    }

    if (this.data.sideDishSubmitLoading) return
    this.data.sideDishSubmitLoading = true

    wx.showLoading({
      title: '发布中...',
      mask: true
    })

    wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'createSideDishOrder',
        params: {
          title: data.title.trim(),
          description: data.description.trim(),
          maxCount: data.maxCount,
          deadline: data.deadline
        },
        userInfo: {
          name: this.data.currentUser.name,
          role: this.data.currentUser.role,
          position: this.data.currentUser.position
        }
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      utils.showToast({
        title: '发布成功',
        icon: 'success'
      })
      this.setData({
        showCreateSideDishModal: false
      })
      // 刷新管理端列表 + 预订列表
      this.loadSideDishManageList(false)
    }).catch(err => {
      utils.showToast({
        title: err.message || '发布失败',
        icon: 'none'
      })
    }).finally(() => {
      wx.hideLoading()
      this.data.sideDishSubmitLoading = false
    })
  },

  /** 加载管理端副食征订单列表 */
  loadSideDishManageList(loadMore) {
    if (loadMore && !this.data.hasMoreSideDish) return Promise.resolve()

    const page = loadMore ? ++this.sideDishPage : (this.sideDishPage = 1)

    // 管理端查看所有征订单（包括已截止的），不分页时直接查全部
    return wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'getSideDishOrders'
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      const list = res.result.data || []
      const formatted = list.map(item => ({
        ...item,
        isTodayOrBefore: item.deadline && item.deadline <= utils.getLocalDateString(),
        formattedDeadline: item.deadline || '',
        formattedTime: item.createdAt ? utils.formatRelativeTime(item.createdAt) : ''
      }))

      this.setData({
        sideDishManageList: formatted,
        hasMoreSideDish: false,
        loading: false
      })
    }).catch(err => {
      console.error('加载管理端征订单失败:', err)
      utils.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
      this.setData({
        loading: false
      })
    })
  },

  /** 打开管理端预订详情弹窗 */
  openBookingDetail(e) {
    const orderId = e.currentTarget.dataset.id
    if (!orderId) return

    wx.showLoading({
      title: '加载中...',
      mask: true
    })

    wx.cloud.callFunction({
      name: 'mealManager',
      data: {
        action: 'getSideDishBookings',
        params: {
          orderId
        }
      }
    }).then(res => {
      if (res.result.code !== 0) throw new Error(res.result.message)

      const {
        order,
        bookings,
        summary
      } = res.result.data

      this.setData({
        showBookingDetailModal: true,
        bookingDetailOrder: order,
        bookingDetailList: bookings || [],
        bookingSummary: summary
      })
      wx.hideLoading()
    }).catch(err => {
      wx.hideLoading()
      utils.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
    })
  },

  closeBookingDetail() {
    this.setData({
      showBookingDetailModal: false,
      bookingDetailOrder: null,
      bookingDetailList: [],
      bookingSummary: null
    })
  },

  /** 导出副食预订清单 PDF */
  async handleExportSideDishPdf() {
    const orderId = this.data.bookingDetailOrder._id
    if (!orderId) return

    try {
      wx.showLoading({ title: '生成PDF...', mask: true })

      const res = await wx.cloud.callFunction({
        name: 'generateOrderPdf',
        data: { orderId, type: 'sideDishBookings' }
      })

      if (res.result.code !== 0) throw new Error(res.result.message)

      const { fileUrl, fileName } = res.result.data

      // 下载文件并直接打开
      wx.showLoading({ title: '正在打开文件...' })
      const downloadResult = await new Promise((resolve, reject) => {
        wx.downloadFile({ url: fileUrl, success: resolve, fail: reject })
      })

      wx.hideLoading()

      if (downloadResult.statusCode === 200) {
        wx.openDocument({
          filePath: downloadResult.tempFilePath,
          fileName, fileType: 'pdf', showMenu: true,
          fail: () => utils.showToast({ title: '打开文件失败', icon: 'none' })
        })
      } else {
        utils.showToast({ title: '下载文件失败', icon: 'none' })
      }
    } catch (err) {
      utils.showToast({ title: err.message || '导出失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})