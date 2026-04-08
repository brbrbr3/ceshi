const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

// 状态样式映射
const STATUS_STYLE = {
  out: {
    color: '#2563EB',
    bg: '#EFF6FF',
    icon: '🚗',
    text: '外出中'
  },
  returned: {
    color: '#16A34A',
    bg: '#DCFCE7',
    icon: '✓',
    text: '已返回'
  },
  overtime: {
    color: '#DC2626',
    bg: '#FEE2E2',
    icon: '⚠',
    text: '超时'
  }
}

// 历史记录存储key
const STORAGE_KEY_DESTINATION = 'trip_destination_history'
const STORAGE_KEY_COMPANIONS = 'trip_companions_history'
const MAX_HISTORY_COUNT = 3

Page({
  behaviors: [paginationBehavior],

  data: {
    loading: false,
    submitting: false,
    activeTrip: null, // 当前未返回的出行
    showFormPopup: false, // 是否显示表单弹窗
    travelModes: [], // 出行方式选项
    form: {
      destination: '',
      companions: '',
      plannedReturnAt: '', // 改为统一的日期时间字符串
      travelMode: ''
    },
    travelModeIndex: -1,
    tripList: [], // 出行记录列表
    groupedTrips: [], // 按月分组的出行记录
    // 历史记录
    destinationHistory: [],
    companionsHistory: [],
    showDestinationHistory: false,
    showCompanionsHistory: false
  },

  async onLoad() {
    // 初始化分页配置
    this.initPagination({
      initialPageSize: 10,
      loadMorePageSize: 10
    })

    // 加载常量配置
    await this.loadConstants()

    // 加载历史记录
    this.loadHistory()
  },

  async onShow() {
    // 显示加载中提示
    wx.showLoading({
      title: '加载中...',
      mask: true
    })

    try {
      // 等待所有数据加载完成
      await Promise.all([
        this.loadActiveTrip(),
        this.refreshList()
      ])
    } finally {
      // 无论成功失败都隐藏 loading
      wx.hideLoading()
    }
  },

  /**
   * 加载常量配置
   */
  async loadConstants() {
    try {
      const travelModes = await app.getConstant('TRAVEL_MODES')
      this.setData({
        travelModes: travelModes || ['自驾', '搭车', '打车', '步行']
      })
    } catch (error) {
      console.error('加载常量配置失败:', error)
      this.setData({
        travelModes: ['自驾', '搭车', '打车', '步行']
      })
    }
  },

  /**
   * 加载历史记录（数据库优先 + 本地缓存）
   */
  async loadHistory() {
    // 先加载本地缓存，快速显示
    const localDestHistory = wx.getStorageSync(STORAGE_KEY_DESTINATION) || []
    const localCompHistory = wx.getStorageSync(STORAGE_KEY_COMPANIONS) || []

    this.setData({
      destinationHistory: localDestHistory,
      companionsHistory: localCompHistory
    })

    // 然后从数据库获取最新历史记录
    try {
      const res = await wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getHistory'
        }
      })

      if (res.result.code === 0) {
        const {
          destinations,
          companions
        } = res.result.data

        // 如果数据库有数据，优先使用
        if (destinations.length > 0 || companions.length > 0) {
          this.setData({
            destinationHistory: destinations.length > 0 ? destinations : localDestHistory,
            companionsHistory: companions.length > 0 ? companions : localCompHistory
          })

          // 同步更新本地缓存
          if (destinations.length > 0) {
            wx.setStorageSync(STORAGE_KEY_DESTINATION, destinations)
          }
          if (companions.length > 0) {
            wx.setStorageSync(STORAGE_KEY_COMPANIONS, companions)
          }
        }
      }
    } catch (error) {
      console.error('从数据库加载历史记录失败，使用本地缓存:', error)
      // 失败时保持本地缓存数据
    }
  },

  /**
   * 保存历史记录
   */
  saveToHistory(key, value) {
    if (!value || !value.trim()) return

    const storageKey = key === 'destination' ? STORAGE_KEY_DESTINATION : STORAGE_KEY_COMPANIONS
    const historyKey = key === 'destination' ? 'destinationHistory' : 'companionsHistory'

    let history = this.data[historyKey] || []

    // 移除已存在的相同值
    history = history.filter(item => item !== value)

    // 添加到最前面
    history.unshift(value)

    // 最多保留 MAX_HISTORY_COUNT 条
    if (history.length > MAX_HISTORY_COUNT) {
      history = history.slice(0, MAX_HISTORY_COUNT)
    }

    // 保存到本地存储
    wx.setStorageSync(storageKey, history)

    // 更新页面数据
    this.setData({
      [historyKey]: history
    })
  },

  /**
   * 获取当前未返回的出行
   */
  async loadActiveTrip() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getActiveTrip'
        }
      })

      if (res.result.code === 0) {
        const activeTrip = res.result.data.activeTrip
        if (activeTrip) {
          // 格式化时间
          activeTrip.plannedReturnText = this.formatDateTime(activeTrip.plannedReturnAt)
        }
        this.setData({
          activeTrip
        })
      }
    } catch (error) {
      console.error('获取当前出行失败:', error)
    }
  },

  /**
   * 重写 loadData 方法，实现分页加载逻辑
   */
  async loadData(params) {
    const {
      page,
      pageSize
    } = params

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getMyTrips',
          params: {
            page,
            pageSize
          }
        }
      }).then(res => {
        if (res.result.code === 0) {
          const data = res.result.data
          const tripList = (data.list || []).map(item => this.formatTripItem(item))

          // 更新列表
          this.setData({
            tripList: page === 1 ? tripList : [...this.data.tripList, ...tripList]
          })

          // 更新分组
          this.updateGroupedTrips()

          resolve({
            data: tripList,
            hasMore: data.hasMore
          })
        } else {
          reject(new Error(res.result.message))
        }
      }).catch(error => {
        console.error('加载出行记录失败:', error)
        utils.showToast({
          title: '加载失败',
          icon: 'none'
        })
        reject(error)
      })
    })
  },

  /**
   * 格式化出行记录项
   */
  formatTripItem(item) {
    const style = STATUS_STYLE[item.status] || STATUS_STYLE.returned
    const date = new Date(item.departAt)

    // 使用 utils.js 的格式化函数（遵循编码规范：前端使用 utils 格式化时间）
    const departTimeStr = utils.formatTime(item.departAt).slice(0, 5)  // HH:mm，去掉秒
    // 返回时间：跨天时显示日期+时间，同天只显示时间
    let returnTimeStr = '--:--'
    if (item.returnAt) {
      const departDate = new Date(item.departAt)
      const returnDate = new Date(item.returnAt)
      const sameDay = departDate.getFullYear() === returnDate.getFullYear() &&
                       departDate.getMonth() === returnDate.getMonth() &&
                       departDate.getDate() === returnDate.getDate()
      if (sameDay) {
        returnTimeStr = utils.formatTime(item.returnAt).slice(0, 5)
      } else {
        returnTimeStr = `${returnDate.getMonth() + 1}月${returnDate.getDate()}日 ${utils.formatTime(item.returnAt).slice(0, 5)}`
      }
    }

    return {
      ...item,
      dateText: `${date.getMonth() + 1}月${date.getDate()}日`,
      departTime: departTimeStr,
      returnTime: returnTimeStr,
      timeRange: `${departTimeStr} - ${item.returnAt ? returnTimeStr : '未返回'}`,
      statusText: style.text,
      statusIcon: style.icon,
      statusColor: style.color,
      statusBg: style.bg,
      monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      monthText: `${date.getFullYear()}年${date.getMonth() + 1}月`
    }
  },

  /**
   * 更新按月分组的出行记录
   */
  updateGroupedTrips() {
    const tripList = this.data.tripList
    const groupedMap = {}

    tripList.forEach(trip => {
      if (!groupedMap[trip.monthKey]) {
        groupedMap[trip.monthKey] = {
          monthKey: trip.monthKey,
          monthText: trip.monthText,
          trips: []
        }
      }
      groupedMap[trip.monthKey].trips.push(trip)
    })

    // 转换为数组并按月份倒序排列
    const groupedTrips = Object.values(groupedMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))

    this.setData({
      groupedTrips
    })
  },

  /**
   * 格式化日期时间（用于状态卡片显示）
   * 不显示秒数，只显示到分钟
   */
  formatDateTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${month}月${day}日 ${hour}:${minute}`
  },

  /**
   * 显示外出报备表单
   */
  showDepartForm() {
    // 计算最小返回时间（当前时间 + 30分钟）
    const now = new Date()
    const futureTime = new Date(now.getTime() + 30 * 60 * 1000)

    // 格式化为 YYYY-MM-DD HH:mm 格式
    const defaultReturnAt = this.formatDateTimeForPicker(futureTime)

    // 计算精确时间范围
    // minReturnDatetime = 当前时间
    const minReturnDatetime = this.formatDateTimeForPicker(now)

    // maxReturnDatetime = 明天 23:59:59
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59)
    const maxReturnDatetime = this.formatDateTimeForPicker(tomorrow)

    // 获取最后一次成功报备的数据作为默认值
    const lastTrip = this.data.tripList.find(trip => trip.status === 'returned')

    // 设置默认值
    const form = {
      destination: '',
      companions: '',
      plannedReturnAt: defaultReturnAt,
      travelMode: lastTrip ? lastTrip.travelMode : ''
    }

    const travelModeIndex = lastTrip ? this.data.travelModes.indexOf(lastTrip.travelMode) : -1

    this.setData({
      showFormPopup: true,
      form,
      minReturnDatetime,
      maxReturnDatetime,
      travelModeIndex: travelModeIndex >= 0 ? travelModeIndex : 0
    })

    // 显示历史记录项
    if (this.data.destinationHistory.length > 0) {
      this.setData({
        showDestinationHistory: true
      })
    }

    if (this.data.companionsHistory.length > 0) {
      this.setData({
        showCompanionsHistory: true
      })
    }

    // 如果有出行方式，设置默认值
    if (travelModeIndex >= 0) {
      this.setData({
        'form.travelMode': this.data.travelModes[travelModeIndex]
      })
    }
  },

  /**
   * 格式化日期为picker所需格式（YYYY-MM-DD）
   */
  formatDateForPicker(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 格式化日期时间为picker所需格式（YYYY-MM-DD HH:mm）
   */
  formatDateTimeForPicker(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  /**
   * 隐藏表单弹窗
   */
  hideFormPopup() {
    this.setData({
      showFormPopup: false,
      showDestinationHistory: false,
      showCompanionsHistory: false
    })
  },

  /**
   * 阻止冒泡
   */
  stopPropagation() {},

  // 表单输入处理
  handleDestinationInput(e) {
    const value = e.detail.value
    this.setData({
      'form.destination': value,
      showDestinationHistory: value === '' && this.data.destinationHistory.length > 0
    })
  },

  handleCompanionsInput(e) {
    const value = e.detail.value
    this.setData({
      'form.companions': value,
      showCompanionsHistory: value === '' && this.data.companionsHistory.length > 0
    })
  },

  // 选择历史记录
  selectDestinationHistory(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      'form.destination': value,
      showDestinationHistory: false
    })
  },

  selectCompanionsHistory(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      'form.companions': value,
      showCompanionsHistory: false
    })
  },

  /**
   * 处理计划返回时间选择变化
   */
  handleReturnDateTimeChange(e) {
    this.setData({
      'form.plannedReturnAt': e.detail.value
    })
  },

  handleTravelModeChange(e) {
    const index = Number(e.detail.value)
    const travelMode = this.data.travelModes[index]
    this.setData({
      travelModeIndex: index,
      'form.travelMode': travelMode
    })
  },

  /**
   * 验证表单
   */
  validateForm() {
    const form = this.data.form

    if (!String(form.destination || '').trim()) {
      utils.showToast({
        title: '请填写目的地',
        icon: 'none'
      })
      return false
    }

    if (!form.plannedReturnAt) {
      utils.showToast({
        title: '请选择计划返回时间',
        icon: 'none'
      })
      return false
    }

    if (!form.travelMode) {
      utils.showToast({
        title: '请选择出行方式',
        icon: 'none'
      })
      return false
    }

    // 检查返回时间是否在未来
    const returnTimestamp = new Date(form.plannedReturnAt.replace(' ', 'T')).getTime()
    if (returnTimestamp <= Date.now()) {
      utils.showToast({
        title: '计划返回时间必须在当前时间之后',
        icon: 'none'
      })
      return false
    }

    return true
  },

  /**
   * 提交外出报备
   */
  submitDepart() {
    if (this.data.submitting) return

    if (!this.validateForm()) return

    const form = this.data.form
    // 解析日期时间字符串为时间戳
    const plannedReturnAt = new Date(form.plannedReturnAt.replace(' ', 'T')).getTime()

    this.setData({
      submitting: true
    })

    wx.cloud.callFunction({
      name: 'tripReport',
      data: {
        action: 'depart',
        params: {
          destination: form.destination.trim(),
          companions: form.companions.trim(),
          plannedReturnAt,
          travelMode: form.travelMode
        }
      }
    }).then(res => {
      if (res.result.code === 0) {
        // 保存历史记录
        this.saveToHistory('destination', form.destination.trim())
        if (form.companions.trim()) {
          this.saveToHistory('companions', form.companions.trim())
        }

        // 处理同行人匹配结果提示
        const companionResults = res.result.data.companionResults
        let toastMessage = '报备成功'
        if (companionResults && companionResults.matched.length > 0) {
          wx.showModal({
            title: toastMessage,
            content: `报备成功，并已为 ${companionResults.matched.join('、')} 代报备。`,
            showCancel: false,
            confirmText: '好的'
          })
        } else {
          utils.showToast({
            title: toastMessage,
            icon: 'success'
          })
        }
        this.setData({
          showFormPopup: false
        })
        // 刷新数据
        this.loadActiveTrip()
        this.refreshList()
      } else {
        utils.showToast({
          title: res.result.message || '报备失败',
          icon: 'none'
        })
      }
    }).catch(error => {
      console.error('外出报备失败:', error)
      utils.showToast({
        title: '报备失败，请重试',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        submitting: false
      })
    })
  },

  /**
   * 返回报备
   */
  handleReturn() {
    const activeTrip = this.data.activeTrip
    if (!activeTrip) return

    wx.showModal({
      title: '确认返回',
      content: '确认已返回？将记录当前时间为返回时间。',
      success: (res) => {
        if (res.confirm) {
          this.confirmReturn(activeTrip._id)
        }
      }
    })
  },

  /**
   * 确认返回
   */
  confirmReturn(tripId) {
    if (this.data.submitting) return

    this.setData({
      submitting: true
    })

    wx.cloud.callFunction({
      name: 'tripReport',
      data: {
        action: 'return',
        params: {
          tripId
        }
      }
    }).then(res => {
      if (res.result.code === 0) {
        const status = res.result.data.status
        const message = status === 'overtime' ? '返回报备成功（超时）' : '返回报备成功'
        utils.showToast({
          title: message,
          icon: 'success'
        })
        // 刷新数据
        this.loadActiveTrip()
        this.refreshList()
      } else {
        utils.showToast({
          title: res.result.message || '报备失败',
          icon: 'none'
        })
      }
    }).catch(error => {
      console.error('返回报备失败:', error)
      utils.showToast({
        title: '报备失败，请重试',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        submitting: false
      })
    })
  },

  /**
   * 处理按钮点击
   */
  handleMainButton() {
    if (this.data.activeTrip) {
      // 有未返回的出行 → 返回报备
      this.handleReturn()
    } else {
      // 没有未返回的出行 → 外出报备
      this.showDepartForm()
    }
  },

  onReachBottom() {
    this.loadMore()
  },

  async onPullDownRefresh() {
    await this.loadActiveTrip()
    await this.refreshList()
    wx.stopPullDownRefresh()
  }
})