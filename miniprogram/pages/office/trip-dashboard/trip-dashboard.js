import uCharts from '@qiun/wx-ucharts/src/u-charts'

const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

var personChartInstance = null

// 状态样式映射
const STATUS_STYLE = {
  out: { color: '#2563EB', bg: '#EFF6FF', icon: '🚗', text: '外出中' },
  returned: { color: '#16A34A', bg: '#DCFCE7', icon: '✓', text: '已返回' },
  overtime: { color: '#DC2626', bg: '#FEE2E2', icon: '⚠', text: '超时' }
}

Page({
  behaviors: [paginationBehavior],

  data: {
    loading: false,
    activeTab: 'overview',     // 当前选中的tab: overview, records, stats
    departmentOptions: [],     // 部门选项
    selectedDepartment: 'all', // 当前选中的部门
    currentUser: null,
    userRole: '',              // 用户角色
    canViewAll: false,         // 是否可查看全部数据
    
    // 统计时长
    timeRangeOptions: ['本月', '过去一个月', '过去三个月', '过去半年'],
    selectedTimeRangeIndex: 0,  // 默认"本月"
    
    // 今日概览数据
    todayOverview: {
      totalOut: 0,
      activeTrips: []
    },
    
    // 统计数据
    statistics: {
      total: 0,
      byStatus: {},
      byTravelMode: {},
      byDepartment: {}
    },
    
    // 出行记录列表
    tripList: [],
    
    // 图表数据
    chartData: {
      modeLabels: [],
      modeValues: [],
      deptLabels: [],
      deptValues: [],
      personCategories: [],
      personValues: []
    }
  },

  async onLoad() {
    // 显示加载中提示
    wx.showLoading({ title: '加载中...', mask: true })
    
    try {
      // 检查权限
      const hasAccess = await this.checkPermission()
      if (!hasAccess) {
        wx.hideLoading()
        return
      }

      // 初始化分页配置
      this.initPagination({
        initialPageSize: 10,
        loadMorePageSize: 10
      })

      // 加载常量配置
      await this.loadConstants()
      
      // 加载数据
      await this.loadAllData()
    } finally {
      wx.hideLoading()
    }
  },

  onShow() {
    // 字体缩放
    const fontScale = app.globalData.fontScale || 1
    if (this.data.fontScale !== fontScale) {
      this.setData({
        fontScale,
        pageStyle: `--font-scale: ${fontScale}`
      })
    }
    // onShow 不再重复加载数据，避免重复请求
    // 数据已在 onLoad 中加载
  },

  /**
   * 检查权限
   */
  async checkPermission() {
    try {
      const result = await app.checkUserRegistration()
      if (!result.registered || !result.user) {
        wx.reLaunch({ url: '/pages/auth/login/login' })
        return false
      }

      const user = result.user
      const dashboardRoles = await app.getConstant('TRIP_DASHBOARD_ROLES')
      const allowedRoles = dashboardRoles || ['馆领导', '部门负责人', 'admin']
      
      // 检查是否有权限
      const isAdmin = user.isAdmin || user.role === 'admin'
      const isLeader = user.role === '馆领导'
      const isDeptHead = user.role === '部门负责人'
      const canViewAll = isAdmin || isLeader || isDeptHead

      if (!canViewAll) {
        wx.showModal({
          title: '权限不足',
          content: '您没有权限访问此页面',
          showCancel: false,
          success: () => {
            wx.navigateBack()
          }
        })
        return false
      }

      this.setData({
        currentUser: user,
        userRole: user.role,
        canViewAll,
        selectedDepartment: (isLeader || isAdmin) ? 'all' : (user.department || 'all')
      })

      return true
    } catch (error) {
      console.error('权限检查失败:', error)
      wx.showToast({ title: '权限检查失败', icon: 'none' })
      return false
    }
  },

  /**
   * 加载常量配置
   */
  async loadConstants() {
    try {
      const departmentOptions = await app.getConstant('DEPARTMENT_OPTIONS')
      // 部门负责人只能选自己所在部门
      if (this.data.userRole === '部门负责人' && this.data.currentUser && this.data.currentUser.department) {
        this.setData({
          departmentOptions: [this.data.currentUser.department]
        })
      } else {
        this.setData({
          departmentOptions: ['全部', ...(departmentOptions || [])]
        })
      }
    } catch (error) {
      console.error('加载常量配置失败:', error)
      if (this.data.userRole === '部门负责人' && this.data.currentUser && this.data.currentUser.department) {
        this.setData({
          departmentOptions: [this.data.currentUser.department]
        })
      } else {
        this.setData({
          departmentOptions: ['全部', '政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', 'DW办']
        })
      }
    }
  },

  /**
   * 加载所有数据
   */
  async loadAllData() {
    this.setData({ loading: true })

    try {
      await Promise.all([
        this.loadTodayOverview(),
        this.loadStatistics()
      ])

      // 加载记录列表
      await this.refreshList()
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 加载今日概览
   */
  async loadTodayOverview() {
    try {
      // 当前外出人员：查询所有 status='out' 的记录（不限日期，因为未返回人员可能是之前出发的）
      const activeParams = {
        status: 'out',
        pageSize: 100
      }
      if (this.data.selectedDepartment !== 'all') {
        activeParams.department = this.data.selectedDepartment
      }

      const activeRes = await wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getAllTrips',
          params: activeParams
        }
      })

      if (activeRes.result.code === 0) {
        const activeTrips = (activeRes.result.data.list || []).map(t => this.formatTripItem(t))

        this.setData({
          'todayOverview.totalOut': activeTrips.length,
          'todayOverview.activeTrips': activeTrips
        })
      }
    } catch (error) {
      console.error('加载今日概览失败:', error)
    }
  },

  /**
   * 加载统计数据
   */
  async loadStatistics() {
    try {
      const params = {}
      
      // 根据权限设置部门筛选
      if (this.data.selectedDepartment !== 'all') {
        params.department = this.data.selectedDepartment
      }

      // 根据统计时长计算 dateStart
      const now = new Date()
      let dateLabel = ''
      switch (this.data.timeRangeOptions[this.data.selectedTimeRangeIndex]) {
        case '本月':
          dateLabel = '本月'
          params.dateStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
          break
        case '过去一个月':
          dateLabel = '过去一个月'
          params.dateStart = now.getTime() - 30 * 24 * 60 * 60 * 1000
          break
        case '过去三个月':
          dateLabel = '过去三个月'
          params.dateStart = now.getTime() - 90 * 24 * 60 * 60 * 1000
          break
        case '过去半年':
          dateLabel = '过去半年'
          params.dateStart = now.getTime() - 180 * 24 * 60 * 60 * 1000
          break
      }

      const res = await wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getStatistics',
          params
        }
      })

      if (res.result.code === 0) {
        const stats = res.result.data
        
        // 准备图表数据 - 预计算百分比（WXML不支持Math.max(...arr)）
        const modeLabels = Object.keys(stats.byTravelMode || {})
        const modeValues = Object.values(stats.byTravelMode || {})
        const deptLabels = Object.keys(stats.byDepartment || {})
        const deptValues = Object.values(stats.byDepartment || {})

        // 计算最大值，避免除零
        const modeMax = modeValues.length > 0 ? Math.max(...modeValues) : 1
        const deptMax = deptValues.length > 0 ? Math.max(...deptValues) : 1

        // 按人统计数据（用于 uCharts 柱形图）
        const byPerson = stats.byPerson || []
        const personCategories = byPerson.map(p => p.name)
        const personValues = byPerson.map(p => p.count)

        const chartData = {
          modeLabels,
          modeValues,
          modePercentages: modeValues.map(v => (v / modeMax * 100).toFixed(1)),
          deptLabels,
          deptValues,
          deptPercentages: deptValues.map(v => (v / deptMax * 100).toFixed(1)),
          personCategories,
          personValues
        }

        this.setData({
          statistics: stats,
          chartData,
          statTimeRangeLabel: dateLabel
        })

        // 初始化 uCharts 柱形图
        if (personCategories.length > 0) {
          this.initPersonChart(personCategories, personValues)
        }
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  },

  /**
   * 重写 loadData 方法，实现分页加载逻辑
   */
  async loadData(params) {
    const { page, pageSize } = params

    return new Promise((resolve, reject) => {
      const queryParams = { page, pageSize }
      
      // 根据权限设置部门筛选
      if (this.data.selectedDepartment !== 'all') {
        queryParams.department = this.data.selectedDepartment
      }

      wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getAllTrips',
          params: queryParams
        }
      }).then(res => {
        if (res.result.code === 0) {
          const data = res.result.data
          const tripList = (data.list || []).map(item => this.formatTripItem(item))

          this.setData({
            tripList: page === 1 ? tripList : [...this.data.tripList, ...tripList]
          })

          resolve({
            data: tripList,
            hasMore: data.hasMore
          })
        } else {
          reject(new Error(res.result.message))
        }
      }).catch(error => {
        console.error('加载出行记录失败:', error)
        utils.showToast({ title: '加载失败', icon: 'none' })
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
    
    // 格式化预计返回时间（不显示秒）
    let plannedReturnText = ''
    if (item.plannedReturnAt) {
      const plannedDate = new Date(item.plannedReturnAt)
      const plannedHour = String(plannedDate.getHours()).padStart(2, '0')
      const plannedMinute = String(plannedDate.getMinutes()).padStart(2, '0')
      plannedReturnText = `${plannedHour}:${plannedMinute}返回`
    }

    // 提取用户姓氏作为 avatar 文字
    const avatarText = item.userName ? item.userName.slice(0, 1) : '?'

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
      plannedReturnText,
      // avatar 相关
      avatarText,
      avatarColor: utils.getAvatarColor(item.userName)
    }
  },

  /**
   * Tab 切换
   */
  handleTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    
    // 切换到统计tab时，更新图表
    if (tab === 'stats') {
      this.loadStatistics()
    }
  },

  /**
   * 部门筛选
   */
  handleDepartmentChange(e) {
    const index = Number(e.detail.value)
    const department = this.data.departmentOptions[index]
    const selectedDepartment = department === '全部' ? 'all' : department

    if (selectedDepartment !== this.data.selectedDepartment) {
      this.setData({ selectedDepartment })
      this.loadAllData()
    }
  },

  /**
   * 统计时长筛选
   */
  handleTimeRangeChange(e) {
    const index = Number(e.detail.value)
    if (index !== this.data.selectedTimeRangeIndex) {
      this.setData({ selectedTimeRangeIndex: index })
      this.loadStatistics()
    }
  },

  /**
   * 初始化 uCharts 个人出行柱形图（旧版 Canvas API，按官方示例）
   */
  initPersonChart(categories, values) {
    // 用 rpx 转 px 计算实际尺寸（官方推荐方式）
    const windowWidth = wx.getWindowInfo().windowWidth
    const cWidth = 750 / 750 * windowWidth
    const cHeight = 500 / 750 * windowWidth

    const ctx = wx.createCanvasContext('personChart', this)
    personChartInstance = new uCharts({
      type: 'column',
      context: ctx,
      width: cWidth,
      height: cHeight,
      categories: categories,
      series: [{
        name: '出行次数',
        data: values
      }],
      animation: true,
      background: '#FFFFFF',
      color: ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#EF4444', '#84CC16'],
      padding: [15, 30, 10, 5],
      legend: { show: false },
      xAxis: {
        rotateLabel: true,
        rotateAngle: 45,
        fontSize: 16,
        fontColor: '#64748B',
        itemCount: 5,
        scrollShow: true,
        scrollAlign: 'left',
        disableGrid: true
      },
      yAxis: {
        gridColor: '#F1F5F9',
        fontSize: 10,
        fontColor: '#94A3B8',
        splitNumber: 4,
        min: 0,
        data: [{ min: 0 }]
      },
      dataLabel: true,
      dataPointShape: false,
      extra: {
        column: {
          type: 'group',
          width: 18,
          barBorderRadius: [4, 4, 0, 0],
          activeBgColor: '#4F46E5',
          seriesGap: 2,
          categoryGap: 6
        }
      }
    })
  },

  /**
   * 图表点击事件
   */
  tapPersonChart(e) {
    if (personChartInstance) {
      personChartInstance.touchLegend(e)
      personChartInstance.showToolTip(e)
    }
  },

  onReachBottom() {
    if (this.data.activeTab === 'records') {
      this.loadMore()
    }
  },

  async onPullDownRefresh() {
    await this.loadAllData()
    wx.stopPullDownRefresh()
  }
})
