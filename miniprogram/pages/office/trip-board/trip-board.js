const app = getApp()
const utils = require('../../../common/utils.js')
const modalAnimation = require('../../../behaviors/modalAnimation.js')

// 状态样式映射
const STATUS_STYLE = {
  out: { color: '#2563EB', bg: '#EFF6FF', text: '外出中' },
  returned: { color: '#16A34A', bg: '#DCFCE7', text: '已返回' },
  overtime: { color: '#DC2626', bg: '#FEE2E2', text: '超时' },
  none: { color: '#94A3B8', bg: '#F1F5F9', text: '在馆' }
}

Page({
  behaviors: [modalAnimation],

  data: {
    loading: false,
    currentUser: null,
    fontStyle: '',
    // 折叠面板
    personType: 'active', // 'active' | 'all'
    showPersonTypeMenu: false,
    activeCount: 0,
    allCount: 0,
    // 分组维度
    groupBy: 'department', // 'department' | 'livingArea'
    showGroupByMenu: false,
    // 分组数据
    groups: [],
    // 个人记录弹窗
    showPersonPopup: false,
    personPopupData: null,
    personPopupLoading: false,
    // 弹窗分页
    popupPage: 1,
    popupPageSize: 20,
    popupHasMore: true,
    popupLoadingMore: false
  },

  async onLoad() {
    try {
      await this.initUserInfo()
      if (!this.data.currentUser) return  // 无权限已切走，不再继续
      wx.showLoading({ title: '加载中...', mask: true })
      await this.loadBoardData()
      // 静默积累出行报备订阅额度
      app.requestTripReportSubscribe()
    } finally {
      wx.hideLoading()
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
    // 首次被拒后切走再切回，直接切回首页，不再重复弹窗
    if (!this.data.currentUser && this._denied) {
      wx.switchTab({ url: '/pages/office/home/home' })
    }
  },

  /**
   * 初始化用户信息，判断是否有权访问
   */
  async initUserInfo() {
    try {
      const result = await app.checkUserRegistration()
      if (!result.registered || !result.user) {
        wx.reLaunch({ url: '/pages/auth/login/login' })
        return
      }

      const user = result.user
      const isLeader = user.role === '馆领导'
      const isAdmin = user.isAdmin
      const isDeptHead = user.isDepartmentHead
      const isAreaManager = Array.isArray(user.areaManagerOf) && user.areaManagerOf.length > 0

      if (!isAdmin && !isLeader && !isDeptHead && !isAreaManager) {
        // 标记已拒，供 onShow 静默切回使用
        this._denied = true
        // 先切回首页，切换成功后再弹窗提示
        wx.switchTab({
          url: '/pages/office/home/home',
          success: () => {
            wx.showModal({
              title: '权限提示',
              content: '您没有权限访问出行数据板',
              showCancel: false,
              confirmText: '我知道了'
            })
          }
        })
        return
      }

      this.setData({ currentUser: user })
    } catch (error) {
      console.error('获取用户信息失败:', error)
      wx.showToast({ title: '获取用户信息失败', icon: 'none' })
    }
  },

  /**
   * 加载出行数据板分组数据
   */
  async loadBoardData() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getBoardData',
          params: {
            groupBy: this.data.groupBy,
            personType: this.data.personType
          }
        }
      })

      if (res.result.code === 0) {
        const data = res.result.data
        const groups = (data.groups || []).map(g => ({
          groupName: g.groupName,
          items: g.items.map(item => this.formatBoardItem(item))
        }))

        this.setData({
          groups,
          activeCount: data.activeCount,
          allCount: data.allCount
        })
      } else {
        wx.showToast({ title: res.result.message, icon: 'none' })
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 格式化数据板条目
   */
  formatBoardItem(item) {
    const style = STATUS_STYLE[item.status] || STATUS_STYLE.none
    const avatarText = item.userName ? item.userName.slice(0, 1) : '?'

    let departTimeStr = ''
    if (item.departAt) {
      const date = new Date(item.departAt)
      departTimeStr = (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + utils.formatTime(item.departAt).slice(0, 5)
    }

    const livingArea = (item._user && item._user.livingArea) || ''

    return {
      ...item,
      avatarText,
      avatarColor: utils.getAvatarColor(item.userName),
      statusText: style.text,
      statusColor: style.color,
      statusBg: style.bg,
      departTimeStr,
      livingArea,
      hasTrip: item.status !== 'none'
    }
  },

  // ========== 折叠面板：人员类型切换 ==========

  handleTogglePersonType() {
    this.setData({
      showPersonTypeMenu: !this.data.showPersonTypeMenu,
      showGroupByMenu: false
    })
  },

  handleSelectPersonType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.personType) {
      this.setData({ showPersonTypeMenu: false })
      return
    }
    this.setData({
      personType: type,
      showPersonTypeMenu: false,
      groups: []
    })
    this.loadBoardData()
  },

  // ========== 分组维度切换 ==========

  handleToggleGroupBy() {
    this.setData({
      showGroupByMenu: !this.data.showGroupByMenu,
      showPersonTypeMenu: false
    })
  },

  handleSelectGroupBy(e) {
    const group = e.currentTarget.dataset.group
    if (group === this.data.groupBy) {
      this.setData({ showGroupByMenu: false })
      return
    }
    this.setData({
      groupBy: group,
      showGroupByMenu: false,
      groups: []
    })
    this.loadBoardData()
  },

  // ========== 条目点击：个人全部外出记录弹窗 ==========

  handleItemTap(e) {
    const openid = e.currentTarget.dataset.openid
    const name = e.currentTarget.dataset.name
    if (!openid) return

    this._currentPopupOpenid = openid

    this.setData({
      showPersonPopup: true,
      personPopupData: { name, groups: [], total: 0 },
      personPopupLoading: true,
      popupPage: 1,
      popupHasMore: true,
      popupLoadingMore: false
    })

    this.loadPersonTrips(openid, false)
  },

  async loadPersonTrips(targetOpenid, loadMore) {
    const page = loadMore ? this.data.popupPage + 1 : 1

    if (loadMore) {
      this.setData({ popupLoadingMore: true })
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'tripReport',
        data: {
          action: 'getPersonTrips',
          params: {
            targetOpenid,
            page,
            pageSize: this.data.popupPageSize
          }
        }
      })

      if (res.result.code === 0) {
        const data = res.result.data
        const newItems = (data.trips || []).map(item => this.formatTripRecord(item))

        // 前端按年月分组合并
        let groups
        if (loadMore) {
          groups = [...this.data.personPopupData.groups]
        } else {
          groups = []
        }

        newItems.forEach(item => {
          if (!item.departAt) return
          const date = new Date(item.departAt)
          const monthKey = date.getFullYear() + '年' + (date.getMonth() + 1) + '月'
          let group = groups.find(g => g.month === monthKey)
          if (!group) {
            group = { month: monthKey, items: [] }
            groups.push(group)
          }
          group.items.push(item)
        })

        // 月份降序排序
        groups.sort((a, b) => b.month.localeCompare(a.month))

        this.setData({
          personPopupData: {
            name: data.user ? data.user.name : this.data.personPopupData.name,
            department: data.user ? data.user.department : this.data.personPopupData.department,
            livingArea: data.user ? data.user.livingArea : this.data.personPopupData.livingArea,
            groups,
            total: data.total || this.data.personPopupData.total
          },
          personPopupLoading: false,
          popupPage: page,
          popupHasMore: data.hasMore,
          popupLoadingMore: false
        })
      } else {
        wx.showToast({ title: res.result.message, icon: 'none' })
        this.setData({ personPopupLoading: false, popupLoadingMore: false })
      }
    } catch (error) {
      console.error('加载个人记录失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ personPopupLoading: false, popupLoadingMore: false })
    }
  },

  handlePopupScrollToLower() {
    if (this.data.popupHasMore && !this.data.popupLoadingMore && !this.data.personPopupLoading) {
      this.loadPersonTrips(this._currentPopupOpenid, true)
    }
  },

  /**
   * 格式化弹窗中的出行记录
   */
  formatTripRecord(item) {
    const style = STATUS_STYLE[item.status] || STATUS_STYLE.returned
    const date = new Date(item.departAt)
    const departTimeStr = (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + utils.formatTime(item.departAt).slice(0, 5)

    let returnTimeStr = '未返回'
    if (item.returnAt) {
      const returnDate = new Date(item.returnAt)
      const sameDay = date.getFullYear() === returnDate.getFullYear() &&
                     date.getMonth() === returnDate.getMonth() &&
                     date.getDate() === returnDate.getDate()
      if (sameDay) {
        returnTimeStr = utils.formatTime(item.returnAt).slice(0, 5)
      } else {
        returnTimeStr = (returnDate.getMonth() + 1) + '月' + returnDate.getDate() + '日 ' + utils.formatTime(item.returnAt).slice(0, 5)
      }
    }

    return {
      ...item,
      departTimeStr,
      returnTimeStr,
      statusText: style.text,
      statusColor: style.color,
      statusBg: style.bg
    }
  },

  hidePersonPopup() {
    this._closeModal('showPersonPopup', () => {
      this.setData({
        personPopupData: null,
        personPopupLoading: false,
        popupLoadingMore: false,
        popupHasMore: true,
        popupPage: 1
      })
    })
  },

  stopPropagation() {},

  async onPullDownRefresh() {
    await this.loadBoardData()
    wx.stopPullDownRefresh()
  }
})
