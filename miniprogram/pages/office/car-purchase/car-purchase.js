/**
 * 购车管理页面（Checklist 模式）
 *
 * 功能：
 * - 双Tab：「我的购车」(申请人视角) + 「购车管理」(办公室人员视角)
 * - 提交购车申请（底部弹窗表单）
 * - 纵向Checklist时间线展示6组步骤进度
 * - 步骤操作：打钩/上传文件/填写文本/选择日期
 * - 自动通知推送
 */
const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

Page({
  behaviors: [paginationBehavior],

  data: {
    loading: false,
    submitting: false,
    uploading: false,

    // Tab 切换
    currentTab: 'mine',       // mine | manage
    isOfficeStaff: false,     // 是否办公室人员

    // 弹窗控制
    showFormPopup: false,
    showDetailPopup: false,
    showStepEditPopup: false,

    // 数据列表
    recordList: [],

    // 选中的记录和详情
    selectedRecord: null,
    detailData: null,

    // 表单数据
    form: {
      carModel: ''
    },

    // 步骤编辑弹层数据
    editingStep: null,
    editingGroupIndex: -1,
    editingStepIndex: -1,
    stepFormValue: '',
    stepFormRemark: '',
    uploadedTempFiles: []   // 临时已选择的文件列表
  },

  async onLoad() {
    this.initPagination({
      initialPageSize: 10,
      loadMorePageSize: 10
    })

    const userInfo = app.globalData.userProfile || {}
    this.setData({
      isOfficeStaff: (userInfo.department === '办公室')
    })
  },

  async onShow() {
    if (!this.data.showFormPopup && !this.data.showDetailPopup && !this.data.showStepEditPopup) {
      wx.showLoading({ title: '加载中...', mask: true })
      try {
        await this.refreshList()
      } finally {
        wx.hideLoading()
      }
    }
  },

  onReachBottom() {
    this.loadMore()
  },

  async onPullDownRefresh() {
    await this.refreshList()
    wx.stopPullDownRefresh()
  },

  // ========== Tab 切换 ==========

  handleTabSwitch(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.currentTab) return
    this.setData({ currentTab: tab, recordList: [] })
    this.resetPagination()
    this.refreshList()
  },

  // ========== 分页加载 ==========

  async loadData(params) {
    const _page = Number(params.page) || 1
    const _pageSize = Number(params.pageSize) || 10

    return new Promise((resolve, reject) => {
      const action = this.data.currentTab === 'manage' ? 'getAllList' : 'getMyList'

      wx.cloud.callFunction({
        name: 'carPurchase',
        data: { action, page: _page, pageSize: _pageSize }
      }).then(res => {
        if (res.result.code === 0) {
          const data = res.result.data
          const recordList = (data.list || []).map(item => this.formatRecordItem(item))

          this.setData({
            recordList: _page === 1 ? recordList : [...this.data.recordList, ...recordList]
          })

          resolve({
            data: recordList,
            hasMore: data.hasMore !== false
          })
        } else {
          reject(new Error(res.result.message))
        }
      }).catch(error => {
        console.error('加载购车记录失败:', error)
        utils.showToast({ title: '加载失败', icon: 'none' })
        reject(error)
      })
    })
  },

  formatRecordItem(item) {
    return {
      ...item,
      createdAtText: item.createdAt ? utils.formatDateTime(item.createdAt) : '',
      updatedAtText: item.updatedAt ? utils.formatRelativeTime(item.updatedAt) : '',
      statusText: item.status === 'completed' ? '已完成' : `G${item.currentGroup}-${item.currentGroupName || ''}`,
      statusColor: item.status === 'completed' ? '#16A34A' : '#0891B2'
    }
  },

  /**
   * 格式化详情数据（复用 utils 时间格式化）
   */
  formatDetailData(detail) {
    const formatted = {
      ...detail,
      createdAtText: detail.createdAt ? utils.formatDateTime(detail.createdAt) : ''
    }

    // 格式化每个 step 的 completedAt
    if (formatted.groups && Array.isArray(formatted.groups)) {
      formatted.groups = formatted.groups.map(group => ({
        ...group,
        steps: (group.steps || []).map(step => ({
          ...step,
          completedAtText: step.completedAt ? utils.formatDateTime(step.completedAt) : ''
        }))
      }))
    }

    return formatted
  },

  // ========== 申请表单 ==========

  showApplicationForm() {
    this.setData({
      showFormPopup: true,
      form: { carModel: '' }
    })
  },

  hideFormPopup() {
    this.setData({ showFormPopup: false })
  },

  handleCarModelInput(e) {
    this.setData({ 'form.carModel': e.detail.value })
  },

  validateForm() {
    if (!String(this.data.form.carModel || '').trim()) {
      utils.showToast({ title: '请输入车型', icon: 'none' })
      return false
    }
    return true
  },

  async submitApplication() {
    if (this.data.submitting) return
    if (!this.validateForm()) return

    this.setData({ submitting: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'carPurchase',
        data: {
          action: 'create',
          carModel: String(this.data.form.carModel).trim()
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '创建成功', icon: 'success' })
        this.setData({ showFormPopup: false, form: { carModel: '' } })
        await this.refreshList()
      } else {
        utils.showToast({ title: res.result.message || '提交失败', icon: 'none' })
      }
    } catch (error) {
      console.error('提交购车申请失败:', error)
      utils.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ========== 详情查看 ==========

  async showRecordDetail(e) {
    const record = e.currentTarget.dataset.record
    if (!record || !record._id) return

    wx.showLoading({ title: '加载中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'carPurchase',
        data: { action: 'getDetail', recordId: record._id }
      })

      if (res.result.code === 0) {
        const detail = res.result.data
        this.setData({
          selectedRecord: record,
          detailData: this.formatDetailData(detail),
          showDetailPopup: true
        })
      } else {
        utils.showToast({ title: res.result.message || '获取详情失败', icon: 'none' })
      }
    } catch (error) {
      console.error('获取详情失败:', error)
      utils.showToast({ title: '获取详情失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  hideDetailPopup() {
    this.setData({ showDetailPopup: false, detailData: null, selectedRecord: null })
  },

  // ========== Checklist 时间线操作 ==========

  /**
   * 获取组的CSS类名（用于时间线颜色）
   */
  getGroupClass(group, groupIndex) {
    const currentGroup = this.data.detailData ? this.data.detailData.currentGroup : 0
    if (group.groupId < currentGroup) return 'cp-group-completed'
    if (group.groupId === currentGroup) return 'cp-group-active'
    return 'cp-group-pending'
  },

  /**
   * 获取步骤状态CSS类名
   */
  getStepStatusClass(step) {
    if (step.status === 'done') return 'cp-step-done'
    return 'cp-step-pending'
  },

  /**
   * 判断当前用户是否可以操作某步
   */
  canOperateStep(group, groupSummary) {
    if (!this.data.detailData) return false
    if (!groupSummary || !groupSummary.canOperate) return false
    // 还没到该组不能操作
    if (group.groupId > this.data.detailData.currentGroup) return false
    // 已完成的组不能再操作
    if (group.groupId < this.data.detailData.currentGroup) return false
    return true
  },

  // ========== 步骤编辑弹层 ==========

  handleStepAction(e) {
    const { groupindex, stepindex } = e.currentTarget.dataset
    const detailData = this.data.detailData
    if (!detailData) return

    const group = detailData.groups[groupindex]
    const step = group.steps[stepindex]

    // 权限检查
    if (group.groupOwner === 'staff') {
      if (!detailData._isApplicant) {
        utils.showToast({ title: '仅申请人可操作', icon: 'none' })
        return
      }
    } else {
      if (!detailData._isOfficeStaff) {
        utils.showToast({ title: '仅办公室人员可操作', icon: 'none' })
        return
      }
    }

    if (group.groupId > detailData.currentGroup) {
      utils.showToast({ title: '当前阶段尚未到此步骤', icon: 'none' })
      return
    }

    // 根据inputType决定弹层行为
    if (step.inputType === 'checkbox') {
      // checkbox 直接打钩，不弹窗
      this.doToggleStep(step.stepKey)
      return
    }

    if (step.inputType === 'date') {
      // date 直接打开日期选择
      this.openDatePicker(groupindex, stepindex, step)
      return
    }

    // text / remark / upload / template 打开编辑弹层
    this.setData({
      showStepEditPopup: true,
      editingStep: { ...step },
      editingGroupIndex: groupindex,
      editingStepIndex: stepindex,
      stepFormValue: step.value || '',
      stepFormRemark: step.remark || '',
      uploadedTempFiles: (step.attachments || []).map(a => ({ fileID: a.fileID, fileName: a.fileName }))
    })
  },

  hideStepEditPopup() {
    this.setData({
      showStepEditPopup: false,
      editingStep: null,
      editingGroupIndex: -1,
      editingStepIndex: -1,
      stepFormValue: '',
      stepFormRemark: '',
      uploadedTempFiles: []
    })
  },

  handleStepValueInput(e) {
    this.setData({ stepFormValue: e.detail.value })
  },

  handleStepRemarkInput(e) {
    this.setData({ stepFormRemark: e.detail.value })
  },

  handleDateChange(e) {
    this.setData({ stepFormValue: e.detail.value })
  },

  openDatePicker(groupIndex, stepIndex, step) {
    // 对于date类型，直接用 datetime-picker 组件的值来更新
    // 这里简化为弹出一个小输入框让用户选日期
    this.setData({
      showStepEditPopup: true,
      editingStep: { ...step },
      editingGroupIndex: groupIndex,
      editingStepIndex: stepIndex,
      stepFormValue: step.value || '',
      stepFormRemark: step.remark || '',
      uploadedTempFiles: []
    })
  },

  // 文件选择
  chooseImage() {
    const maxFiles = (this.data.editingStep && this.data.editingStep.maxFiles) || 9
    const currentCount = this.data.uploadedTempFiles.length
    const remainCount = maxFiles - currentCount
    if (remainCount <= 0) {
      utils.showToast({ title: `最多上传 ${maxFiles} 张图片`, icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newFiles = res.tempFiles.map(f => ({
          tempFilePath: f.tempFilePath,
          fileType: f.fileType || 'image'
        }))
        this.setData({
          uploadedTempFiles: [...this.data.uploadedTempFiles, ...newFiles]
        })
      }
    })
  },

  // 预览图片
  previewImage(e) {
    const idx = e.currentTarget.dataset.index
    const urls = this.data.uploadedTempFiles
      .filter(f => f.fileID)
      .map(f => f.fileID)

    if (idx >= 0 && urls[idx]) {
      wx.previewImage({ current: urls[idx], urls })
    }
  },

  // 删除已选文件
  removeTempFile(e) {
    const idx = e.currentTarget.dataset.index
    const files = [...this.data.uploadedTempFiles]
    files.splice(idx, 1)
    this.setData({ uploadedTempFiles: files })
  },

  // ========== 保存步骤编辑 ==========

  async saveStepEdit() {
    const step = this.data.editingStep
    const recordId = this.data.selectedRecord._id
    const stepKey = step.stepKey
    const inputType = step.inputType

    this.setData({ uploading: true })

    try {
      let hasUploadError = false

      // 只处理真正新上传的文件（有 tempFilePath 的），已有 fileID 的不再重复发送
      const newUploads = []
      for (const tf of this.data.uploadedTempFiles) {
        if (tf.tempFilePath) {
          try {
            const ext = tf.tempFilePath.includes('.pdf') ? 'pdf' :
                        tf.tempFilePath.includes('.png') ? 'png' : 'jpg'
            const cloudPath = `car-purchase/${recordId}/${stepKey}/${Date.now()}_${Math.random().toString(36).substr(2, 4)}.${ext}`
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath,
              filePath: tf.tempFilePath
            })
            newUploads.push({
              fileID: uploadRes.fileID,
              fileName: `${stepKey}_${Date.now()}.${ext}`,
              fileType: 'image',
              uploadedAt: new Date().toISOString()
            })
          } catch (uploadErr) {
            console.error('上传文件失败:', uploadErr)
            hasUploadError = true
          }
        }
      }

      // 根据类型调用不同的保存接口
      if (inputType === 'text') {
        await wx.cloud.callFunction({
          name: 'carPurchase',
          data: {
            action: 'updateStepRemark',
            recordId,
            stepKey,
            value: this.data.stepFormValue.trim()
          }
        })
      } else if (inputType === 'remark') {
        await wx.cloud.callFunction({
          name: 'carPurchase',
          data: {
            action: 'updateStepRemark',
            recordId,
            stepKey,
            remark: this.data.stepFormRemark.trim()
          }
        })
      } else if (inputType === 'upload') {
        // 上传新文件（如果有）
        if (newUploads.length > 0) {
          await wx.cloud.callFunction({
            name: 'carPurchase',
            data: {
              action: 'uploadAttachments',
              recordId,
              stepKey,
              attachments: newUploads
            }
          })
        }
        // 同时保存备注（如果有填写）
        if (this.data.stepFormRemark.trim()) {
          await wx.cloud.callFunction({
            name: 'carPurchase',
            data: {
              action: 'updateStepRemark',
              recordId,
              stepKey,
              remark: this.data.stepFormRemark.trim()
            }
          })
        }
      } else if (inputType === 'date') {
        await wx.cloud.callFunction({
          name: 'carPurchase',
          data: {
            action: 'updateStepRemark',
            recordId,
            stepKey,
            value: this.data.stepFormValue
          }
        })
      }

      if (hasUploadError) {
        utils.showToast({ title: '部分文件上传失败', icon: 'none' })
      } else {
        utils.showToast({ title: '保存成功', icon: 'success' })
      }

      // 关闭弹窗并刷新详情
      this.hideStepEditPopup()

      // 重新获取详情以更新UI
      setTimeout(() => {
        this.refreshCurrentDetail()
      }, 300)

    } catch (error) {
      console.error('保存步骤失败:', error)
      utils.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  // ========== Checkbox 直接打钩 ==========

  async doToggleStep(stepKey) {
    const recordId = this.data.selectedRecord._id
    if (!recordId) return

    wx.showLoading({ title: '处理中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'carPurchase',
        data: { action: 'toggleStep', recordId, stepKey }
      })

      if (res.result.code === 0) {
        const result = res.result.data
        utils.showToast({
          title: result.newStatus === 'done' ? '已完成' : '已取消',
          icon: 'success'
        })
        // 刷新详情
        setTimeout(() => { this.refreshCurrentDetail() }, 300)
      } else {
        utils.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      console.error('切换步骤失败:', error)
      utils.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // ========== 刷新当前详情 ==========

  async refreshCurrentDetail() {
    if (!this.data.selectedRecord || !this.data.selectedRecord._id) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'carPurchase',
        data: { action: 'getDetail', recordId: this.data.selectedRecord._id }
      })
      if (res.result.code === 0) {
        const raw = res.result.data
        this.setData({
          detailData: this.formatDetailData(raw),
          selectedRecord: {
            ...this.data.selectedRecord,
            progress: raw.progress,
            status: raw.status,
            currentGroup: raw.currentGroup
          }
        })
      }
    } catch (e) {
      console.error('刷新详情失败:', e)
    }
  },

  stopPropagation() {},

  // ========== 删除购车记录 ==========

  async deleteRecord(e) {
    const recordId = e.currentTarget.dataset.recordId
    if (!recordId) return

    const confirm = await new Promise(resolve => {
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复，确定要删除该购车流程吗？',
        confirmText: '删除',
        confirmColor: '#DC2626',
        success(res) {
          resolve(res.confirm)
        }
      })
    })

    if (!confirm) return

    this.hideDetailPopup()
    wx.showLoading({ title: '删除中...' })
    try {
      await wx.cloud.callFunction({
        name: 'carPurchase',
        data: { action: 'deleteRecord', recordId }
      })
      utils.showToast({ title: '已删除', icon: 'success' })
      await this.refreshList()
    } catch (error) {
      console.error('删除失败:', error)
      utils.showToast({ title: '删除失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})
