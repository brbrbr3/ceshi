const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    loading: true,
    activityId: '',
    activity: null,
    timeText: '',
    deadlineText: '',
    targetRolesText: '',
    isRegistered: false,
    myRegistration: null,
    registrationList: [],
    groupStats: [],
    remainingSlots: null,
    showPicker: false
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ activityId: options.id })
      this.loadDetail()
    }
  },

  onShow() {
    if (this.data.activityId) {
      this.loadDetail()
    }
  },

  loadDetail() {
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'activityManager',
      data: {
        action: 'get',
        activityId: this.data.activityId
      }
    }).then(res => {
      const result = res.result
      if (result && result.code === 0) {
        const data = result.data || {}

        // 清理编辑器输出中首尾空 <p> 标签导致的多余空白
        let cleanContent = (data.content || '').trim()
        cleanContent = cleanContent.replace(/^<p>([\s\S]*?)<\/p>$/, '$1')
          .replace(/^<p>\s*<\/p>/g, '')
          .replace(/^\s+|\s+$/g, '')
        if (cleanContent) {
          data.content = cleanContent
        }

        let roleText = ''
        if (data.isTargetRoleEnabled && data.targetRoles && data.targetRoles.length > 0) {
          roleText = data.targetRoles.join(' / ')
        }

        // 格式化报名时间
        const regList = (data.registrationList || []).map(r => ({
          ...r,
          timeText: utils.formatRelativeTime(r.createdAt)
        }))

        // 合并分组统计和原始 groups 数据
        const groupsWithCount = (data.groupStats || []).map(gs => ({
          ...gs,
          regCount: gs.count
        }))
        // 如果没有统计数据但有 groups，用空 count
        if ((groupsWithCount.length === 0) && data.groups) {
          data.groups.forEach(g => {
            groupStats.push({ name: g.name, regCount: 0 })
          })
        }

        this.setData({
          activity: data,
          timeText: utils.formatDateTime(data.createdAt),
          deadlineText: data.registrationDeadline ? utils.formatDateTime(data.registrationDeadline) : '',
          targetRolesText: roleText,
          isRegistered: data.isRegistered || false,
          myRegistration: data.myRegistration || null,
          registrationList: regList,
          groupStats: groupsWithCount,
          remainingSlots: data.remainingSlots !== undefined ? data.remainingSlots : null,
          loading: false
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    }).catch(err => {
      console.error('加载活动详情失败:', err)
      this.setData({ loading: false })
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
    })
  },

  // 非分组活动直接报名
  handleRegister() {
    if (this.data.remainingSlots === 0) {
      return
    }

    wx.showModal({
      title: '确认报名',
      content: `确定要报名参与「${this.data.activity.title}」吗？`,
      success: (res) => {
        if (res.confirm) {
          this.doRegister(null)
        }
      }
    })
  },

  // 显示分组选择器
  showGroupPicker() {
    this.setData({ showPicker: true })
  },

  hideGroupPicker() {
    this.setData({ showPicker: false })
  },

  // 选择分组后报名
  handleSelectGroup(e) {
    const groupName = e.currentTarget.dataset.group
    this.setData({ showPicker: false })

    wx.showModal({
      title: '确认报名',
      content: `确定要报名「${groupName}」组吗？`,
      success: (res) => {
        if (res.confirm) {
          this.doRegister(groupName)
        }
      }
    })
  },

  doRegister(groupName) {
    wx.showLoading({ title: '报名中...', mask: true })
    wx.cloud.callFunction({
      name: 'activityManager',
      data: {
        action: 'register',
        data: {
          activityId: this.data.activityId,
          groupName: groupName
        }
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.code === 0) {
        utils.showToast({ title: '报名成功', icon: 'success' })
        this.loadDetail()
      } else {
        utils.showToast({ title: res.result.message || '报名失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      utils.showToast({ title: '报名失败', icon: 'none' })
    })
  },

  // 取消报名
  handleCancelRegistration() {
    wx.showModal({
      title: '取消报名',
      content: '确定要取消报名吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true })
          wx.cloud.callFunction({
            name: 'activityManager',
            data: {
              action: 'cancelRegistration',
              activityId: this.data.activityId
            }
          }).then(res => {
            wx.hideLoading()
            if (res.result && res.result.code === 0) {
              utils.showToast({ title: '已取消', icon: 'success' })
              this.loadDetail()
            } else {
              utils.showToast({ title: res.result.message || '操作失败', icon: 'none' })
            }
          }).catch(err => {
            wx.hideLoading()
            utils.showToast({ title: '操作失败', icon: 'none' })
          })
        }
      }
    })
  }
})
