const app = getApp()
const utils = require('../../../common/utils.js')
const constants = require('../../../common/constants.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

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
      deptValues: []
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
      const dashboardRoles = await constants.getConstant('TRIP_DASHBOARD_ROLES')
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
      const departmentOptions = await constants.getConstant('DEPARTMENT_OPTIONS')
      this.setData({
        departmentOptions: ['全部', ...(departmentOptions || [])]
      })
    } catch (error) {
      console.error('加载常量配置失败:', error)
      this.setData({
        departmentOptions: ['全部', '政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', 'DW办']
      })
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
      // 获取今天的开始和结束时间戳
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1

      const params = {
        dateStart: startOfDay,
        dateEnd: endOfDay
      }

      // 根据权限设置部门筛选
      if (this.data.selectedDepartment !== 'all') {
        params.department = this.data.selectedDepartment
      }

      const res = await wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getAllTrips',
          params: { ...params, pageSize: 100 }
        }
      })

      if (res.result.code === 0) {
        const trips = res.result.data.list || []
        const activeTrips = trips.filter(t => t.status === 'out').map(t => this.formatTripItem(t))

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

      // 获取本月数据
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      params.dateStart = monthStart

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

        const chartData = {
          modeLabels,
          modeValues,
          modePercentages: modeValues.map(v => (v / modeMax * 100).toFixed(1)),
          deptLabels,
          deptValues,
          deptPercentages: deptValues.map(v => (v / deptMax * 100).toFixed(1))
        }

        this.setData({
          statistics: stats,
          chartData
        })
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
    const departTimeStr = utils.formatTime(item.departAt)
    const returnTimeStr = item.returnAt ? utils.formatTime(item.returnAt) : '--:--'
    
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
