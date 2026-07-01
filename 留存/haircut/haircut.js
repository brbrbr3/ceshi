/**
 * 理发预约页面
 * 
 * 数据流：
 * 1. 本地计算日期列表（周一、三、五）
 * 2. 获取节假日配置（跨年处理）
 * 3. 过滤掉节假日，前端提示"节假日无法理发"
 * 4. 调用后端获取非节假日日期的预约情况
 * 5. 本地组合数据渲染页面
 */

const app = getApp()

// 可查看理发预约的岗位
const HAIRCUT_VIEWER_POSITIONS = ['招待员', '会计主管', '会计', '出纳']

// 取消原因
const CANCEL_REASONS = [
    '招待员未履约',
    '预约人失约'
]

// 时段配置（与后端保持一致）
const TIME_SLOTS = [
    { start: '14:30', end: '15:00', display: '14:30~15:00' },
    { start: '15:00', end: '15:30', display: '15:00~15:30' },
    { start: '15:30', end: '16:00', display: '15:30~16:00' },
    { start: '16:00', end: '16:30', display: '16:00~16:30' },
    { start: '16:30', end: '17:00', display: '16:30~17:00' },
    { start: '17:00', end: '17:30', display: '17:00~17:30' },
    { start: '17:30', end: '18:00', display: '17:30~18:00' }
]

