/**
 * 小绿书 - 发帖页
 */
const app = getApp()

Page({
  data: {
    images: [],       // 已选图片临时路径
    imageFileIds: [], // 云存储 fileID
    imageRatios: [],  // 图片宽高比

    title: '',
    content: '',

    tags: [],
    tagInput: '',

    category: '生活',
    categories: ['美食', '生活', '出行', '运动', '学习', '分享'],

    showCategoryPicker: false,

    submitting: false,
    maxImages: 9
  },

  onLoad() {
    // 检查用户注册
    app.checkUserRegistration().then(result => {
      if (!result.registered) {
        wx.showModal({
          title: '提示',
          content: '请先完成注册后再发布帖子',
          showCancel: false,
          success: () => wx.navigateBack()
        })
      }
    })
  },

  /**
   * 选择图片
   */
  handleChooseImage() {
    const remaining = this.data.maxImages - this.data.images.length
    if (remaining <= 0) {
      wx.showToast({ title: `最多上传${this.data.maxImages}张图片`, icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(f => f.tempFilePath)
        const allImages = [...this.data.images, ...newImages]

        // 获取每张图片的宽高比
        const ratioPromises = newImages.map(path => {
          return new Promise((resolve) => {
            wx.getImageInfo({
              src: path,
              success: (info) => resolve(info.width / info.height),
              fail: () => resolve(1)
            })
          })
        })

        Promise.all(ratioPromises).then(ratios => {
          this.setData({
            images: allImages,
            imageRatios: [...this.data.imageRatios, ...ratios]
          })
        })
      }
    })
  },

  /**
   * 删除图片
   */
  handleDeleteImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.images]
    const imageRatios = [...this.data.imageRatios]
    images.splice(index, 1)
    imageRatios.splice(index, 1)
    this.setData({ images, imageRatios })
  },

  /**
   * 输入标题
   */
  handleTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  /**
   * 输入正文
   */
  handleContentInput(e) {
    const content = e.detail.value
    if (content.length > 500) {
      this.setData({ content: content.substring(0, 500) })
    } else {
      this.setData({ content })
    }
  },

  /**
   * 添加话题标签
   */
  handleAddTag() {
    const tag = this.data.tagInput.trim()
    if (!tag) return
    if (this.data.tags.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' })
      return
    }
    if (this.data.tags.length >= 5) {
      wx.showToast({ title: '最多5个标签', icon: 'none' })
      return
    }
    this.setData({
      tags: [...this.data.tags, tag],
      tagInput: ''
    })
  },

  handleTagInput(e) {
    this.setData({ tagInput: e.detail.value })
  },

  handleTagConfirm() {
    this.handleAddTag()
  },

  /**
   * 删除标签
   */
  handleDeleteTag(e) {
    const tag = e.currentTarget.dataset.tag
    this.setData({ tags: this.data.tags.filter(t => t !== tag) })
  },

  /**
   * 选择分类
   */
  handleCategorySelect(e) {
    this.setData({ category: e.currentTarget.dataset.category, showCategoryPicker: false })
  },

  handleShowCategoryPicker() {
    this.setData({ showCategoryPicker: true })
  },

  handleHideCategoryPicker() {
    this.setData({ showCategoryPicker: false })
  },

  /**
   * 发布帖子
   */
  async handlePublish() {
    const { images, content, title, tags, category } = this.data

    // 校验
    if (!content || !content.trim()) {
      wx.showToast({ title: '请输入帖子内容', icon: 'none' })
      return
    }
    if (images.length === 0) {
      wx.showToast({ title: '请至少上传1张图片', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '发布中...', mask: true })

    try {
      // 1. 上传所有图片到云存储
      const uploadPromises = images.map((tempPath, index) => {
        const ext = tempPath.split('.').pop() || 'png'
        const fileName = `greenbook/${Date.now()}_${index}.${ext}`
        return wx.cloud.uploadFile({
          cloudPath: fileName,
          filePath: tempPath
        })
      })

      const uploadResults = await Promise.all(uploadPromises)
      const imageFileIds = uploadResults.map(r => r.fileID)

      // 2. 调用云函数创建帖子
      const res = await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: {
          action: 'create',
          title: title.trim(),
          content: content.trim(),
          images: imageFileIds,
          imageRatios: this.data.imageRatios,
          tags,
          category
        }
      })

      if (res.result.code === 0) {
        wx.hideLoading()
        wx.showToast({ title: '发布成功', icon: 'success' })

        // 通知列表页清除缓存并刷新
        const eventChannel = this.getOpenerEventChannel()
        if (eventChannel && eventChannel.emit) {
          eventChannel.emit('publishSuccess')
        }

        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(res.result.message)
      }
    } catch (e) {
      console.error('发布失败:', e)
      wx.hideLoading()
      wx.showToast({ title: e.message || '发布失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 取消发布
   */
  handleCancel() {
    wx.navigateBack()
  }
})
