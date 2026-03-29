/**
 * 物业报修页面
 *
 * 功能：
 * - 我的报修：所有用户可查看自己的报修记录，提交新报修
 * - 全部报修：物业角色可查看全部报修记录，按居住区筛选，标记维修完成
 */
const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

Page({
  behaviors: [paginationBehavior],

  data: {
    // 权限
    isPropertyUser: false,
    currentUser: null,

    // Tab
    activeTab: 'mine',

    // 筛选（物业用户）
    livingAreas: [],
    areaPickerRange: [],
    selectedArea: '',

    // 弹窗控制
    showFormPopup: false,
    showDetailPopup: false,

    // 表单
    form: {
      livingArea: '',
      address: '',
      content: '',
      images: []
    },
    areaIndex: 0,

    // 历史地址
    historyAddresses: [],
    showAddressSuggestions: false,

    // 详情
    selectedRepair: null,

    // 状态
    submitting: false,
    operating: false
  },

  async onLoad() {
    this.initPagination({
      initialPageSize: 20,
      loadMorePageSize: 10
    })

    // 加载居住区选项
    this.loadLivingAreas()

    // 检查物业角色权限
    await this.checkPropertyPermission()
  },

  async onShow() {
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      await this.refreshList()
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 加载居住区选项（从缓存或默认常量）
   */
  loadLivingAreas() {
    const areas = app.getConstantSync('REPAIR_LIVING_AREAS')
    const livingAreas = areas || ['本部', '馆周边', '5号院', '8号院', '湖畔']
    this.setData({
      livingAreas: livingAreas,
      areaPickerRange: ['全部居住区', ...livingAreas]
    })
  },

  /**
   * 检查物业角色权限
   */
  async checkPropertyPermission() {
    try {
      const result = await app.checkUserRegistration()
      if (result.registered && result.user) {
        const user = result.user
        this.setData({
          currentUser: user,
          isPropertyUser: user.role === '物业'
        })
      }
    } catch (error) {
      console.error('检查权限失败:', error)
    }
  },

  /**
   * Tab切换
   */
  async handleTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return

    this.setData({
      activeTab: tab,
      selectedArea: ''
    })

    wx.showLoading({ title: '加载中...', mask: true })
    try {
      await this.refreshList()
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 物业用户居住区筛选
   */
  handleAreaFilter(e) {
    const index = e.detail.value
    const areas = this.data.livingAreas
    this.setData({
      selectedArea: index > 0 ? areas[index - 1] : ''
    })

    wx.showLoading({ title: '加载中...', mask: true })
    this.refreshList().finally(() => wx.hideLoading())
  },

  /**
   * 重写 loadData（分页行为）
   */
  async loadData(params) {
    const { page, pageSize } = params
    const activeTab = this.data.activeTab

    return new Promise((resolve, reject) => {
      const data = activeTab === 'mine'
        ? { action: 'getMyList', page, pageSize }
        : {
            action: 'getAllList',
            params: {
              page,
              pageSize,
              livingArea: this.data.selectedArea || undefined
            }
          }

      wx.cloud.callFunction({
        name: 'repairManager',
        data
      }).then(res => {
        if (res.result.code === 0) {
          const resultData = res.result.data
          const list = (resultData.list || []).map(item => this.formatRepairItem(item))

          resolve({
            data: list,
            hasMore: resultData.page * resultData.pageSize < resultData.total
          })
        } else {
          reject(new Error(res.result.message))
        }
      }).catch(error => {
        console.error('加载报修列表失败:', error)
        wx.showToast({ title: '加载失败', icon: 'none' })
        reject(error)
      })
    })
  },

  /**
   * 格式化报修条目
   */
  formatRepairItem(item) {
    const STATUS_STYLE = {
      pending: { text: '已报修，待维修', color: '#B45309', bg: '#FEF3C7' },
      completed: { text: '已维修', color: '#16A34A', bg: '#DCFCE7' }
    }
    const style = STATUS_STYLE[item.status] || STATUS_STYLE.pending

    return {
      ...item,
      statusText: style.text,
      statusColor: style.color,
      statusBg: style.bg,
      createdAtText: item.createdAt ? utils.formatDateTime(item.createdAt) : '',
      completedAtText: item.completedAt ? utils.formatDateTime(item.completedAt) : '',
      contentPreview: item.content ? (item.content.length > 40 ? item.content.substring(0, 40) + '...' : item.content) : ''
    }
  },

  // ========== 表单弹窗 ==========

  /**
   * 打开报修表单
   */
  async showForm() {
    // 加载历史地址
    try {
      const res = await wx.cloud.callFunction({
        name: 'repairManager',
        data: { action: 'getHistoryAddresses' }
      })
      if (res.result.code === 0) {
        this.setData({ historyAddresses: res.result.data.addresses || [] })
      }
    } catch (error) {
      console.error('获取历史地址失败:', error)
    }

    this.setData({
      showFormPopup: true,
      form: {
        livingArea: '',
        address: '',
        content: '',
        images: []
      },
      areaIndex: 0,
      showAddressSuggestions: false
    })
  },

  hideFormPopup() {
    this.setData({ showFormPopup: false })
  },

  /**
   * 居住区选择
   */
  handleAreaChange(e) {
    const index = e.detail.value
    const areas = this.data.livingAreas
    this.setData({
      areaIndex: Number(index),
      'form.livingArea': areas[index] || ''
    })
  },

  /**
   * 地址输入（带历史地址提示）
   */
  handleAddressInput(e) {
    const value = e.detail.value
    this.setData({
      'form.address': value,
      showAddressSuggestions: value.length === 0 && this.data.historyAddresses.length > 0
    })
  },

  /**
   * 选择历史地址
   */
  handleSelectAddress(e) {
    const address = e.currentTarget.dataset.address
    this.setData({
      'form.address': address,
      showAddressSuggestions: false
    })
  },

  /**
   * 报修内容输入
   */
  handleContentInput(e) {
    this.setData({ 'form.content': e.detail.value })
  },

  /**
   * 选择图片
   */
  chooseImage() {
    const remaining = 3 - this.data.form.images.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath)
        this.setData({
          'form.images': [...this.data.form.images, ...newImages]
        })
      }
    })
  },

  /**
   * 删除已选图片
   */
  handleRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.form.images]
    images.splice(index, 1)
    this.setData({ 'form.images': images })
  },

  /**
   * 预览图片
   */
  handlePreviewImage(e) {
    const { url, urls } = e.currentTarget.dataset
    wx.previewImage({
      current: url,
      urls: urls
    })
  },

  /**
   * 上传图片到云存储
   */
  async uploadImages() {
    const images = this.data.form.images
    if (images.length === 0) return []

    const uploadTasks = images.map((tempPath, index) => {
      const cloudPath = `repair-images/${this.data.currentUser ? this.data.currentUser.openid : 'unknown'}/${Date.now()}_${index}.jpg`
      return wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath
      })
    })

    const results = await Promise.all(uploadTasks)
    return results.map(r => r.fileID)
  },

  /**
   * 验证表单
   */
  validateForm() {
    const form = this.data.form
    if (!form.livingArea) {
      wx.showToast({ title: '请选择居住区', icon: 'none' })
      return false
    }
    if (!form.address || !form.address.trim()) {
      wx.showToast({ title: '请填写地址', icon: 'none' })
      return false
    }
    if (!form.content || !form.content.trim()) {
      wx.showToast({ title: '请填写报修内容', icon: 'none' })
      return false
    }
    return true
  },

  /**
   * 提交报修
   */
  async submitRepair() {
    if (this.data.submitting) return
    if (!this.validateForm()) return

    this.setData({ submitting: true })

    try {
      // 上传图片
      const imageFileIds = await this.uploadImages()

      const res = await wx.cloud.callFunction({
        name: 'repairManager',
        data: {
          action: 'submit',
          repairData: {
            livingArea: this.data.form.livingArea,
            address: this.data.form.address.trim(),
            content: this.data.form.content.trim(),
            images: imageFileIds
          }
        }
      })

      if (res.result.code === 0) {
        wx.showToast({ title: '提交成功', icon: 'success' })
        this.setData({ showFormPopup: false })
        await this.refreshList()
      } else {
        wx.showToast({ title: res.result.message || '提交失败', icon: 'none' })
      }
    } catch (error) {
      console.error('提交报修失败:', error)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ========== 详情弹窗 ==========

  /**
   * 查看报修详情
   */
  showDetail(e) {
    const repair = e.currentTarget.dataset.repair
    this.setData({
      selectedRepair: repair,
      showDetailPopup: true
    })
  },

  hideDetailPopup() {
    this.setData({ showDetailPopup: false, selectedRepair: null })
  },

  /**
   * 物业用户标记维修完成
   */
  async handleComplete() {
    if (this.data.operating) return
    if (!this.data.selectedRepair) return

    const confirm = await new Promise(resolve => {
      wx.showModal({
        title: '确认操作',
        content: '确定该报修已完成维修？',
        success: res => resolve(res.confirm)
      })
    })
    if (!confirm) return

    this.setData({ operating: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'repairManager',
        data: {
          action: 'complete',
          repairId: this.data.selectedRepair._id
        }
      })

      if (res.result.code === 0) {
        wx.showToast({ title: '已标记维修完成', icon: 'success' })
        this.setData({ showDetailPopup: false, selectedRepair: null })
        await this.refreshList()
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      console.error('标记完成失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ operating: false })
    }
  },

  /**
   * 阻止冒泡
   */
  stopPropagation() {},

  onReachBottom() {
    this.loadMore()
  },

  async onPullDownRefresh() {
    await this.refreshList()
    wx.stopPullDownRefresh()
  }
})
