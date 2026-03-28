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
                    
                    // 检查当日14:20后是否禁用
                    const isFullyDisabled = calcDate.date === todayStr && this.isAfterDeadline()
                    
                    displayDates.push({
                        ...calcDate,
                        isHoliday: false,
                        isToday: calcDate.date === todayStr,
                        isDisabled: isFullyDisabled,
                        disableReason: isFullyDisabled ? '当前时间已过预约截止时间（当日14:20）' : '',
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
        // 周五18:00后、周六(6)、周日(0) 都显示下周
        const shouldShowNextWeek = (currentDayOfWeek === 5 && currentHour >= 18) ||
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

        // 如果日期禁用，不加载时段
        if (dateInfo.isDisabled) {
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
                const bookedSlots = res.result.data.slotsByDate[dateInfo.date] || []
                const bookedSet = new Set(bookedSlots)
                
                // 构建时段列表
                const slots = TIME_SLOTS.map(slot => ({
                    ...slot,
                    isBooked: bookedSet.has(slot.start)
                }))
                
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
        if (!slot || slot.isBooked) return

        // 直接设置选中时段并弹出预约弹窗
        this.setData({
            selectedSlot: slot.start,
            selectedSlotDisplay: slot.display
        })
        
        // 直接弹出预约弹窗
        this.showBookingForm()
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