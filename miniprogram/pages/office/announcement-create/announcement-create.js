const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    title: '',
    contentHtml: '',
    type: 'normal',
    typeIndex: -1,
    typeOptions: [
      { label: '普通', value: 'normal' },
      { label: '紧急', value: 'urgent' },
      { label: '重要', value: 'important' }
    ],
    submitting: false,
    toolbarExpanded: false,
    editorCtx: null,
    formats: {}
  },

  /**
   * 编辑器初始化完成
   */
  handleEditorReady() {
    const query = wx.createSelectorQuery()
    query.select('#contentEditor').context().exec((res) => {
      if (res[0] && res[0].context) {
        this.editorCtx = res[0].context
      }
    })
  },

  /**
   * 编辑器内容变化
   */
  handleEditorInput() {
    // 编辑器有输入就自动获取内容（延迟防抖）
    clearTimeout(this._inputTimer)
    this._inputTimer = setTimeout(() => {
      this._getEditorContent()
    }, 300)
  },

  /**
   * 编辑器格式状态变化
   */
  handleStatusChange(e) {
    this.setData({ formats: e.detail })
  },

  /**
   * 展开/收起工具栏
   */
  handleToggleToolbar() {
    this.setData({
      toolbarExpanded: !this.data.toolbarExpanded
    })
  },

  /**
   * 格式化操作（粗体、斜体、下划线、列表、标题、对齐）
   */
  handleFormat(e) {
    const name = e.currentTarget.dataset.name
    const value = e.currentTarget.dataset.value || null

    if (!this.editorCtx) return

    this.editorCtx.format(name, value)
  },

  /**
   * 插入分割线
   */
  handleInsertDivider() {
    if (!this.editorCtx) return

    this.editorCtx.insertDivider()
  },

  /**
   * 获取编辑器 HTML 内容
   */
  _getEditorContent() {
    if (!this.editorCtx) return

    this.editorCtx.getContents({
      success: (res) => {
        const delta = res.html || ''
        this.setData({ contentHtml: delta })
      }
    })
  },

  /**
   * 标题输入
   */
  handleTitleInput(e) {
    this.setData({
      title: e.detail.value
    })
  },

  /**
   * 选择通知类型
   */
  handleTypeChange(e) {
    const index = e.detail.value
    const type = this.data.typeOptions[index].value
    this.setData({
      typeIndex: index,
      type: type
    })
  },

  /**
   * 提交通知公告
   */
  handleSubmit() {
    const { title } = this.data

    // 验证表单
    if (!title || title.trim() === '') {
      utils.showToast({ title: '请输入标题', icon: 'none' })
      return
    }

    if (title.length > 100) {
      utils.showToast({ title: '标题不能超过100个字符', icon: 'none' })
      return
    }

    // 获取编辑器最终内容
    this._getEditorContent()

    // 用 setTimeout 等待内容同步
    setTimeout(() => {
      const { contentHtml } = this.data
      const plainText = contentHtml.replace(/<[^>]+>/g, '').trim()

      if (!plainText) {
        utils.showToast({ title: '请输入内容', icon: 'none' })
        return
      }

      if (plainText.length > 1000) {
        utils.showToast({ title: '内容不能超过1000个字符', icon: 'none' })
        return
      }

      this.submitAnnouncement()
    }, 100)
  },

  /**
   * 提交通知公告
   */
  submitAnnouncement() {
    this.setData({ submitting: true })

    wx.showLoading({ title: '发布中...' })

    wx.cloud.callFunction({
      name: 'announcementManager',
      data: {
        action: 'create',
        data: {
          title: this.data.title.trim(),
          content: this.data.contentHtml.trim(),
          type: this.data.type
        }
      }
    }).then(res => {
      wx.hideLoading()
      const result = res.result
      if (result && result.code === 0) {
        utils.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(result.message || '发布失败')
      }
    }).catch(error => {
      wx.hideLoading()
      console.error('发布通知公告失败:', error)
      utils.showToast({ title: error.message || '发布失败', icon: 'none' })
      this.setData({ submitting: false })
    })
  },

  /**
   * 取消提交
   */
  handleCancel() {
    wx.navigateBack()
  }
})
