const app = getApp()
const util = require('../../../util/util.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

function formatTime(timestamp) {
  if (!timestamp) {
    return '刚刚'
  }

  const diff = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < hour) {
    return `${Math.max(1, Math.floor(diff / minute))} 分钟前`
  }
  if (diff < day) {
    return `${Math.max(1, Math.floor(diff / hour))} 小时前`
  }
  if (diff < day * 2) {
    return '昨天'
  }

  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const dayText = String(date.getDate()).padStart(2, '0')
  return `${month}-${dayText}`
}

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
    this.loadNotifications()
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
    this.loadListData(loadMore)
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
      if (notification.type === 'menu' && notification.menuId) {
        // 菜单通知，跳转到菜单详情页
        wx.navigateTo({
          url: `/pages/office/menu-detail/menu-detail?id=${notification.menuId}`
        })
      } else if (notification.type === 'new_registration') {
        // 新注册申请，跳转到审批中心
        wx.switchTab({
          url: '/pages/office/approval/approval'
        })
      } else if (notification.type === 'task_assigned') {
        // 任务分配通知，跳转到审批中心
        wx.switchTab({
          url: '/pages/office/approval/approval'
        })
      } else if (notification.type === 'task_completed' && notification.orderId) {
        // 审批完成通知，跳转到工单详情页
        wx.navigateTo({
          url: `/pages/office/work-order-detail/work-order-detail?id=${notification.orderId}`
        })
      } else if (notification.type === 'process_returned' && notification.orderId) {
        // 流程退回通知，跳转到工单详情页
        wx.navigateTo({
          url: `/pages/office/work-order-detail/work-order-detail?id=${notification.orderId}`
        })
      } else if (notification.type === 'workflow_completed' && notification.orderId) {
        // 工作流完成通知，跳转到工单详情页
        wx.navigateTo({
          url: `/pages/office/work-order-detail/work-order-detail?id=${notification.orderId}`
        })
      }
    }
  },

  markAllAsRead() {
    wx.cloud.callFunction({
      name: 'notificationManager',
      data: {
        action: 'markAllAsRead'
      }
    }).then(res => {
      if (res.result.success) {
        this.loadNotifications()
        util.showToast({
          title: '已全部标记为已读',
          icon: 'success'
        })
      } else {
        util.showToast({
          title: '操作失败',
          icon: 'none'
        })
      }
    }).catch(() => {
      util.showToast({
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
          app.clearAllNotifications(function(success) {
            if (success) {
              this.loadNotifications()
              util.showToast({
                title: '已清空所有消息',
                icon: 'success'
              })
            }
          }.bind(this))
        }
      }
    })
  }
})
