const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    title: '',
    contentHtml: '',
    submitting: false,
    toolbarExpanded: false,
    editorCtx: null
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
  },

  handleEditorReady() {
    const query = wx.createSelectorQuery()
    query.select('#contentEditor').context().exec((res) => {
      if (res[0] && res[0].context) {
        this.editorCtx = res[0].context
      }
    })
  },

  handleEditorInput() {
    clearTimeout(this._inputTimer)
    this._inputTimer = setTimeout(() => {
      this._getEditorContent()
    }, 300)
  },

  handleStatusChange(e) {
    // 格式状态变化
  },

  handleToggleToolbar() {
    this.setData({
      toolbarExpanded: !this.data.toolbarExpanded
    })
  },

  handleFormat(e) {
    const name = e.currentTarget.dataset.name
    const value = e.currentTarget.dataset.value || null
    if (!this.editorCtx) return
    this.editorCtx.format(name, value)
  },

  handleInsertDivider() {
    if (!this.editorCtx) return
    this.editorCtx.insertDivider()
  },

  handleInsertImage() {
    if (!this.editorCtx) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this._uploadImage(tempFilePath)
      }
    })
  },

  _uploadImage(filePath) {
    wx.showLoading({
      title: '上传图片中...'
    })
    const cloudPath = `learning/${Date.now()}_${Math.random().toString(36).slice(2)}.${filePath.split('.').pop()}`
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => {
        wx.hideLoading()
        if (this.editorCtx && res.fileID) {
          this.editorCtx.insertImage({
            src: res.fileID,
            width: '100%',
            mode: 'widthFix'
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        utils.showToast({
          title: '图片上传失败',
          icon: 'none'
        })
      }
    })
  },

  _getEditorContent() {
    if (!this.editorCtx) return
    this.editorCtx.getContents({
      success: (res) => {
        const html = res.html || ''
        this.setData({
          contentHtml: html
        })
      }
    })
  },

  handleTitleInput(e) {
    this.setData({
      title: e.detail.value
    })
  },

  handleSubmit() {
    const {
      title
    } = this.data

    if (!title || title.trim() === '') {
      utils.showToast({
        title: '请输入标题',
        icon: 'none'
      })
      return
    }

    if (title.length > 100) {
      utils.showToast({
        title: '标题不能超过100个字符',
        icon: 'none'
      })
      return
    }

    this._getEditorContent()

    setTimeout(() => {
      const {
        contentHtml
      } = this.data
      const plainText = contentHtml.replace(/<[^>]+>/g, '').trim()

      if (!plainText) {
        utils.showToast({
          title: '请输入内容',
          icon: 'none'
        })
        return
      }

      this.submitArticle(contentHtml, plainText)
    }, 100)
  },

  submitArticle(content, plainText) {
    this.setData({
      submitting: true
    })
    wx.showLoading({
      title: '发布中...'
    })

    wx.cloud.callFunction({
      name: 'articleManager',
      data: {
        action: 'create',
        data: {
          title: this.data.title.trim(),
          content,
          plainText
        }
      }
    }).then(res => {
      wx.hideLoading()
      const result = res.result
      if (result && result.code === 0) {
        utils.showToast({
          title: '发布成功',
          icon: 'success'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(result.message || '发布失败')
      }
    }).catch(error => {
      wx.hideLoading()
      utils.showToast({
        title: error.message || '发布失败',
        icon: 'none'
      })
      this.setData({
        submitting: false
      })
    })
  }
})