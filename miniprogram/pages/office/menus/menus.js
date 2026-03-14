const app = getApp()
const util = require('../../../util/util.js')

function formatTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

Page({
  data: {
    loading: true,
    menuList: [],
    showAddButton: false
  },

  onShow() {
    this.loadMenus()
    this.checkPermission()
  },

  checkPermission() {
    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          this.setData({ showAddButton: false })
          return
        }

        const isWorker = result.user.role === '工勤'
        const isAdmin = result.user.isAdmin
        this.setData({
          showAddButton: isWorker || isAdmin
        })
      })
      .catch((error) => {
        console.error('检查权限失败', error)
      })
  },

  loadMenus() {
    this.setData({ loading: true })

    const db = wx.cloud.database()
    db.collection('menus')
      .orderBy('createdAt', 'desc')
      .get()
      .then(res => {
        const menuList = (res.data || []).map(item => {
          return {
            ...item,
            timeText: formatTime(item.createdAt)
          }
        })
        this.setData({ menuList })
      })
      .catch(error => {
        console.error('加载菜单失败', error)
        util.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  goMenuDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/office/menu-detail/menu-detail?id=${id}`
    })
  },

  goAddMenu() {
    wx.navigateTo({
      url: '/pages/office/menu-edit/menu-edit'
    })
  }
})
