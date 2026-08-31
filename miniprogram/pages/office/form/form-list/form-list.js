const app = getApp()
const utils = require('../../../../common/utils.js')
const paginationBehavior = require('../../../../behaviors/pagination.js')
const { TAG_LIST, getTagConfig } = require('../../../../common/form-constants.js')

Page({
  behaviors: [paginationBehavior],

  data: {
    activeTag: 'all',
    tagTabs: [{ key: 'all', label: '全部' }].concat(TAG_LIST.map(t => ({ key: t.key, label: t.icon + t.label }))),
    canPublish: false,
    isReviewer: false,
    emptyIcon: '📋' // 空状态图标，随当前选中 tag 变化
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
        isReviewer: !!user.isReviewer
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
    const isActivity = item.registrationCount !== undefined
    const isFull = isActivity && !!item.isFull
    const partialFull = isActivity && !!item.partialFull
    return {
      ...item,
      tagLabel: tagCfg.label,
      tagIcon: tagCfg.icon,
      tagColor: tagCfg.color,
      tagBg: tagCfg.bg,
      timeText: utils.formatRelativeTime(item.publishedAt || item.createdAt),
      deadlineText: item.deadline ? utils.formatDateTime(item.deadline) : '',
      targetRolesText: (item.targetRoles && item.targetRoles.length > 0)
        ? `该信息仅允许「${item.targetRoles.join('、')}」角色用户填报`
        : ((item.targetDepartments && item.targetDepartments.length > 0)
          ? `该信息仅允许「${item.targetDepartments.join('、')}」部门用户填报`
          : ''),
      visibleScopeText: item.isTargetOnlyVisible
        ? (item.targetRoles && item.targetRoles.length > 0)
          ? `该信息仅对「${item.targetRoles.join('、')}」角色用户可见`
          : ((item.targetDepartments && item.targetDepartments.length > 0)
            ? `该信息仅对「${item.targetDepartments.join('、')}」部门用户可见`
            : '该信息仅对指定用户可见')
        : '',
      activityLimitText: item.maxRegistrations ? `上限 ${item.maxRegistrations} 人` : '',
      submissionText: isActivity ? `${item.registrationCount} 人已报名` : `${item.submissionCount} 人已提交`,
      isFull,
      partialFull,
      statusText: isFull ? '已报满' : (partialFull ? '部分活动已报满' : (item.isClosed ? '已截止' : '进行中')),
      isUnread: !item.isRead
    }
  },

  /**
   * 切换 tag 筛选
   */
  handleTagChange(e) {
    const tag = e.currentTarget.dataset.tag
    if (tag === this.data.activeTag) return
    this.setData({
      activeTag: tag,
      emptyIcon: this.getEmptyIcon(tag)
    })
    this.resetPagination()
    this.loadListData(false)
  },

  /**
   * 根据当前 tag 获取空状态图标
   */
  getEmptyIcon(tag) {
    if (tag === 'all') return '📋'
    return getTagConfig(tag).icon
  },

  /**
   * 点击列表项进入详情
   */
  handleItemTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/office/form/form-detail/form-detail?id=${id}`
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
      url: '/pages/office/form/form-edit/form-edit'
    })
  }
})