Page({
    data: {
        // 用户权限
        canView: false,
        isReceptionist: false,
        userName: '',
        userOpenId: '',

        // Tab
        activeTab: 'book',

        // 预约理发 Tab
        displayDates: [],
        selectedDate: '',
        selectedDateIndex: 0,
        selectedDateInfo: null,
        slots: [],
        slotsMessage: '',
        loadingSlots: false,
        selectedSlot: '',
        selectedSlotDisplay: '',

        // 理发统计 Tab
        statsList: [],
        statsGrouped: [],
        statsPage: 1,
        statsHasMore: true,
        statsTotalCount: 0,
        loadingstats: false,
        statsAllLoaded: false,
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
        cancellingSlot: null,
        cancelling: false,

        // 时间状态
        todayStr: ''
    },

    onLoad() {
        this.checkPermission()
    },

    onShow() {
        const fontStyle = app.globalData.fontStyle
        if (this.data.fontStyle !== fontStyle) {
            this.setData({ fontStyle })
        }
        this.setData({
            todayStr: this.formatLocalDate(new Date())
        })
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
                const canView = Array.isArray(user.position) && user.position.some(p => HAIRCUT_VIEWER_POSITIONS.includes(p))
                const isReceptionist = Array.isArray(user.position) && user.position.includes('招待员')
                this.setData({
                    canView,
                    isReceptionist,
                    userName: user.name,
                    userOpenId: user.openid || ''
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
        wx.showLoading({ title: '加载中...', mask: true })
        try {
            if (this.data.activeTab === 'book') {
                await this.loadDisplayDates()
            } else if (this.data.activeTab === 'stats') {
                await this.loadstatsAppointments()
            } else if (this.data.activeTab === 'mine') {
                await this.loadMyAppointments()
            }
        } finally {
            wx.hideLoading()
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
     * 流程：本地计算日期 -> 获取节假日 -> 过滤节假日 -> 获取预约情况 -> 组合数据
     */
    async loadDisplayDates() {
        try {
            // 1. 本地计算应该显示的日期（基于本地时间）
            const calculatedDates = this.calculateDisplayDates()

            // 2. 获取节假日配置（跨年处理）
            const holidaySet = await this.fetchHolidays(calculatedDates)

            // 3. 过滤节假日，生成最终显示的日期列表
            const displayDates = []
            const nonHolidayDates = [] // 非节假日日期，用于查询预约情况

            const now = new Date()
            const todayStr = this.formatLocalDate(now)

            calculatedDates.forEach(calcDate => {
                const isHoliday = holidaySet.has(calcDate.date)

                if (isHoliday) {
                    // 节假日：显示但标记为禁用，不传给后端
                    displayDates.push({
                        ...calcDate,
                        isHoliday: true,
                        isToday: calcDate.date === todayStr,
                        isDisabled: true,
                        disableReason: '今日为节假日，不提供理发服务',
                        reservationCount: 0
                    })
                } else {
                    // 非节假日：待后续填充预约数
                    nonHolidayDates.push(calcDate.date)

                    // 检查该日期是否已锁定（招待员不受限制）
                    const isDayLocked = this.isDateLocked(calcDate.date) && !this.data.isReceptionist

                    displayDates.push({
                        ...calcDate,
                        isHoliday: false,
                        isToday: calcDate.date === todayStr,
                        isDisabled: isDayLocked,
                        isDayLocked,
                        disableReason: isDayLocked ? (calcDate.date === todayStr ? '今日时段已锁定，请联系招待员' : '该日时段已锁定，请联系招待员') : '',
                        reservationCount: 0 // 待后续填充
                    })
                }
            })

            // 4. 获取非节假日日期的预约情况
            if (nonHolidayDates.length > 0) {
                const res = await wx.cloud.callFunction({
                    name: 'haircutManager',
                    data: {
                        action: 'getReservationSlots',
                        dates: nonHolidayDates
                    }
                })

                if (res.result.code === 0) {
                    const slotsByDate = res.result.data.slotsByDate || {}
                    // 填充预约数
                    displayDates.forEach(d => {
                        if (!d.isHoliday && slotsByDate[d.date]) {
                            d.reservationCount = slotsByDate[d.date].length
                        }
                    })
                }
            }

            // 5. 更新数据
            this.setData({ displayDates })
            // 默认选择第一个可用日期
            const availableIndex = displayDates.findIndex(d => !d.isDisabled)
            if (availableIndex !== -1) {
                this.setData({
                    selectedDateIndex: availableIndex,
                    selectedDate: displayDates[availableIndex].date,
                    selectedDateInfo: displayDates[availableIndex]
                })
                // 本地生成时段列表
                this.buildSlots(displayDates[availableIndex])
            } else if (displayDates.length > 0) {
                // 没有可用日期，选择第一个显示提示
                this.setData({
                    selectedDateIndex: 0,
                    selectedDate: displayDates[0].date,
                    selectedDateInfo: displayDates[0]
                })
            }
        } catch (error) {
            console.error('加载日期失败:', error)
            wx.showToast({ title: '加载失败', icon: 'none' })
        }
    },

    /**
     * 获取节假日配置（跨年处理）
     * @param {Array} dates - 日期列表，每项包含 date 字段
     * @returns {Set} 节假日日期集合
     */
    async fetchHolidays(dates) {
        const holidaySet = new Set()

        if (!dates || dates.length === 0) {
            return holidaySet
        }

        // 收集需要查询的年份
        const years = new Set()
        dates.forEach(d => {
            const year = parseInt(d.date.split('-')[0])
            years.add(year)
        })

        // 查询各年份的节假日配置
        const promises = []
        years.forEach(year => {
            promises.push(
                wx.cloud.callFunction({
                    name: 'holidayManager',
                    data: {
                        action: 'getByYear',
                        params: { year }
                    }
                })
            )
        })

        try {
            const results = await Promise.all(promises)
            results.forEach(res => {
                if (res.result.code === 0 && res.result.data.exists && res.result.data.config) {
                    const config = res.result.data.config
                    if (config.dates && Array.isArray(config.dates)) {
                        config.dates.forEach(d => holidaySet.add(d))
                    }
                }
            })
        } catch (error) {
            console.error('获取节假日失败:', error)
        }

        return holidaySet
    },

    /**
     * 判断当前时间是否已过截止时间（当日14:20）
     */
    isAfterDeadline() {
        const now = new Date()
        const currentHour = now.getHours()
        const currentMinute = now.getMinutes()
        const currentTime = currentHour * 60 + currentMinute
        const deadlineTime = 14 * 60 + 20 // 14:20
        return currentTime >= deadlineTime
    },

    /**
     * 判断指定日期是否已锁定（该日期的14:20已过，且锁永不解除）
     * 规则：如果指定日期 <= 今天，且（指定日期 < 今天 或 今天已过14:20），则该日期已锁定
     */
    isDateLocked(dateStr) {
        const todayStr = this.formatLocalDate(new Date())
        if (dateStr < todayStr) {
            // 过去的日期，一定已锁定
            return true
        }
        if (dateStr === todayStr) {
            // 今天，看是否过了14:20
            return this.isAfterDeadline()
        }
        // 未来的日期，未锁定
        return false
    },

    /**
     * 格式化本地日期为 YYYY-MM-DD
     */
    formatLocalDate(date) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    },

    /**
     * 计算应该显示的日期（本地时间）
     * 规则：周五18:00后、周六、周日显示下周的周一三五，否则显示本周的周一三五
     */
    calculateDisplayDates() {
        const now = new Date()
        const currentDayOfWeek = now.getDay() // 0=周日, 5=周五, 6=周六
        const currentHour = now.getHours()

        // 判断是否应该显示下周
        // 周五22:00后、周六(6)、周日(0) 都显示下周
        const shouldShowNextWeek = (currentDayOfWeek === 5 && currentHour >= 22) ||
            currentDayOfWeek === 6 ||
            currentDayOfWeek === 0

        // 计算本周的周一
        const mondayOfThisWeek = new Date(now)
        mondayOfThisWeek.setHours(0, 0, 0, 0)

        if (currentDayOfWeek === 0) {
            // 周日，本周周一是6天前
            mondayOfThisWeek.setDate(mondayOfThisWeek.getDate() - 6)
        } else {
            // 周一到周六，本周周一是 (currentDayOfWeek - 1) 天前
            mondayOfThisWeek.setDate(mondayOfThisWeek.getDate() - (currentDayOfWeek - 1))
        }

        // 根据是否显示下周，确定基准周一
        let baseMonday = new Date(mondayOfThisWeek)
        if (shouldShowNextWeek) {
            baseMonday.setDate(baseMonday.getDate() + 7)
        }

        // 生成周一、周三、周五的日期
        const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
        const dayOffsets = [0, 2, 4] // 周一、周三、周五相对于周一的偏移
        const dates = []

        for (const offset of dayOffsets) {
            const targetDate = new Date(baseMonday)
            targetDate.setDate(targetDate.getDate() + offset)

            const year = targetDate.getFullYear()
            const month = targetDate.getMonth() + 1
            const day = targetDate.getDate()
            const dayOfWeek = targetDate.getDay()

            dates.push({
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                weekDay: weekDays[dayOfWeek === 0 ? 6 : dayOfWeek - 1],
                monthDay: `${month}月${day}日`,
                dayOfWeek: ['日', '一', '二', '三', '四', '五', '六'][dayOfWeek]
            })
        }
        return dates
    },

    /**
     * 选择日期
     */
    async handleDateSelect(e) {
        const index = e.currentTarget.dataset.index
        const dateInfo = e.currentTarget.dataset.date
        if (!dateInfo) return

        this.setData({
            selectedDate: dateInfo.date,
            selectedDateIndex: index,
            selectedDateInfo: dateInfo,
            selectedSlot: '',
            selectedSlotDisplay: '',
            slots: []
        })

        // 仅节假日阻止加载时段，截止时间锁定的日期仍可查看
        if (dateInfo.isDisabled && !dateInfo.isDayLocked) {
            return
        }

        // 本地生成时段列表
        this.buildSlots(dateInfo)
    },

    /**
     * 本地生成时段列表
     * @param {Object} dateInfo - 日期信息，包含 date 字段
     */
    async buildSlots(dateInfo) {
        this.setData({ loadingSlots: true })
        try {
            // 查询该日期的已预约时段
            const res = await wx.cloud.callFunction({
                name: 'haircutManager',
                data: {
                    action: 'getReservationSlots',
                    dates: [dateInfo.date]
                }
            })

            if (res.result.code === 0) {
                const bookedData = res.result.data.slotsByDate[dateInfo.date] || []

                // 构建时段列表
                const slots = TIME_SLOTS.map(slot => {
                    // 查找该时段的预约信息
                    const bookingInfo = bookedData.find(b => b.timeSlot === slot.start)

                    // 判断是否为我已预约
                    const isMyBooking = bookingInfo &&
                        bookingInfo.status === 'booked' &&
                        bookingInfo.bookerId === this.data.userOpenId

                    // 确定时段状态
                    let slotStatus = 'available' // 默认可预约
                    let statusLabel = '可预约'

                    if (bookingInfo) {
                        if (bookingInfo.status === 'unavailable') {
                            slotStatus = 'unavailable'
                            statusLabel = '不可预约'
                        } else if (isMyBooking) {
                            slotStatus = 'myBooked'
                            statusLabel = '我已预约'
                        } else {
                            slotStatus = 'booked'
                            statusLabel = '已被预约'
                        }
                    }

                    return {
                        ...slot,
                        status: slotStatus,
                        statusLabel,
                        isMyBooking,
                        bookingInfo: bookingInfo || null
                    }
                })

                this.setData({
                    slots,
                    slotsMessage: ''
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
     * 选择时段（直接弹出预约弹窗）
     */
    handleSlotSelect(e) {
        const slot = e.currentTarget.dataset.slot
        if (!slot) return

        // 当日时段已锁定（普通用户14:20后）
        if (this.data.selectedDateInfo && this.data.selectedDateInfo.isDayLocked) {
            wx.showModal({
                title: '提示',
                content: '当日时段已锁定，请联系招待员',
                showCancel: false
            })
            return
        }

        // 不可预约的时段
        if (slot.status === 'unavailable') return

        // 已被他人预约的时段
        if (slot.status === 'booked') return

        // 我已预约的时段 - 无操作
        if (slot.status === 'myBooked') return

        // 可预约时段 - 弹出预约弹窗
        this.setData({
            selectedSlot: slot.start,
            selectedSlotDisplay: slot.display
        })
        this.showBookingForm()
    },

    /**
     * 取消我的预约（从时段列表）
     */
    async handleCancelMySlot(slot) {
        if (!this.data.isReceptionist && this.data.selectedDateInfo && this.data.selectedDateInfo.isDayLocked) {
            wx.showToast({ title: '该日期时段已锁定，无法取消', icon: 'none' })
            return
        }

        const res = await wx.showModal({
            title: '确认取消',
            content: `确定要取消 ${this.data.selectedDate} ${slot.display} 的预约吗？`,
            confirmText: '确认取消',
            confirmColor: '#DC2626'
        })

        if (!res.confirm) return

        try {
            const result = await wx.cloud.callFunction({
                name: 'haircutManager',
                data: {
                    action: 'cancelAppointment',
                    appointmentId: String(slot.bookingInfo._id)
                }
            })

            if (result.result.code === 0) {
                wx.showToast({ title: '取消成功', icon: 'success' })
                this.buildSlots(this.data.selectedDateInfo)
                this.loadDisplayDates()
            } else {
                wx.showToast({ title: result.result.message || '取消失败', icon: 'none' })
            }
        } catch (error) {
            console.error('取消失败:', error)
            wx.showToast({ title: '取消失败', icon: 'none' })
        }
    },


    /**
     * 招待员操作时段（点击操作按钮）
     */
    async handleSlotAction(e) {
        const slot = e.currentTarget.dataset.slot
        if (!slot) return

        // 已被他人预约 - 取消预约
        if (slot.status === 'booked') {
            this.showCancelSlotPopup(slot)
            return
        }

        // 可预约 - 设为不可预约
        if (slot.status === 'available') {
            const res = await wx.showModal({
                title: '设为不可预约',
                content: `确定将 ${this.data.selectedDate} ${slot.display} 设为不可预约的时段吗？`,
                confirmText: '确认',
                confirmColor: '#EA580C'
            })

            if (!res.confirm) return

            try {
                const result = await wx.cloud.callFunction({
                    name: 'haircutManager',
                    data: {
                        action: 'setSlotStatus',
                        date: this.data.selectedDate,
                        timeSlot: slot.start,
                        status: 'unavailable'
                    }
                })

                if (result.result.code === 0) {
                    wx.showToast({ title: '设置成功', icon: 'success' })
                    this.buildSlots(this.data.selectedDateInfo)
                    this.loadDisplayDates()
                } else {
                    wx.showToast({ title: result.result.message || '设置失败', icon: 'none' })
                }
            } catch (error) {
                console.error('设置失败:', error)
                wx.showToast({ title: '设置失败', icon: 'none' })
            }
            return
        }

        // 不可预约 - 恢复为可预约
        if (slot.status === 'unavailable') {
            const res = await wx.showModal({
                title: '恢复为可预约',
                content: `确定将 ${this.data.selectedDate} ${slot.display} 恢复为可预约的时段吗？`,
                confirmText: '确认',
                confirmColor: '#10B981'
            })

            if (!res.confirm) return

            try {
                const result = await wx.cloud.callFunction({
                    name: 'haircutManager',
                    data: {
                        action: 'setSlotStatus',
                        date: this.data.selectedDate,
                        timeSlot: slot.start,
                        status: 'available'
                    }
                })

                if (result.result.code === 0) {
                    wx.showToast({ title: '恢复成功', icon: 'success' })
                    this.buildSlots(this.data.selectedDateInfo)
                    this.loadDisplayDates()
                } else {
                    wx.showToast({ title: result.result.message || '恢复失败', icon: 'none' })
                }
            } catch (error) {
                console.error('恢复失败:', error)
                wx.showToast({ title: '恢复失败', icon: 'none' })
            }
            return
        }

        // 我已预约 - 取消我的预约
        if (slot.status === 'myBooked') {
            this.handleCancelMySlot(slot)
            return
        }
    },

    /**
     * 显示取消预约弹窗（招待员）
     */
    showCancelSlotPopup(e) {
        const slot = e.currentTarget ? e.currentTarget.dataset.slot : e
        if (!slot || slot.status !== 'booked') return

        this.setData({
            showCancelPopup: true,
            cancellingSlot: slot,
            cancelReason: ''
        })
    },

    /**
     * 确认取消预约（招待员）
     */
    async handleConfirmCancelSlot() {
        if (!this.data.cancelReason) {
            wx.showToast({ title: '请选择取消原因', icon: 'none' })
            return
        }

        const slot = this.data.cancellingSlot
        if (!slot) return

        this.setData({ cancelling: true })
        try {
            const res = await wx.cloud.callFunction({
                name: 'haircutManager',
                data: {
                    action: 'cancelAppointmentByReceptionist',
                    date: this.data.selectedDate,
                    timeSlot: slot.start,
                    cancelReason: this.data.cancelReason
                }
            })

            if (res.result.code === 0) {
                wx.showToast({ title: '取消成功', icon: 'success' })
                this.setData({ showCancelPopup: false, cancellingSlot: null, cancelReason: '' })
                this.buildSlots(this.data.selectedDateInfo)
                this.loadDisplayDates()
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
                this.buildSlots(this.data.selectedDateInfo)
                // 刷新日期列表（更新预约数）
                this.loadDisplayDates()
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

    // ==================== 理发统计 Tab ====================

    /**
     * 加载理发统计（重置分页）
     */
    async loadstatsAppointments() {
        if (!this.data.canView) return

        this.setData({
            loadingstats: true,
            statsList: [],
            statsGrouped: [],
            statsPage: 1,
            statsHasMore: true,
            statsTotalCount: 0,
            statsAllLoaded: false
        })
        await this.fetchStatsAppointments()
    },

    /**
     * 获取理发统计数据（按时间排序时分页，按人员排序时全量获取）
     */
    async fetchStatsAppointments() {
        try {
            const params = {
                sortBy: this.data.sortBy
            }

            // 按时间排序时启用分页
            if (this.data.sortBy === 'time') {
                params.page = this.data.statsPage
                params.pageSize = 10
            }

            const res = await wx.cloud.callFunction({
                name: 'haircutManager',
                data: {
                    action: 'getAppointments',
                    params
                }
            })

            if (res.result.code === 0) {
                const data = res.result.data

                if (this.data.sortBy === 'time') {
                    // 按时间排序：分页模式
                    const newList = data.list || []
                    const hasMore = data.hasMore || false

                    // 追加到已有列表（首页替换）
                    const mergedList = this.data.statsPage === 1
                        ? newList
                        : this.data.statsList.concat(newList)

                    this.setData({
                        statsTotalCount: data.total || 0,
                        statsHasMore: hasMore,
                        statsAllLoaded: !hasMore,
                        loadingstats: false
                    })

                    this.processStatsByTime(mergedList)
                } else {
                    // 按人员排序：全量获取，一次性聚合
                    const allList = data.list || []
                    this.setData({
                        statsAllLoaded: true,
                        statsTotalCount: allList.length,
                        statsHasMore: false,
                        loadingstats: false
                    })
                    this.processStatsByName(allList)
                }
            }
        } catch (error) {
            console.error('加载理发统计失败:', error)
            wx.showToast({ title: '加载失败', icon: 'none' })
        } finally {
            this.setData({ loadingstats: false })
        }
    },

    /**
     * 按时间排序：按月分组，过去日期标记已完成（支持分页追加）
     */
    processStatsByTime(list) {
        const todayStr = this.data.todayStr
        // 按月分组
        const groupMap = {}
        list.forEach(item => {
            const monthKey = item.date.substring(0, 7) // "2026-03"
            if (!groupMap[monthKey]) {
                const [y, m] = monthKey.split('-')
                groupMap[monthKey] = {
                    monthKey,
                    monthLabel: `${parseInt(y)}年${parseInt(m)}月`,
                    items: []
                }
            }
            // 日期在今日之前的标记为已完成
            const isPast = item.status === 'booked' && item.date < todayStr
            groupMap[monthKey].items.push({
                ...item,
                displayStatus: isPast ? 'completed' : item.status
            })
        })

        // 月份倒序排列（最新月份在前）
        const groups = Object.values(groupMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
        this.setData({
            statsList: list,
            statsGrouped: groups
        })
    },

    /**
     * 触底加载更多（仅按时间排序时生效）
     */
    async loadMoreStatsAppointments() {
        if (!this.data.statsHasMore || this.data.loadingstats) return
        if (this.data.sortBy !== 'time') return

        this.setData({ loadingstats: true })
        this.setData({ statsPage: this.data.statsPage + 1 })
        await this.fetchStatsAppointments()
    },

    /**
     * 按人员排序：按月分组，每月内统计每人理发次数并倒序
     */
    processStatsByName(list) {
        // 只统计非取消的记录
        const activeList = list.filter(item => item.status !== 'cancelled')

        // 按月分组
        const groupMap = {}
        activeList.forEach(item => {
            const monthKey = item.date.substring(0, 7)
            if (!groupMap[monthKey]) {
                const [y, m] = monthKey.split('-')
                groupMap[monthKey] = {
                    monthKey,
                    monthLabel: `${parseInt(y)}年${parseInt(m)}月`,
                    items: []
                }
            }
            // 统计人名和次数
            const existing = groupMap[monthKey].items.find(i => i.appointeeName === item.appointeeName)
            if (existing) {
                existing.count++
            } else {
                groupMap[monthKey].items.push({
                    appointeeName: item.appointeeName,
                    count: 1
                })
            }
        })

        // 每月内按次数倒序，月份倒序
        const groups = Object.values(groupMap)
        groups.forEach(g => {
            g.items.sort((a, b) => b.count - a.count || a.appointeeName.localeCompare(b.appointeeName, 'zh-CN'))
        })
        groups.sort((a, b) => b.monthKey.localeCompare(a.monthKey))

        this.setData({
            statsList: list,
            statsGrouped: groups
        })
    },

    /**
     * 排序切换
     */
    handleSortChange(e) {
        const sortBy = e.currentTarget.dataset.sort
        if (sortBy === this.data.sortBy) return

        this.setData({ sortBy })
        this.loadstatsAppointments()
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
        this.setData({ showCancelPopup: false, cancellingAppointment: null, cancellingSlot: null, cancelReason: '' })
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
            // 判断是从预约统计列表取消还是从时段列表取消
            if (this.data.cancellingSlot) {
                // 从时段列表取消（招待员）
                const res = await wx.cloud.callFunction({
                    name: 'haircutManager',
                    data: {
                        action: 'cancelAppointmentByReceptionist',
                        date: this.data.selectedDate,
                        timeSlot: this.data.cancellingSlot.start,
                        cancelReason: this.data.cancelReason
                    }
                })

                if (res.result.code === 0) {
                    wx.showToast({ title: '取消成功', icon: 'success' })
                    this.hideCancelPopup()
                    this.buildSlots(this.data.selectedDateInfo)
                    this.loadDisplayDates()
                } else {
                    wx.showToast({ title: res.result.message || '取消失败', icon: 'none' })
                }
            } else if (this.data.cancellingAppointment) {
                // 从预约统计列表取消
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
                    this.loadstatsAppointments()
                } else {
                    wx.showToast({ title: res.result.message || '取消失败', icon: 'none' })
                }
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
                // 为每条预约标记是否已锁定（已过该日期的14:20）
                const enrichedList = list.map(item => ({
                    ...item,
                    isDateLocked: this.isDateLocked(item.date),
                    displayStatus: item.status === 'booked' && item.date < this.data.todayStr ? 'completed' : item.status
                }))
                this.setData({
                    myList: this.data.myList.concat(enrichedList),
                    hasMoreMine: this.data.myList.length + enrichedList.length < total
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

        // 前端校验：已锁定日期不允许取消（招待员不受限制）
        if (!this.data.isReceptionist && this.isDateLocked(item.date)) {
            wx.showToast({ title: '该日期时段已锁定，无法取消', icon: 'none' })
            return
        }

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