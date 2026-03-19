const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

function formatTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  // 使用统一的时间处理函数
  return utils.formatDate(timestamp)
}

Page({
  behaviors: [paginationBehavior],

  data: {
    menuList: [],
    showAddButton: false
  },

  onLoad() {
    // 初始化分页配置
    this.initPagination({
      initialPageSize: 20,
      loadMorePageSize: 10
    })
  },

  onShow() {
    // 每次显示页面时刷新数据（从编辑页返回时自动更新）
    this.refreshList()
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

  /**
   * 重写 loadData 方法，实现分页加载逻辑
   */
  async loadData(params) {
    const { page, pageSize } = params
    const skipCount = (page - 1) * pageSize

    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      db.collection('menus')
        .orderBy('createdAt', 'desc')
        .skip(skipCount)
        .limit(pageSize)
        .get()
        .then(res => {
          const menuList = (res.data || []).map(item => ({
            ...item,
            timeText: formatTime(item.createdAt)
          }))

          // 同步到 menuList
          this.setData({
            menuList: page === 1 ? menuList : [...this.data.menuList, ...menuList]
          })

          resolve({
            data: menuList,
            hasMore: menuList.length >= pageSize
          })
        })
        .catch(error => {
          console.error('加载菜单失败', error)
          utils.showToast({
            title: '加载失败',
            icon: 'none'
          })
          reject(error)
        })
    })
  },

  loadMenus(loadMore = false) {
    this.loadListData(loadMore)
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
  },

  /**
   * 重写 onReachBottom 方法
   */
  onReachBottom() {
    this.loadMore()
  },

  /**
   * 重写 onPullDownRefresh 方法
   */
  async onPullDownRefresh() {
    await this.refreshList()
    wx.stopPullDownRefresh()
  }
})
