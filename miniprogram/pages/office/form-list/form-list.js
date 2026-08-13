const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')
const { TAG_LIST, getTagConfig } = require('../../../common/form-constants.js')

Page({
  behaviors: [paginationBehavior],

  data: {
    activeTag: 'all',
    tagTabs: [{ key: 'all', label: '全部' }].concat(TAG_LIST.map(t => ({ key: t.key, label: t.icon + t.label }))),
    canPublish: false,
    isReviewer: false
  },

  onLoad() {
    this.checkPublishPermission()
    this.loadListData(false)
    this._loaded = true
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
    // 首次进入紧随 onLoad 加载，跳过；之后从详情/编辑页返回时刷新（红点消失）
    if (this._loaded) {
      this.loadListData(false)
    } else {
      this._loaded = true
    }
  },

  /**
   * 检查发布权限（馆员 / 管理员）
   */
  checkPublishPermission() {
    app.checkUserRegistration().then((result) => {
      if (!result.registered || !result.user) return
      const user = result.user
      const canPublish = !!user.isAdmin || user.role === '馆员'
      this.setData({ 
        canPublish,
        isReviewer: user.isReviewer
      })
    }).catch(() => {})
  },

  /**
   * 分页加载数据（paginationBehavior 调用）
   */
  loadData({ page, pageSize }) {
    return wx.cloud.callFunction({
      name: 'contentFormManager',
      data: {
        action: 'list',
        params: { page, pageSize, tag: this.data.activeTag }
      }
    }).then(res => {
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '加载失败')
      }
      const list = (result.data.list || []).map(item => this.formatItem(item))
      return { data: list, hasMore: result.data.hasMore }
    })
  },

  /**
   * 格式化列表项
   */
  formatItem(item) {
    const tagCfg = getTagConfig(item.tag)
    return {
      ...item,
      tagLabel: tagCfg.label,
      tagIcon: tagCfg.icon,
      tagColor: tagCfg.color,
      tagBg: tagCfg.bg,
      timeText: utils.formatRelativeTime(item.publishedAt || item.createdAt),
      deadlineText: item.deadline ? utils.formatDateTime(item.deadline) : '',
      statusText: item.isClosed ? '已截止' : '进行中',
      isUnread: !item.isRead
    }
  },

  /**
   * 切换 tag 筛选
   */
  handleTagChange(e) {
    const tag = e.currentTarget.dataset.tag
    if (tag === this.data.activeTag) return
    this.setData({ activeTag: tag })
    this.resetPagination()
    this.loadListData(false)
  },

  /**
   * 点击列表项进入详情
   */
  handleItemTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/office/form-detail/form-detail?id=${id}`
      })
    }
  },

  /**
   * 进入发布页
   */
  handlePublish() {
    if (!this.data.canPublish) {
      wx.showModal({
        title: '提示',
        content: '仅馆员可发布信息',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    wx.navigateTo({
      url: '/pages/office/form-edit/form-edit'
    })
  }
})
