const app = getApp()
const utils = require('../../../common/utils.js')
const modalAnimation = require('../../../behaviors/modalAnimation.js')
const pullDownClose = require('../../../behaviors/pullDownClose.js')

// 状态样式映射
const STATUS_STYLE = {
  out: { color: '#F59E0B', bg: '#FFFBEB', text: '外出中' },
  returned: { color: '#16A34A', bg: '#DCFCE7', text: '已返回' },
  overtime: { color: '#DC2626', bg: '#FEE2E2', text: '超时' },
  none: { color: '#94A3B8', bg: '#F1F5F9', text: '🏢在馆' }
}

Page({
  behaviors: [modalAnimation, pullDownClose],

  data: {
    loading: false,
    currentUser: null,
    fontStyle: '',
    // 折叠面板
    personType: 'all', // 'active' | 'all'
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
    popupLoadingMore: false,
    // 下拉关闭阈值（弹窗高度 1/6，onLoad 中计算）
    pullDownThreshold: 0
  },

  async onLoad() {
    // 计算下拉关闭阈值（弹窗 max-height 为 80vh，阈值 = 高度 / 6）
    const { windowHeight } = wx.getWindowInfo()
    this.setData({ pullDownThreshold: Math.round(windowHeight * 0.8 / 6) })

    try {
      await this.initUserInfo()
      if (!this.data.currentUser) return  // 无权限已切走，不再继续
      wx.showLoading({ title: '加载中...', mask: true })
      await this.loadBoardData()

      // 刷新微信侧订阅状态到本地缓存
      app.syncSubStatus()
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
      return
    }
    // 首次进入页面时 initUserInfo 尚未完成，跳过订阅逻辑（由 onLoad 处理）
    if (!this.data.currentUser) return

    // 刷新微信侧订阅状态到本地缓存（供功能面板 tap 时同步读取）
    app.syncSubStatus()
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
      this.setData({ currentUser: user, viewScopeText: this.computeViewScopeText(user) })
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
          items: g.items
            .map(item => this.formatBoardItem(item, this.data.groupBy))
            .sort((a, b) => this.sortBoardItems(a, b, this.data.groupBy))
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
   * @param {Object} item - 原始数据项
   * @param {string} groupBy - 分组维度 'department' | 'livingArea'
   */
  formatBoardItem(item, groupBy) {
    const style = STATUS_STYLE[item.status] || STATUS_STYLE.none
    const avatarText = item.userName ? item.userName.slice(0, 1) : '?'

    let departTimeStr = ''
    if (item.departAt) {
      const date = new Date(item.departAt)
      departTimeStr = (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + utils.formatTime(item.departAt).slice(0, 5)
    }

    const livingArea = (item._user && item._user.livingArea) || ''
    const user = item._user || {}
    const hasTrip = item.status !== 'none'

    let roleLabel = ''
    let statusText, statusColor, statusBg

    if (hasTrip) {
      // 外出中状态：保持原样（外出中/已返回/超时）
      statusText = style.text
      statusColor = style.color
      statusBg = style.bg
    } else {
      // 未外出状态：根据分组维度判断角色标签
      if (groupBy === 'department') {
        if (user.isDepartmentHead) {
          roleLabel = '负责人'
          statusColor = '#2563EB'
          statusBg = '#EFF6FF'
        }
      } else if (groupBy === 'livingArea') {
        if (user.isAreaManager) {
          roleLabel = '片长'
          statusColor = '#7C3AED'
          statusBg = '#F5F3FF'
        }
      }

      if (roleLabel) {
        statusText = roleLabel
      } else {
        // 无角色标签：显示原有在馆/在家
        statusText = livingArea === '本部' ? '🏢在馆' : '🏠在家'
        statusColor = style.color
        statusBg = style.bg
      }
    }

    return {
      ...item,
      avatarText,
      avatarColor: utils.getAvatarColor(item.userName),
      statusText,
      statusColor,
      statusBg,
      departTimeStr,
      livingArea,
      hasTrip,
      showStatus: hasTrip || !!roleLabel
    }
  },

  /**
   * 组内排序：部门维度 → 负责人置顶；居住区维度 → 片长置顶；其余按姓名（拼音）排序
   * @param {Object} a - 已格式化的条目
   * @param {Object} b - 已格式化的条目
   * @param {string} groupBy - 分组维度 'department' | 'livingArea'
   */
  sortBoardItems(a, b, groupBy) {
    const aUser = a._user || {}
    const bUser = b._user || {}
    const aName = a.userName || ''
    const bName = b.userName || ''

    if (groupBy === 'department') {
      // 部门负责人最前
      const aIsHead = aUser.isDepartmentHead ? 0 : 1
      const bIsHead = bUser.isDepartmentHead ? 0 : 1
      if (aIsHead !== bIsHead) return aIsHead - bIsHead
    } else {
      // 片长最前
      const aIsManager = aUser.isAreaManager ? 0 : 1
      const bIsManager = bUser.isAreaManager ? 0 : 1
      if (aIsManager !== bIsManager) return aIsManager - bIsManager
    }

    // 其余按姓名（拼音）排序
    return aName.localeCompare(bName, 'zh')
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
    // 利用 tap 手势静默积累订阅额度（与首页 handleQuickAction 逻辑一致）
    // 管理员 → 积累模板2（待审批通知）；报备接收人 → 积累模板3（出行报备通知）
    const user = this.data.currentUser
    if (user) app.subscribeOnTap(app.getSubscribeTypesForUser(user))

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
            pageSize: this.data.popupPageSize,
            knownTotal: this.data.personPopupData.total || undefined
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
    if (this._pullDownClosing) return
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

  /**
   * 下拉关闭后的数据清理（由 pullDownClose behavior 回调）
   */
  _onPullDownClosed(modalKey) {
    if (modalKey === 'showPersonPopup') {
      this.setData({
        personPopupData: null,
        personPopupLoading: false,
        popupLoadingMore: false,
        popupHasMore: true,
        popupPage: 1
      })
    }
  },

  stopPropagation() {},

  /**
   * 根据用户报备配置计算可查看范围文案
   * 优先级与云函数 getBoardData 的 scopeType 逻辑保持一致
   * 多身份取并集，各部门去重
   */
  computeViewScopeText(user) {
    const isLeader = user.role === '馆员' && user.department === '无'
    const isAdmin = user.isAdmin
    const isDeptHead = user.isDepartmentHead
    const isAreaManager = !!user.isAreaManager

    // 全体范围：管理员 或 馆员且部门为空
    if (isAdmin || (isLeader && !isDeptHead)) {
      return '全体人员'
    }

    // 收集各身份范围描述（并集）
    const parts = []

    if (isAreaManager && user.livingArea) {
      parts.push('管辖居住区域（' + user.livingArea + '）')
    }
    if (isDeptHead && user.department) {
      parts.push('本部门（' + user.department + '）')
    }

    if (parts.length === 0) {
      return '仅自己'
    }
    return parts.join('及') + '人员'
  },

  async onPullDownRefresh() {
    await this.loadBoardData()
    wx.stopPullDownRefresh()
  }
})
