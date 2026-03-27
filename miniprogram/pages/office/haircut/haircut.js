/**
 * 理发预约页面
 */

const app = getApp()

// 可查看理发预约的岗位
const HAIRCUT_VIEWER_POSITIONS = ['招待员', '会计主管', '会计', '内聘']

// 取消原因
const CANCEL_REASONS = [
  '当日招待员因有事未能理发',
  '预约人没来理发'
]

Page({
  data: {
    // 用户权限
    canView: false,
    isReceptionist: false,
    userName: '',
    
    // Tab
    activeTab: 'book',
    
    // 预约理发 Tab
    displayDates: [],
    selectedDate: '',
    selectedDateInfo: null,
    slots: [],
    slotsMessage: '',
    loadingSlots: false,
    selectedSlot: '',
    selectedSlotDisplay: '',
    
    // 本月预约 Tab
    monthlyList: [],
    loadingMonthly: false,
    sortBy: 'time',
    
    // 我的预约 Tab
    myList: [],
    loadingMine: false,
    myPage: 1,
    hasMoreMine: true,
    
    // 预约表单
    showBookingPopup: false,
    bookingForm: {
      appointeeName: ''
    },
    submitting: false,
    
    // 取消弹窗
    showCancelPopup: false,
    cancelReasons: CANCEL_REASONS,
    cancelReason: '',
    cancellingAppointment: null,
    cancelling: false
  },

  onLoad() {
    this.checkPermission()
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 检查用户权限
   */
  async checkPermission() {
    try {
      const result = await app.checkUserRegistration()
      if (result.registered && result.user) {
        const user = result.user
        const canView = HAIRCUT_VIEWER_POSITIONS.includes(user.position)
        const isReceptionist = user.position === '招待员'
        this.setData({
          canView,
          isReceptionist,
          userName: user.name
        })
      }
    } catch (error) {
      console.error('检查权限失败:', error)
    }
  },

  /**
   * 加载数据
   */
  async loadData() {
    if (this.data.activeTab === 'book') {
      await this.loadDisplayDates()
    } else if (this.data.activeTab === 'monthly') {
      await this.loadMonthlyAppointments()
    } else if (this.data.activeTab === 'mine') {
      await this.loadMyAppointments()
    }
  },

  /**
   * Tab 切换
   */
  handleTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    
    this.setData({ activeTab: tab })
    this.loadData()
  },

  // ==================== 预约理发 Tab ====================

  /**
   * 加载可显示日期
   */
  async loadDisplayDates() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: { action: 'getDisplayDates' }
      })

      if (res.result.code === 0) {
        const dates = res.result.data.dates || []
        this.setData({ displayDates: dates })

        // 默认选择第一个可用日期
        const availableDate = dates.find(d => !d.isDisabled)
        if (availableDate) {
          this.handleDateSelect({ currentTarget: { dataset: { date: availableDate } } })
        } else if (dates.length > 0) {
          // 没有可用日期，选择第一个显示提示
          this.handleDateSelect({ currentTarget: { dataset: { date: dates[0] } } })
        }
      }
    } catch (error) {
      console.error('加载日期失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 选择日期
   */
  async handleDateSelect(e) {
    const dateInfo = e.currentTarget.dataset.date
    if (!dateInfo) return

    this.setData({
      selectedDate: dateInfo.date,
      selectedDateInfo: dateInfo,
      selectedSlot: '',
      selectedSlotDisplay: '',
      slots: []
    })

    // 如果日期禁用，不加载时段
    if (dateInfo.isDisabled) {
      return
    }

    // 加载时段
    this.setData({ loadingSlots: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'getAvailableSlots',
          date: dateInfo.date
        }
      })

      if (res.result.code === 0) {
        this.setData({
          slots: res.result.data.slots || [],
          slotsMessage: res.result.data.message || ''
        })
      }
    } catch (error) {
      console.error('加载时段失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loadingSlots: false })
    }
  },

  /**
   * 选择时段
   */
  handleSlotSelect(e) {
    const slot = e.currentTarget.dataset.slot
    if (!slot || slot.isBooked) return

    this.setData({
      selectedSlot: slot.start,
      selectedSlotDisplay: slot.display
    })
  },

  /**
   * 显示预约表单
   */
  showBookingForm() {
    this.setData({
      showBookingPopup: true,
      'bookingForm.appointeeName': this.data.userName || ''
    })
  },

  /**
   * 隐藏预约表单
   */
  hideBookingPopup() {
    this.setData({ showBookingPopup: false })
  },

  /**
   * 输入姓名
   */
  handleNameInput(e) {
    this.setData({ 'bookingForm.appointeeName': e.detail.value })
  },

  /**
   * 提交预约
   */
  async handleBookingSubmit() {
    const { appointeeName } = this.data.bookingForm
    if (!appointeeName || !appointeeName.trim()) {
      wx.showToast({ title: '请输入理发人姓名', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'createAppointment',
          appointmentData: {
            date: this.data.selectedDate,
            timeSlot: this.data.selectedSlot,
            appointeeName: appointeeName.trim()
          }
        }
      })

      if (res.result.code === 0) {
        wx.showToast({ title: '预约成功', icon: 'success' })
        this.hideBookingPopup()
        // 刷新时段列表
        this.handleDateSelect({ currentTarget: { dataset: { date: this.data.selectedDateInfo } } })
      } else {
        wx.showToast({ title: res.result.message || '预约失败', icon: 'none' })
      }
    } catch (error) {
      console.error('预约失败:', error)
      wx.showToast({ title: '预约失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ==================== 本月预约 Tab ====================

  /**
   * 加载本月预约
   */
  async loadMonthlyAppointments() {
    if (!this.data.canView) return

    this.setData({ loadingMonthly: true })
    try {
      const now = new Date()
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'getAppointments',
          params: {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            sortBy: this.data.sortBy
          }
        }
      })

      if (res.result.code === 0) {
        this.setData({ monthlyList: res.result.data.list || [] })
      }
    } catch (error) {
      console.error('加载本月预约失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loadingMonthly: false })
    }
  },

  /**
   * 排序切换
   */
  handleSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort
    if (sortBy === this.data.sortBy) return

    this.setData({ sortBy })
    this.loadMonthlyAppointments()
  },

  /**
   * 显示取消弹窗
   */
  showCancelPopup(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      showCancelPopup: true,
      cancellingAppointment: item,
      cancelReason: ''
    })
  },

  /**
   * 隐藏取消弹窗
   */
  hideCancelPopup() {
    this.setData({ showCancelPopup: false, cancellingAppointment: null, cancelReason: '' })
  },

  /**
   * 选择取消原因
   */
  handleCancelReasonSelect(e) {
    this.setData({ cancelReason: e.currentTarget.dataset.reason })
  },

  /**
   * 确认取消
   */
  async handleConfirmCancel() {
    if (!this.data.cancelReason) {
      wx.showToast({ title: '请选择取消原因', icon: 'none' })
      return
    }

    this.setData({ cancelling: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'cancelAppointment',
          appointmentId: this.data.cancellingAppointment._id,
          cancelReason: this.data.cancelReason
        }
      })

      if (res.result.code === 0) {
        wx.showToast({ title: '取消成功', icon: 'success' })
        this.hideCancelPopup()
        this.loadMonthlyAppointments()
      } else {
        wx.showToast({ title: res.result.message || '取消失败', icon: 'none' })
      }
    } catch (error) {
      console.error('取消失败:', error)
      wx.showToast({ title: '取消失败', icon: 'none' })
    } finally {
      this.setData({ cancelling: false })
    }
  },

  // ==================== 我的预约 Tab ====================

  /**
   * 加载我的预约
   */
  async loadMyAppointments() {
    this.setData({ loadingMine: true, myPage: 1, myList: [], hasMoreMine: true })
    await this.fetchMyAppointments()
  },

  /**
   * 获取我的预约数据
   */
  async fetchMyAppointments() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'getMyAppointments',
          page: this.data.myPage,
          pageSize: 20
        }
      })

      if (res.result.code === 0) {
        const list = res.result.data.list || []
        const total = res.result.data.total || 0
        this.setData({
          myList: this.data.myList.concat(list),
          hasMoreMine: this.data.myList.length + list.length < total
        })
      }
    } catch (error) {
      console.error('加载我的预约失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loadingMine: false })
    }
  },

  /**
   * 加载更多
   */
  async loadMoreMyAppointments() {
    if (!this.data.hasMoreMine || this.data.loadingMine) return

    this.setData({ myPage: this.data.myPage + 1 })
    await this.fetchMyAppointments()
  },

  /**
   * 取消我的预约
   */
  async handleCancelMyAppointment(e) {
    const item = e.currentTarget.dataset.item

    const res = await wx.showModal({
      title: '确认取消',
      content: `确定要取消 ${item.date} ${item.timeSlotDisplay} 的预约吗？`,
      confirmText: '确认取消',
      confirmColor: '#DC2626'
    })

    if (!res.confirm) return

    try {
      const result = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'cancelAppointment',
          appointmentId: item._id
        }
      })

      if (result.result.code === 0) {
        wx.showToast({ title: '取消成功', icon: 'success' })
        this.loadMyAppointments()
      } else {
        wx.showToast({ title: result.result.message || '取消失败', icon: 'none' })
      }
    } catch (error) {
      console.error('取消失败:', error)
      wx.showToast({ title: '取消失败', icon: 'none' })
    }
  },

  // ==================== 工具方法 ====================

  stopPropagation() {
    // 阻止事件冒泡
  }
})