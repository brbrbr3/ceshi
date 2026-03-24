/**
 * 会议室预约页面
 * 支持会议室选择、日期选择、时间轴预约查看、预约创建/编辑/删除
 */

const app = getApp()
const utils = require('../../../common/utils.js')

// 时间轴配置
const HOUR_HEIGHT = 100 // 每小时高度 rpx
const START_HOUR = 0 // 起始小时 0:00
const END_HOUR = 24 // 结束小时 24:00

// 会议室列表
const MEETING_ROOMS = [
  { id: 'room_260', name: '260会议室' },
  { id: 'room_3f', name: '3楼会议室' }
]

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
    currentUser: null
  },

  onLoad() {
    // 初始化日期列表
    this.initDateList()

    // 初始化当前时间线
    this.updateCurrentTime()

    // 每分钟更新时间线
    this.timeInterval = setInterval(() => {
      this.updateCurrentTime()
    }, 60000)

    // 获取用户信息
    this.getCurrentUser()
  },

  onShow() {
    // 每次显示时重新加载预约列表
    this.loadReservations()
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

    // 计算位置
    const timeOffset = hour + minute / 60
    const currentTimeTop = timeOffset * HOUR_HEIGHT

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
   * 获取当前用户信息
   */
  getCurrentUser() {
    app.checkUserRegistration()
      .then((result) => {
        if (result.registered && result.user) {
          this.setData({ currentUser: result.user })
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
      // 批量获取每个日期的预约数
      const promises = dateList.map(async (dateItem) => {
        const res = await wx.cloud.callFunction({
          name: 'meetingRoomManager',
          data: {
            action: 'getMeetingRoomReservationCount',
            params: {
              roomId: selectedRoomId,
              date: dateItem.dateStr
            }
          }
        })
        return res.result.code === 0 ? res.result.data.count : 0
      })

      const counts = await Promise.all(promises)

      // 更新dateList
      const updatedDateList = dateList.map((item, index) => ({
        ...item,
        reservationCount: counts[index] || 0
      }))

      this.setData({ dateList: updatedDateList })
    } catch (error) {
      console.error('加载日期预约数失败:', error)
    }
  },

  /**
   * 计算预约在时间轴上的位置（简化版，单列显示）
   */
  calculateReservationPosition(reservations) {
    return reservations.map(reservation => {
      // 解析时间
      const [startHour, startMin] = reservation.startTime.split(':').map(Number)
      const [endHour, endMin] = reservation.endTime.split(':').map(Number)

      // 计算位置
      const startOffset = startHour + startMin / 60
      const endOffset = endHour + endMin / 60

      const top = startOffset * HOUR_HEIGHT
      const height = Math.max((endOffset - startOffset) * HOUR_HEIGHT, 50) // 最小高度 50rpx

      return {
        ...reservation,
        top,
        height
      }
    })
  },

  /**
   * 显示添加预约弹窗
   */
  handleAddReservation() {
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
   * 长按时间轴添加预约
   */
  handleTimelineLongPress(e) {
    // 获取触摸点的Y坐标（相对于时间轴容器）
    const touch = e.touches[0]
    // 这里简化处理，直接打开添加弹窗
    this.handleAddReservation()
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
    const reservation = this.data.detailReservation

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
  stopPropagation() {}
})
