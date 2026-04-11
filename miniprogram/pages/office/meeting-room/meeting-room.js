/**
 * 会议室预约页面
 * 支持会议室选择、日期选择、时间轴预约查看、预约创建/编辑/删除
 */

const app = getApp()
const utils = require('../../../common/utils.js')

// 时间轴配置
const START_HOUR = 0 // 起始小时 0:00
const END_HOUR = 24 // 结束小时 24:00

// 会议室列表
const MEETING_ROOMS = [
  { id: 'room_260', name: '260会议室' },
  { id: 'room_3f', name: '3楼会议室' }
]

// 权限角色常量
const CAN_RESERVE_ROLES = ['馆领导', '部门负责人', '馆员', '工勤']
const CAN_VIEW_3F_ROLES = ['馆领导', '部门负责人', '馆员', '工勤']

Page({
  data: {
    // 会议室选择
    rooms: MEETING_ROOMS,
    selectedRoomId: MEETING_ROOMS[0].id,
    selectedRoomName: MEETING_ROOMS[0].name,

    // 日期选择
    dateList: [], // 7天日期列表
    selectedDate: '', // YYYY-MM-DD
    selectedDateIndex: 0,

    // 预约列表
    reservations: [],
    hours: Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR),

    // 当前时间线
    showCurrentTime: true,
    currentTimeTop: 0,
    currentTimeText: '',
    currentTimeView: '',

    // 弹窗状态
    showDetailPopup: false,
    showFormPopup: false,
    detailReservation: null,
    editingReservation: null,

    // 表单数据
    reservationForm: {
      title: '',
      roomId: '',
      roomName: '',
      date: '',
      startTime: '',
      endTime: '',
      description: ''
    },

    // 用户信息
    currentUser: null,
    userRole: '',
    canReserve: false,      // 是否可添加预约
    canView3FRoom: false,   // 是否可查看3楼会议室

    // 拖拽状态
    draggingReservation: null,   // 正在拖拽的预约
    dragType: null,              // 'start' | 'end' | 'move'
    dragStartY: 0,               // 拖拽起始Y坐标
    originalStartTime: '',       // 原始开始时间
    originalEndTime: '',         // 原始结束时间
    previewStartTime: '',        // 预览开始时间
    previewEndTime: '',          // 预览结束时间
    previewTop: 0,               // 预览 top
    previewHeight: 0,            // 预览 height

    // 长按检测（300ms时延）
    longPressTimer: null,        // 长按定时器
    pendingDragReservation: null,// 待确认的拖拽预约
    isDragActive: false,         // 是否已激活拖拽模式
    touchStartPos: null,         // 触摸起始位置 {x, y}

    // 时间轴创建临时会议块
    isCreatingReservation: false,      // 是否正在创建临时会议块
    tempReservation: null,             // 临时会议块数据
    tempReservationTimer: null,        // 长按创建的定时器
    tempTouchStartPos: null,           // 时间轴触摸起始位置
    isTempReservationFadingOut: false  // 临时会议块是否正在消失动画
  },

  // 实际测量的值（运行时获取）
  actualHourHeightPx: 0,  // 实际每小时的像素高度
  rpxToPxRatio: 0,        // rpx 到 px 的转换比例
  timelineContainerTop: 0, // 时间轴容器顶部位置
  scrollViewScrollTop: 0,  // scroll-view 滚动位置

  onLoad() {
    // 获取屏幕信息，计算 rpx 转 px 比例
    const windowInfo = wx.getWindowInfo()
    this.rpxToPxRatio = windowInfo.screenWidth / 750

    // 初始化日期列表
    this.initDateList()

    // 获取用户信息
    this.getCurrentUser()
  },

  onReady() {
    // 页面渲染完成后，测量实际的小时高度
    this.measureActualHourHeight()
  },

  /**
   * 测量实际的小时高度（动态获取，解决 rpx 精度问题）
   */
  measureActualHourHeight() {
    const query = this.createSelectorQuery()
    query.select('.hour-row').boundingClientRect()
    query.select('.timeline-container').boundingClientRect()
    query.select('.timeline-scroll').scrollOffset()
    query.exec((res) => {
      if (res[0]) {
        this.actualHourHeightPx = res[0].height
      }
      if (res[1]) {
        this.timelineContainerTop = res[1].top
      }
      if (res[2]) {
        this.scrollViewScrollTop = res[2].scrollTop
      }

      // 初始化当前时间线和加载预约
      this.updateCurrentTime()
      this.loadReservations()

      // 启动定时器
      this.timeInterval = setInterval(() => {
        this.updateCurrentTime()
      }, 60000)
    })
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
  if (this.data.fontStyle !== fontStyle) {
    this.setData({ fontStyle })
  }
    // 每次显示时重新加载预约列表（如果已完成测量）
    if (this.actualHourHeightPx > 0) {
      this.loadReservations()
    }
  },

  onUnload() {
    // 清除定时器
    if (this.timeInterval) {
      clearInterval(this.timeInterval)
    }
  },

  /**
   * 初始化日期列表（今天+往后6天）
   */
  initDateList() {
    const dateList = []
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)

      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const day = date.getDate()
      const weekDay = weekDays[date.getDay()]

      dateList.push({
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        weekDay: weekDay,
        day: day,
        monthDay: `${month}月${day}日`, // 完整月日显示
        reservationCount: 0 // 预约数（后续加载）
      })
    }

    // 默认选中今天
    const today = dateList[0].dateStr

    this.setData({
      dateList,
      selectedDate: today,
      selectedDateIndex: 0
    })
  },

  /**
   * 更新当前时间线
   */
  updateCurrentTime() {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()

    // 时间范围检查 (0-24)
    if (hour < START_HOUR || hour > END_HOUR) {
      this.setData({ showCurrentTime: false })
      return
    }

    // 计算位置（使用实际测量的像素高度）
    const timeOffset = hour + minute / 60
    const actualTopPx = timeOffset * this.actualHourHeightPx
    const currentTimeTop = actualTopPx / this.rpxToPxRatio  // 转换为 rpx

    // 格式化时间文本
    const currentTimeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

    // 自动滚动到当前时间附近
    const currentTimeView = `hour-${Math.max(0, hour - 1)}`

    this.setData({
      showCurrentTime: true,
      currentTimeTop,
      currentTimeText,
      currentTimeView
    })
  },

  /**
   * 获取当前用户信息（参考 calendar.js 权限检查方案）
   */
  getCurrentUser() {
    app.checkUserRegistration()
      .then((result) => {
        if (result.registered && result.user) {
          const user = result.user
          const isAdmin = user.isAdmin || user.role === 'admin'
          
          // 管理员拥有所有权限
          const canReserve = isAdmin || CAN_RESERVE_ROLES.includes(user.role)
          const canView3FRoom = isAdmin || CAN_VIEW_3F_ROLES.includes(user.role)
          
          this.setData({
            currentUser: user,
            userRole: user.role,
            canReserve,
            canView3FRoom
          })
        }
      })
      .catch(() => {
        // 静默失败
      })
  },

  /**
   * 切换会议室
   */
  handleRoomChange(e) {
    const roomId = e.currentTarget.dataset.roomId
    const room = this.data.rooms.find(r => r.id === roomId)

    // 物业角色访问3楼会议室权限检查
    if (roomId === 'room_3f' && !this.data.canView3FRoom) {
      wx.showModal({
        title: '权限提示',
        content: '无权限',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    if (room) {
      this.setData({
        selectedRoomId: roomId,
        selectedRoomName: room.name
      })
      this.loadReservations()
    }
  },

  /**
   * 切换日期
   */
  handleDateChange(e) {
    const index = e.currentTarget.dataset.index
    const dateItem = this.data.dateList[index]

    this.setData({
      selectedDate: dateItem.dateStr,
      selectedDateIndex: index
    })
    this.loadReservations()
  },

  /**
   * 加载预约列表
   */
  async loadReservations() {
    const { selectedRoomId, selectedDate } = this.data

    if (!selectedRoomId || !selectedDate) return

    wx.showLoading({ title: '加载中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'meetingRoomManager',
        data: {
          action: 'getMeetingRoomReservations',
          params: {
            roomId: selectedRoomId,
            date: selectedDate
          }
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        const reservations = res.result.data.list || []

        // 计算时间轴位置
        const reservationsWithPosition = this.calculateReservationPosition(reservations)

        this.setData({ reservations: reservationsWithPosition })
        
        // 更新日期选择器中的预约数
        this.loadDateReservationCounts()
      } else {
        utils.showToast({ title: res.result.message || '加载失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('加载预约列表失败:', error)
      utils.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  /**
   * 加载日期选择器中每个日期的预约数
   */
  async loadDateReservationCounts() {
    const { dateList, selectedRoomId } = this.data
    if (!dateList || dateList.length === 0) return

    try {
      const dates = dateList.map(item => item.dateStr)
      const res = await wx.cloud.callFunction({
        name: 'meetingRoomManager',
        data: {
          action: 'getBatchReservationCounts',
          params: {
            roomId: selectedRoomId,
            dates: dates
          }
        }
      })

      if (res.result.code === 0) {
        const counts = res.result.data.counts
        const updatedDateList = dateList.map(item => ({
          ...item,
          reservationCount: counts[item.dateStr] || 0
        }))
        this.setData({ dateList: updatedDateList })
      }
    } catch (error) {
      console.error('加载日期预约数失败:', error)
    }
  },

  /**
   * 计算预约在时间轴上的位置（简化版，单列显示）
   */
  calculateReservationPosition(reservations) {
    // 预约块的 margin-top（需要补偿）
    const MARGIN_TOP_RPX = 1

    return reservations.map((reservation) => {
      // 解析时间
      const [startHour, startMin] = reservation.startTime.split(':').map(Number)
      const [endHour, endMin] = reservation.endTime.split(':').map(Number)

      // 计算位置（使用实际测量的像素高度）
      const startOffset = startHour + startMin / 60
      const endOffset = endHour + endMin / 60

      const actualTopPx = startOffset * this.actualHourHeightPx
      const actualHeightPx = (endOffset - startOffset) * this.actualHourHeightPx

      // 转换为 rpx，并减去 margin-top 补偿
      const calculatedTop = (actualTopPx / this.rpxToPxRatio) - MARGIN_TOP_RPX
      const height = Math.max(actualHeightPx / this.rpxToPxRatio, 50)

      return {
        ...reservation,
        top: calculatedTop,
        height
      }
    })
  },

  /**
   * 显示添加预约弹窗
   */
  handleAddReservation() {
    // 权限检查
    if (!this.data.canReserve) {
      wx.showModal({
        title: '权限提示',
        content: '无权限',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    const { selectedRoomId, selectedRoomName, selectedDate } = this.data

    // 计算默认时间：当前时间向上取整到最近的30分钟
    const now = new Date()
    const { startTime, endTime } = this.getDefaultTime(now)

    this.setData({
      showFormPopup: true,
      editingReservation: null,
      reservationForm: {
        title: '',
        roomId: selectedRoomId,
        roomName: selectedRoomName,
        date: selectedDate,
        startTime,
        endTime,
        description: ''
      }
    })
  },

  /**
   * 获取默认时间（向上取整到最近的30分钟）
   */
  getDefaultTime(date) {
    const minutes = date.getMinutes()
    let hour = date.getHours()
    let minute = 0

    if (minutes > 0 && minutes <= 30) {
      minute = 30
    } else if (minutes > 30) {
      hour += 1
      minute = 0
    }

    const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const endHour = minute === 30 ? hour + 1 : hour
    const endMinute = minute === 30 ? 0 : 30
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`

    return { startTime, endTime }
  },

  /**
   * 点击预约块 - 显示详情
   */
  handleReservationTap(e) {
    const reservation = e.currentTarget.dataset.reservation
    this.setData({
      showDetailPopup: true,
      detailReservation: reservation
    })
  },

  /**
   * 时间轴触摸开始 - 启动300ms长按定时器创建临时会议块
   */
  handleTimelineTouchStart(e) {
    // 权限检查：只有有添加权限的用户才能创建
    if (!this.data.canReserve) {
      return
    }

    const touch = e.touches[0]
    const touchStartPos = { x: touch.clientX, y: touch.clientY }

    // 清除之前的定时器
    if (this.data.tempReservationTimer) {
      clearTimeout(this.data.tempReservationTimer)
    }

    // 只获取滚动位置，容器位置使用初始测量值（滚动后boundingClientRect会返回错误的值）
    const query = this.createSelectorQuery()
    query.select('.timeline-scroll').scrollOffset()
    query.exec((res) => {
      if (res[0]) {
        this.scrollViewScrollTop = res[0].scrollTop
      }

      // 位置信息获取后，再启动300ms长按定时器
      const tempReservationTimer = setTimeout(() => {
        this.createTempReservation(touchStartPos)
      }, 300)

      this.setData({
        tempReservationTimer,
        tempTouchStartPos: touchStartPos,
        isCreatingReservation: false
      })
    })
  },

  /**
   * 创建临时会议块（长按300ms后调用）
   */
  createTempReservation(touchStartPos) {
    const { currentUser, selectedRoomId, selectedRoomName, selectedDate } = this.data
    const userName = currentUser?.name || currentUser?.nickName || '用户'

    // 根据触摸Y坐标计算时间（吸附到最近的整点或半点）
    const timeInfo = this.getTimeFromTouchPosition(touchStartPos.y)
    const { startTime, endTime, top, height } = timeInfo

    // 创建临时会议块
    const tempReservation = {
      title: `${userName}的会议预约`,
      roomId: selectedRoomId,
      roomName: selectedRoomName,
      date: selectedDate,
      startTime,
      endTime,
      top,
      height
    }

    // 显示Toast提示
    wx.showToast({
      title: '拖拽到屏幕边缘可取消',
      icon: 'none',
      duration: 2000
    })

    this.setData({
      isCreatingReservation: true,
      tempReservation,
      tempTouchStartPos: touchStartPos
    })
  },

  /**
   * 根据触摸Y坐标计算时间（吸附到整点或半点，默认一小时）
   */
  getTimeFromTouchPosition(touchY) {
    const hourHeight = this.actualHourHeightPx

    // 计算触摸点相对于时间轴网格的位置
    const relativeY = touchY - this.timelineContainerTop + this.scrollViewScrollTop

    // 计算小时和分钟
    const totalMinutes = Math.floor((relativeY / hourHeight) * 60)

    // 吸附到最近的整点或半点
    let hour = Math.floor(totalMinutes / 60)
    let minute = totalMinutes % 60

    // 吸附逻辑：0-15分钟吸附到0，16-45分钟吸附到30，46-59分钟吸附到下一小时的0
    if (minute <= 15) {
      minute = 0
    } else if (minute <= 45) {
      minute = 30
    } else {
      hour += 1
      minute = 0
    }

    // 限制在0-24小时内
    if (hour < 0) { hour = 0; minute = 0 }
    if (hour >= 24) { hour = 23; minute = 30 }

    // 默认一小时
    const startHour = hour
    const startMin = minute
    let endHour = startHour + 1
    let endMin = startMin

    if (endHour >= 24) {
      endHour = 24
      endMin = 0
    }

    // 格式化时间
    const startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`

    // 计算位置
    const MARGIN_TOP_RPX = 1
    const startOffset = startHour + startMin / 60
    const endOffset = endHour + endMin / 60
    const topPx = startOffset * this.actualHourHeightPx
    const heightPx = (endOffset - startOffset) * this.actualHourHeightPx
    const top = (topPx / this.rpxToPxRatio) - MARGIN_TOP_RPX
    const height = Math.max(heightPx / this.rpxToPxRatio, 50)

    return { startTime, endTime, top, height }
  },

  /**
   * 时间轴触摸移动 - 处理临时会议块拖拽或边缘检测
   */
  handleTimelineTouchMove(e) {
    const { isCreatingReservation, tempReservationTimer, tempTouchStartPos, tempReservation } = this.data

    if (!isCreatingReservation && tempReservationTimer) {
      // 还未创建临时会议块，检测移动距离
      const touch = e.touches[0]
      const deltaX = touch.clientX - tempTouchStartPos.x
      const deltaY = touch.clientY - tempTouchStartPos.y
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      // 移动超过10px，取消长按创建
      if (distance > 10) {
        clearTimeout(tempReservationTimer)
        this.setData({
          tempReservationTimer: null,
          tempTouchStartPos: null
        })
      }
      return
    }

    if (!isCreatingReservation || !tempReservation) {
      return
    }

    // 已创建临时会议块，处理拖拽和边缘检测
    const touch = e.touches[0]
    const windowInfo = wx.getWindowInfo()
    const screenWidth = windowInfo.screenWidth
    const edgeThreshold = 50 // 边缘检测阈值（px）

    // 实时更新滚动位置
    const query = this.createSelectorQuery()
    query.select('.timeline-scroll').scrollOffset()
    query.exec((res) => {
      if (res[0]) {
        this.scrollViewScrollTop = res[0].scrollTop
      }
    })

    // 检测是否在屏幕左右边缘
    const isAtLeftEdge = touch.clientX <= edgeThreshold
    const isAtRightEdge = touch.clientX >= screenWidth - edgeThreshold

    if (isAtLeftEdge || isAtRightEdge) {
      // 在边缘，显示取消提示
      this.setData({
        'tempReservation.isCancelling': true
      })
    } else {
      // 不在边缘，更新临时会议块位置
      this.updateTempReservationPosition(touch.clientY)
      this.setData({
        'tempReservation.isCancelling': false
      })
    }
  },

  /**
   * 更新临时会议块位置（根据触摸Y坐标）
   */
  updateTempReservationPosition(touchY) {
    const timeInfo = this.getTimeFromTouchPosition(touchY)
    const { startTime, endTime, top, height } = timeInfo

    this.setData({
      'tempReservation.startTime': startTime,
      'tempReservation.endTime': endTime,
      'tempReservation.top': top,
      'tempReservation.height': height
    })
  },

  /**
   * 时间轴触摸结束 - 确认或取消创建
   */
  handleTimelineTouchEnd(e) {
    const { isCreatingReservation, tempReservationTimer, tempReservation } = this.data

    // 清除定时器
    if (tempReservationTimer) {
      clearTimeout(tempReservationTimer)
    }


    // 如果未创建临时会议块，不做任何操作
    if (!isCreatingReservation || !tempReservation) {
      this.setData({
        tempReservationTimer: null,
        tempTouchStartPos: null,
        isCreatingReservation: false,
        tempReservation: null
      })
      return
    }

    // 检查是否在边缘取消
    if (tempReservation.isCancelling) {
      // 触发 fadeout 动画后清除
      this.fadeOutTempReservation(() => {
        wx.showToast({
          title: '已取消创建',
          icon: 'none',
          duration: 1500
        })
      })
      return
    }

    // 确认创建，保存会议预约
    this.saveTempReservation()
  },

  /**
   * 临时会议块消失动画
   */
  fadeOutTempReservation(callback) {
    this.setData({ isTempReservationFadingOut: true })

    setTimeout(() => {
      this.setData({
        tempReservationTimer: null,
        tempTouchStartPos: null,
        isCreatingReservation: false,
        tempReservation: null,
        isTempReservationFadingOut: false
      })
      if (callback) callback()
    }, 250) // 动画时长
  },

  /**
   * 保存临时会议块为正式预约
   */
  async saveTempReservation() {
    const { tempReservation } = this.data

    if (!tempReservation) return

    wx.showLoading({ title: '创建中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'meetingRoomManager',
        data: {
          action: 'createMeetingRoomReservation',
          params: {
            title: tempReservation.title,
            roomId: tempReservation.roomId,
            roomName: tempReservation.roomName,
            date: tempReservation.date,
            startTime: tempReservation.startTime,
            endTime: tempReservation.endTime,
            description: ''
          },
          userInfo: this.data.currentUser
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        // 触发 fadeout 动画后刷新列表
        this.fadeOutTempReservation(() => {
          wx.showToast({
            title: '创建成功',
            icon: 'success',
            duration: 1500
          })
        })
        // 刷新预约列表
        this.loadReservations()
      } else {
        // 失败也触发 fadeout
        this.fadeOutTempReservation(() => {
          wx.showToast({
            title: res.result.message || '创建失败',
            icon: 'none',
            duration: 2000
          })
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('创建预约失败:', error)
      wx.showToast({
        title: '创建失败，请重试',
        icon: 'none',
        duration: 2000
      })

      // 清除临时状态
      this.setData({
        tempReservationTimer: null,
        tempTouchStartPos: null,
        isCreatingReservation: false,
        tempReservation: null
      })
    }
  },

  /**
   * 隐藏详情弹窗
   */
  hideDetailPopup() {
    this.setData({ showDetailPopup: false })
  },

  /**
   * 从详情进入编辑
   */
  handleEditFromDetail() {
    // 权限检查
    if (!this.data.canReserve) {
      wx.showModal({
        title: '权限提示',
        content: '无权限',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    const reservation = this.data.detailReservation
    const currentUser = this.data.currentUser

    // 检查是否是自己的预约
    if (currentUser && reservation.creatorId && reservation.creatorId !== currentUser.openid) {
      wx.showModal({
        title: '权限提示',
        content: '只能修改自己的预约',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    this.setData({
      showDetailPopup: false,
      showFormPopup: true,
      editingReservation: reservation,
      reservationForm: {
        title: reservation.title,
        roomId: reservation.roomId,
        roomName: reservation.roomName,
        date: reservation.date,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        description: reservation.description || ''
      }
    })
  },

  /**
   * 删除预约
   */
  async handleDeleteReservation() {
    const reservation = this.data.detailReservation
    if (!reservation) return

    // 权限检查
    if (!this.data.canReserve) {
      wx.showModal({
        title: '权限提示',
        content: '无权限',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    // 检查是否是自己的预约
    const currentUser = this.data.currentUser
    if (currentUser && reservation.creatorId && reservation.creatorId !== currentUser.openid) {
      wx.showModal({
        title: '权限提示',
        content: '只能删除自己的预约',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这个预约吗？',
        success: resolve
      })
    })

    if (!result.confirm) return

    wx.showLoading({ title: '删除中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'meetingRoomManager',
        data: {
          action: 'deleteMeetingRoomReservation',
          params: { meetingRoomReservationId: reservation._id },
          userInfo: this.data.currentUser
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        utils.showToast({ title: '删除成功', icon: 'success' })
        this.setData({ showDetailPopup: false })
        this.loadReservations()
      } else {
        utils.showToast({ title: res.result.message || '删除失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('删除预约失败:', error)
      utils.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
  },

  /**
   * 隐藏表单弹窗
   */
  hideFormPopup() {
    this.setData({ showFormPopup: false })
  },

  /**
   * 标题输入
   */
  handleTitleInput(e) {
    this.setData({ 'reservationForm.title': e.detail.value })
  },

  /**
   * 开始时间变化
   */
  handleStartTimeChange(e) {
    const { hour, minute } = e.detail
    const startTime = `${String(hour || 0).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`
    this.setData({ 'reservationForm.startTime': startTime })
  },

  /**
   * 结束时间变化
   */
  handleEndTimeChange(e) {
    const { hour, minute } = e.detail
    const endTime = `${String(hour || 0).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`
    this.setData({ 'reservationForm.endTime': endTime })
  },

  /**
   * 备注输入
   */
  handleDescriptionInput(e) {
    this.setData({ 'reservationForm.description': e.detail.value })
  },

  /**
   * 保存预约
   */
  async handleSaveReservation() {
    const { reservationForm, editingReservation } = this.data

    // 表单验证
    if (!reservationForm.title.trim()) {
      utils.showToast({ title: '请输入会议标题', icon: 'none' })
      return
    }

    if (!reservationForm.startTime || !reservationForm.endTime) {
      utils.showToast({ title: '请选择时间', icon: 'none' })
      return
    }

    if (reservationForm.startTime >= reservationForm.endTime) {
      utils.showToast({ title: '开始时间必须早于结束时间', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    try {
      let res
      if (editingReservation) {
        // 编辑模式
        res = await wx.cloud.callFunction({
          name: 'meetingRoomManager',
          data: {
            action: 'updateMeetingRoomReservation',
            params: {
              meetingRoomReservationId: editingReservation._id,
              ...reservationForm
            },
            userInfo: this.data.currentUser
          }
        })
      } else {
        // 新建模式
        res = await wx.cloud.callFunction({
          name: 'meetingRoomManager',
          data: {
            action: 'createMeetingRoomReservation',
            params: reservationForm,
            userInfo: this.data.currentUser
          }
        })
      }

      wx.hideLoading()

      if (res.result.code === 0) {
        utils.showToast({ title: editingReservation ? '更新成功' : '预约成功', icon: 'success' })
        this.setData({ showFormPopup: false })
        this.loadReservations()
      } else {
        utils.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('保存预约失败:', error)
      utils.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {},

  // ========================================
  // 拖拽功能
  // ========================================

  /**
   * 会议块触摸开始 - 启动300ms长按定时器
   */
  handleReservationTouchStart(e) {
    const reservation = e.currentTarget.dataset.reservation
    const touch = e.touches[0]

    // 记录触摸起始位置
    const touchStartPos = { x: touch.clientX, y: touch.clientY }

    // 清除之前的定时器
    if (this.data.longPressTimer) {
      clearTimeout(this.data.longPressTimer)
    }

    // 启动300ms长按定时器（所有用户都可以尝试拖拽）
    const longPressTimer = setTimeout(() => {
      // 长按触发，激活拖拽模式
      this.activateDragMode(reservation, touchStartPos)
    }, 300)

    // 设置 pendingDragReservation，用于点击显示详情或拖拽
    this.setData({
      longPressTimer,
      pendingDragReservation: reservation,
      isDragActive: false,
      touchStartPos
    })
  },

  /**
   * 激活拖拽模式（长按300ms后调用）
   */
  activateDragMode(reservation, touchStartPos) {
    const touch = { clientY: touchStartPos.y }
    
    // 获取会议块的高度和触摸点相对位置
    const query = wx.createSelectorQuery()
    query.select(`#reservation-${reservation._id}`).boundingClientRect()
    query.exec((res) => {
      if (!res[0]) return
      
      const rect = res[0]
      const relativeY = touchStartPos.y - rect.top
      const heightRatio = relativeY / rect.height
      
      // 根据触摸位置判断拖拽类型
      let dragType = 'move'
      if (heightRatio < 0.2) {
        dragType = 'start'  // 调整开始时间
      } else if (heightRatio > 0.8) {
        dragType = 'end'    // 调整结束时间
      }
      
      this.setData({
        isDragActive: true,
        draggingReservation: reservation,
        dragType,
        dragStartY: touchStartPos.y,
        originalStartTime: reservation.startTime,
        originalEndTime: reservation.endTime,
        previewStartTime: reservation.startTime,
        previewEndTime: reservation.endTime,
        previewTop: reservation.top,
        previewHeight: reservation.height
      })
      
      // 触觉反馈
      wx.vibrateShort({ type: 'medium' })
    })
  },

  /**
   * 会议块触摸移动 - 检测移动距离或执行拖拽
   */
  handleReservationTouchMove(e) {
    const { isDragActive, longPressTimer, touchStartPos, pendingDragReservation } = this.data
    
    // 如果还未激活拖拽模式，检测移动距离
    if (!isDragActive) {
      const touch = e.touches[0]
      const deltaX = touch.clientX - touchStartPos.x
      const deltaY = touch.clientY - touchStartPos.y
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      
      // 移动超过10px，取消长按定时器，不进入拖拽
      if (distance > 10 && longPressTimer) {
        clearTimeout(longPressTimer)
        this.setData({
          longPressTimer: null,
          pendingDragReservation: null
        })
      }
      return
    }
    
    // 已激活拖拽模式，执行拖拽逻辑
    const { draggingReservation, dragType, dragStartY, originalStartTime, originalEndTime } = this.data
    if (!draggingReservation) return

    const touch = e.touches[0]
    const deltaY = touch.clientY - dragStartY

    // 将像素转换为时间（使用实际测量的高度）
    const deltaTime = deltaY / this.actualHourHeightPx  // 小时
    
    // 解析原始时间
    const [startHour, startMin] = originalStartTime.split(':').map(Number)
    const [endHour, endMin] = originalEndTime.split(':').map(Number)
    
    let newStartHour = startHour
    let newStartMin = startMin
    let newEndHour = endHour
    let newEndMin = endMin
    
    if (dragType === 'start') {
      // 调整开始时间
      const startMinutes = startHour * 60 + startMin + Math.round(deltaTime * 60)
      const snappedStart = this.snapToHalfHour(startMinutes)
      newStartHour = Math.floor(snappedStart / 60)
      newStartMin = snappedStart % 60
    } else if (dragType === 'end') {
      // 调整结束时间
      const endMinutes = endHour * 60 + endMin + Math.round(deltaTime * 60)
      const snappedEnd = this.snapToHalfHour(endMinutes)
      newEndHour = Math.floor(snappedEnd / 60)
      newEndMin = snappedEnd % 60
    } else {
      // 整体移动
      const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin)
      const startMinutes = startHour * 60 + startMin + Math.round(deltaTime * 60)
      const snappedStart = this.snapToHalfHour(startMinutes)
      newStartHour = Math.floor(snappedStart / 60)
      newStartMin = snappedStart % 60
      const newEndMinutes = snappedStart + duration
      const snappedEnd = this.snapToHalfHour(newEndMinutes)
      newEndHour = Math.floor(snappedEnd / 60)
      newEndMin = snappedEnd % 60
    }
    
    // 时间范围限制
    if (newStartHour < 0) { newStartHour = 0; newStartMin = 0 }
    if (newStartHour >= 24) { newStartHour = 23; newStartMin = 30 }
    if (newEndHour < 0) { newEndHour = 0; newEndMin = 30 }
    if (newEndHour >= 24) { newEndHour = 24; newEndMin = 0 }
    
    // 确保开始时间 < 结束时间
    const newStartTotal = newStartHour * 60 + newStartMin
    const newEndTotal = newEndHour * 60 + newEndMin
    if (newStartTotal >= newEndTotal) {
      return  // 不允许开始时间 >= 结束时间
    }
    
    // 格式化时间
    const previewStartTime = `${String(newStartHour).padStart(2, '0')}:${String(newStartMin).padStart(2, '0')}`
    const previewEndTime = `${String(newEndHour).padStart(2, '0')}:${String(newEndMin).padStart(2, '0')}`

    // 计算预览位置（使用实际测量的高度，减去 margin 补偿）
    const MARGIN_TOP_RPX = 1
    const startOffset = newStartHour + newStartMin / 60
    const endOffset = newEndHour + newEndMin / 60
    const previewTopPx = startOffset * this.actualHourHeightPx
    const previewHeightPx = (endOffset - startOffset) * this.actualHourHeightPx
    const previewTop = (previewTopPx / this.rpxToPxRatio) - MARGIN_TOP_RPX
    const previewHeight = Math.max(previewHeightPx / this.rpxToPxRatio, 50)
    
    // 更新预览
    this.setData({
      previewStartTime,
      previewEndTime,
      previewTop,
      previewHeight
    })
    
    // 更新 reservations 数组中的位置
    const reservations = this.data.reservations.map(r => {
      if (r._id === draggingReservation._id) {
        return {
          ...r,
          startTime: previewStartTime,
          endTime: previewEndTime,
          top: previewTop,
          height: previewHeight
        }
      }
      return r
    })
    this.setData({ reservations })
  },

  /**
   * 会议块触摸结束 - 判断点击还是拖拽
   */
  handleReservationTouchEnd(e) {
    const { isDragActive, longPressTimer, pendingDragReservation, draggingReservation, originalStartTime, originalEndTime, previewStartTime, previewEndTime } = this.data

    // 清除定时器
    if (longPressTimer) {
      clearTimeout(longPressTimer)
    }

    // 如果未激活拖拽模式，则是点击操作，显示详情弹窗
    if (!isDragActive && pendingDragReservation) {
      this.setData({
        longPressTimer: null,
        pendingDragReservation: null,
        isDragActive: false,
        showDetailPopup: true,
        detailReservation: pendingDragReservation
      })
      return
    }

    // 已激活拖拽模式但 draggingReservation 为空
    if (!draggingReservation) {
      this.setData({
        longPressTimer: null,
        pendingDragReservation: null,
        isDragActive: false,
        draggingReservation: null,
        dragType: null
      })
      return
    }

    // 检查时间是否有变化
    if (previewStartTime === originalStartTime && previewEndTime === originalEndTime) {
      // 时间未变化，恢复状态
      this.setData({
        longPressTimer: null,
        pendingDragReservation: null,
        isDragActive: false,
        draggingReservation: null,
        dragType: null
      })
      return
    }

    // 权限验证（松手后检查）
    const currentUser = this.data.currentUser
    const hasPermission = this.data.canReserve &&
      (!currentUser || !draggingReservation.creatorId || draggingReservation.creatorId === currentUser.openid)

    if (!hasPermission) {
      // 无权限，显示提示并恢复位置
      const message = !this.data.canReserve
        ? '您没有操作权限'
        : '您无法修改他人创建的会议预约'

      wx.showModal({
        title: '权限提示',
        content: message,
        showCancel: false,
        confirmText: '我知道了',
        success: () => {
          // 恢复原位置
          this.restoreReservationPosition()
          this.setData({
            longPressTimer: null,
            pendingDragReservation: null,
            isDragActive: false,
            draggingReservation: null,
            dragType: null
          })
        }
      })
      return
    }

    // 有权限，弹出确认框
    wx.showModal({
      title: '修改会议时间',
      content: `将时间从 ${originalStartTime}-${originalEndTime} 修改为 ${previewStartTime}-${previewEndTime}？`,
      success: async (res) => {
        if (res.confirm) {
          // 确认修改，调用云函数更新
          await this.updateReservationTime(draggingReservation._id, previewStartTime, previewEndTime)
        } else {
          // 取消，恢复原位置
          this.restoreReservationPosition()
        }
        this.setData({
          longPressTimer: null,
          pendingDragReservation: null,
          isDragActive: false,
          draggingReservation: null,
          dragType: null
        })
      }
    })
  },

  /**
   * 吸附到整点或半点
   */
  snapToHalfHour(minutes) {
    const remainder = minutes % 30
    if (remainder < 15) {
      return minutes - remainder
    } else {
      return minutes + (30 - remainder)
    }
  },

  /**
   * 更新预约时间到服务器
   */
  async updateReservationTime(reservationId, startTime, endTime) {
    wx.showLoading({ title: '保存中...', mask: true })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'meetingRoomManager',
        data: {
          action: 'updateMeetingRoomReservation',
          params: {
            meetingRoomReservationId: reservationId,
            startTime,
            endTime
          },
          userInfo: this.data.currentUser
        }
      })
      
      wx.hideLoading()
      
      if (res.result.code === 0) {
        utils.showToast({ title: '修改成功', icon: 'success' })
        this.loadReservations()
      } else {
        utils.showToast({ title: res.result.message || '修改失败', icon: 'none' })
        this.restoreReservationPosition()
      }
    } catch (error) {
      wx.hideLoading()
      console.error('更新预约时间失败:', error)
      utils.showToast({ title: '修改失败', icon: 'none' })
      this.restoreReservationPosition()
    }
  },

  /**
   * 恢复预约位置
   */
  restoreReservationPosition() {
    const { draggingReservation, originalStartTime, originalEndTime } = this.data
    if (!draggingReservation) return

    const [startHour, startMin] = originalStartTime.split(':').map(Number)
    const [endHour, endMin] = originalEndTime.split(':').map(Number)

    // 使用实际测量的高度计算位置，减去 margin 补偿
    const MARGIN_TOP_RPX = 1
    const startOffset = startHour + startMin / 60
    const endOffset = endHour + endMin / 60
    const topPx = startOffset * this.actualHourHeightPx
    const heightPx = (endOffset - startOffset) * this.actualHourHeightPx
    const top = (topPx / this.rpxToPxRatio) - MARGIN_TOP_RPX
    const height = Math.max(heightPx / this.rpxToPxRatio, 50)
    
    const reservations = this.data.reservations.map(r => {
      if (r._id === draggingReservation._id) {
        return { ...r, startTime: originalStartTime, endTime: originalEndTime, top, height }
      }
      return r
    })
    this.setData({ reservations })
  }
})
