const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    formId: '',
    title: '',
    tag: '',
    list: [],
    loading: true,
    exporting: false,
    allExpanded: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ formId: options.id })
      this.loadSubmissions(options.id)
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  loadSubmissions(formId) {
    wx.showLoading({ title: '加载中...', mask: true })
    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: { action: 'listSubmissions', params: { formId } }
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '加载失败')
      }
      const form = result.data.form || {}
      const blocks = form.blocks || []
      const list = (result.data.list || []).map(s => this.formatSubmission(s, blocks))
      this.setData({
        title: form.title || '',
        tag: form.tag || '',
        list,
        loading: false
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('加载提交明细失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  /**
   * 格式化单条提交记录
   */
  formatSubmission(s, blocks) {
    const answerDetails = (s.answers || []).map((a, idx) => {
      const block = blocks.find(b => b.id === a.blockId)
      return {
        blockId: a.blockId,
        index: idx + 1,
        title: block ? block.title : a.blockId,
        type: a.type,
        valueText: this.formatValue(a.type, a.value)
      }
    })
    return {
      ...s,
      timeText: utils.formatDateTime(s.submittedAt),
      answerDetails,
      expanded: false
    }
  },

  /**
   * 根据类型格式化答案值
   */
  formatValue(type, value) {
    if (type === 'checkbox') {
      return (value || []).join('、')
    }
    if (type === 'side_dish') {
      return (value || []).map(v => `${v.categoryName}×${v.count}`).join('、')
    }
    if (type === 'activity' && value === '报名') {
      return '已报名'
    }
    return value === undefined || value === null || value === '' ? '（空）' : value
  },

  /**
   * 展开/收起答案明细
   */
  handleToggleExpand(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.list[index]
    if (!item) return
    this.setData({
      [`list[${index}].expanded`]: !item.expanded
    })
  },

  /**
   * 全部展开 / 全部收起
   */
  handleToggleAll() {
    const allExpanded = !this.data.allExpanded
    const list = this.data.list.map(item => ({ ...item, expanded: allExpanded }))
    this.setData({ list, allExpanded })
  },

  /**
   * 导出副食订购清单 PDF
   */
  handleExportPdf() {
    if (this.data.exporting) return
    if (!this.data.formId) return

    this.setData({ exporting: true })
    wx.showLoading({ title: '生成PDF...', mask: true })

    wx.cloud.callFunction({
      name: 'generateOrderPdf',
      data: { type: 'contentFormSideDish', formId: this.data.formId }
    }).then(async res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '生成失败')
      }
      const { fileUrl, fileName } = result.data || {}
      if (!fileUrl) {
        throw new Error('导出地址为空')
      }

      // 下载并打开 PDF
      wx.showLoading({ title: '正在打开...', mask: true })
      const downloadResult = await new Promise((resolve, reject) => {
        wx.downloadFile({ url: fileUrl, success: resolve, fail: reject })
      })
      wx.hideLoading()

      if (downloadResult.statusCode === 200) {
        wx.openDocument({
          filePath: downloadResult.tempFilePath,
          fileType: 'pdf',
          showMenu: true,
          fail: () => utils.showToast({ title: '打开文件失败', icon: 'none' })
        })
      } else {
        utils.showToast({ title: '下载文件失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('导出PDF失败:', err)
      utils.showToast({ title: err.message || '导出失败', icon: 'none' })
    }).finally(() => {
      this.setData({ exporting: false })
    })
  }
})
