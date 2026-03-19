const app = getApp()
const utils = require('../../../common/utils.js')
const constants = require('../../../common/constants.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

// 使用统一的时间格式化函数
const formatTime = (timestamp) => utils.formatRelativeTime(timestamp)

Page({
  behaviors: [paginationBehavior],

  data: {
    notifications: [],
    hasUnreadNotifications: false
  },

  onLoad() {
    this.initPagination({
      initialPageSize: 20,
      loadMorePageSize: 10
    })

    // 显示加载中toast
    wx.showLoading({
      title: '加载中',
      mask: true
    })

    this.loadNotifications().finally(() => {
      wx.hideLoading()
    })
  },

  onShow() {
    // 如果列表为空或需要刷新，重新加载
    if (this.data.list.length === 0) {
      this.loadNotifications()
    }
  },

  /**
   * 重写 loadData 方法，实现分页加载逻辑
   */
  loadData(params) {
    return new Promise((resolve, reject) => {
      app.getNotifications(params, (result) => {
        if (result && result.data) {
          const formattedData = result.data.map(n => ({
            ...n,
            timeText: formatTime(n.createdAt)
          }))

          const hasUnread = formattedData.some(n => !n.read)
          this.setData({
            notifications: this.data.page === 1 
              ? formattedData 
              : [...this.data.notifications, ...formattedData],
            hasUnreadNotifications: this.data.page === 1 ? hasUnread : this.data.hasUnreadNotifications
          })

          // 将格式化后的数据同步到 list
          this.setData({
            list: this.data.notifications
          })

          resolve({
            data: formattedData,
            hasMore: result.hasMore
          })
        } else {
          resolve({
            data: [],
            hasMore: false
          })
        }
      })
    })
  },

  loadNotifications(loadMore = false) {
    return this.loadListData(loadMore)
  },

  handleNotificationTap(e) {
    const id = e.currentTarget.dataset.id
    const notification = this.data.notifications.find(n => n._id === id)

    // 标记为已读
    app.markNotificationAsRead(id, function(success) {
      if (success) {
        this.loadNotifications()
      }
    }.bind(this))

    // 根据通知类型跳转到对应页面
    if (notification) {
      // 从常量获取消息类型和跳转映射
      const NOTIFICATION_TYPES = constants.getConstantSync('NOTIFICATION_TYPES')
      const NOTIFICATION_TARGET_TAB = constants.getConstantSync('NOTIFICATION_TARGET_TAB')

      if (notification.type === NOTIFICATION_TYPES.MENU && notification.menuId) {
        // 菜单通知，跳转到菜单详情页
        wx.navigateTo({
          url: `/pages/office/menu-detail/menu-detail?id=${notification.menuId}`
        })
      } else {
        // 其他通知类型，根据映射跳转到审批中心的对应tab
        const targetTab = NOTIFICATION_TARGET_TAB[notification.type]
        if (targetTab && targetTab !== 'none') {
          // 设置全局变量，通知审批中心切换到指定tab
          app.globalData.targetApprovalTab = targetTab
          wx.switchTab({
            url: '/pages/office/approval/approval'
          })
        }
      }
    }
  },

  markAllAsRead() {
    wx.showLoading({
      title: '加载中',
      mask: true
    })

    wx.cloud.callFunction({
      name: 'notificationManager',
      data: {
        action: 'markAllAsRead'
      }
    }).then(res => {
      if (res.result.success) {
        this.loadNotifications().finally(() => {
          wx.hideLoading()
          utils.showtoast({
            title: '已全部标记为已读',
            icon: 'success'
          })
        })
      } else {
        wx.hideLoading()
        utils.showtoast({
          title: '操作失败',
          icon: 'none'
        })
      }
    }).catch(() => {
      wx.hideLoading()
      utils.showtoast({
        title: '操作失败',
        icon: 'none'
      })
    })
  },

  clearAll() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有消息吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '加载中',
            mask: true
          })

          app.clearAllNotifications((success) => {
            if (success) {
              this.loadNotifications().finally(() => {
                wx.hideLoading()
                utils.showtoast({
                  title: '已清空所有消息',
                  icon: 'success'
                })
              })
            } else {
              wx.hideLoading()
            }
          })
        }
      }
    })
  }
})
