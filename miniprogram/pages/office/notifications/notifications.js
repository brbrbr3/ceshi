const app = getApp()
const util = require('../../../util/util.js')

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
  data: {
    notifications: [],
    hasUnreadNotifications: false
  },

  onLoad() {
    this.loadNotifications()
  },

  onShow() {
    this.loadNotifications()
  },

  loadNotifications() {
    app.getNotifications(function(notifications) {
      const hasUnread = notifications.some(function(n) { return !n.read })
      this.setData({
        notifications: notifications.map(function(n) {
          return {
            ...n,
            timeText: formatTime(n.createdAt)
          }
        }),
        hasUnreadNotifications: hasUnread
      })
    }.bind(this))
  },

  handleNotificationTap(e) {
    const id = e.currentTarget.dataset.id
    app.markNotificationAsRead(id, function(success) {
      if (success) {
        this.loadNotifications()
      }
    }.bind(this))
  },

  markAllAsRead() {
    app.getNotifications(function(notifications) {
      notifications.forEach(function(n) {
        if (!n.read) {
          app.markNotificationAsRead(n._id)
        }
      })
      this.loadNotifications()
      util.showToast({
        title: '已全部标记为已读',
        icon: 'success'
      })
    }.bind(this))
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
