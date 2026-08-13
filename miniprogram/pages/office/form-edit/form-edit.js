const app = getApp()
const utils = require('../../../common/utils.js')
const modalAnimation = require('../../../behaviors/modalAnimation.js')
const {
  TAG_LIST,
  BLOCK_TYPE_LIST,
  getTagConfig,
  getBlockTypeConfig
} = require('../../../common/form-constants.js')

const DRAFT_KEY = 'content_form_draft'

// 生成短随机 id
function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// 给 block 附加展示字段
function decorateBlock(block) {
  const cfg = getBlockTypeConfig(block.type)
  return {
    ...block,
    typeLabel: cfg.label,
    typeIcon: cfg.icon,
    typeColor: cfg.color,
    typeBg: cfg.bg
  }
}

// 移除展示字段，仅保留可提交的原始字段
function stripBlock(block) {
  const b = {
    id: block.id,
    type: block.type,
    title: block.title || '',
    required: !!block.required
  }
  if (['radio', 'checkbox', 'judge'].includes(block.type)) {
    b.options = (block.options || []).map(o => String(o).trim()).filter(o => o)
  }
  if (block.type === 'side_dish') {
    b.categories = (block.categories || []).map(c => ({
      id: c.id || genId('cat'),
      name: String(c.name || '').trim(),
      maxCount: Number(c.maxCount) || 1
    }))
  }
  if (block.type === 'activity') {
    b.groups = (block.groups || []).map(g => String(g).trim()).filter(g => g)
    b.maxRegistrations = block.maxRegistrations ? Number(block.maxRegistrations) : null
  }
  if (block.type === 'text') {
    b.title = block.title || ''
  }
  return b
}

// 根据类型创建默认 block
function createDefaultBlock(type) {
  const base = { id: genId('b'), type, title: '', required: false }
  if (['radio', 'checkbox'].includes(type)) {
    base.options = ['', '']
  } else if (type === 'judge') {
    base.options = ['正确', '错误']
  } else if (type === 'side_dish') {
    base.categories = [{ id: genId('cat'), name: '', maxCount: 1 }]
  } else if (type === 'activity') {
    base.groups = []
    base.maxRegistrations = null
  }
  return base
}

Page({
  behaviors: [modalAnimation],

  data: {
    formId: '',
    isEdit: false,
    canPublish: false,
    title: '',
    description: '',
    tag: 'announcement',
    tagList: TAG_LIST,
    blockTypeList: BLOCK_TYPE_LIST,
    blocks: [],
    deadline: '',
    deadlineTs: null,
    minDate: '',
    showDeadline: false,
    targetRoles: [],
    targetRoleOptions: [
      { value: '馆员', checked: false },
      { value: '其他', checked: false },
      { value: '待赴任馆员', checked: false }
    ],
    isTargetOnlyVisible: false,
    showTargetRole: false,
    isAnonymous: false,
    maxSubmissions: 1,
    editorCtx: null,
    // 控件配置弹窗
    showBlockModal: false,
    editingIndex: -1,
    editingBlock: null,
    // 删除动画
    removingIndex: -1,
    // 草稿
    showDraftTip: false,
    // 提交状态
    saving: false,
    publishing: false
  },

  onLoad(options) {
    this.setData({
      minDate: utils.getLocalDateString()
    })
    this.checkPublishPermission()

    if (options.id) {
      this.setData({ formId: options.id, isEdit: true })
      this.loadForm(options.id)
    } else {
      this.checkDraft()
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  /**
   * 检查发布权限（馆员 / 管理员）
   */
  checkPublishPermission() {
    app.checkUserRegistration().then((result) => {
      if (!result.registered || !result.user) {
        this.setData({ canPublish: false })
        return
      }
      const user = result.user
      const canPublish = !!user.isAdmin || user.role === '馆员'
      this.setData({ canPublish })
      if (!canPublish) {
        wx.showModal({
          title: '提示',
          content: '仅馆员可发布信息',
          showCancel: false,
          confirmText: '知道了',
          success: () => wx.navigateBack()
        })
      }
    }).catch(() => {
      this.setData({ canPublish: false })
    })
  },

  /**
   * 加载已有表单（编辑模式）
   */
  loadForm(formId) {
    wx.showLoading({ title: '加载中...', mask: true })
    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: { action: 'get', params: { formId } }
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '加载失败')
      }
      const form = result.data.form || {}
      const blocks = (form.blocks || []).map(decorateBlock)
      this.setData({
        title: form.title || '',
        description: form.description || '',
        tag: form.tag || 'announcement',
        blocks,
        deadline: form.deadline ? utils.formatDateTime(form.deadline) : '',
        deadlineTs: form.deadline || null,
        showDeadline: !!form.deadline,
        targetRoles: form.targetRoles || [],
        targetRoleOptions: this.syncTargetRoleOptions(form.targetRoles || []),
        isTargetOnlyVisible: !!form.isTargetOnlyVisible,
        showTargetRole: !!(form.targetRoles && form.targetRoles.length > 0),
        isAnonymous: !!form.isAnonymous,
        maxSubmissions: form.maxSubmissions || 1
      })
      // 富文本内容回填
      if (this.data.editorCtx && form.description) {
        this.data.editorCtx.setContents({ html: form.description })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('加载表单失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
    })
  },

  /**
   * 检查本地草稿
   */
  checkDraft() {
    try {
      const draft = wx.getStorageSync(DRAFT_KEY)
      if (draft && draft.title) {
        this.setData({ showDraftTip: true })
      }
    } catch (e) {}
  },

  /**
   * 恢复草稿
   */
  handleRestoreDraft() {
    try {
      const draft = wx.getStorageSync(DRAFT_KEY)
      if (!draft) {
        this.setData({ showDraftTip: false })
        return
      }
      const blocks = (draft.blocks || []).map(decorateBlock)
      this.setData({
        title: draft.title || '',
        description: draft.description || '',
        tag: draft.tag || 'announcement',
        blocks,
        deadline: draft.deadline || '',
        deadlineTs: draft.deadlineTs || null,
        showDeadline: !!draft.deadline,
        targetRoles: draft.targetRoles || [],
        targetRoleOptions: this.syncTargetRoleOptions(draft.targetRoles || []),
        isTargetOnlyVisible: !!draft.isTargetOnlyVisible,
        showTargetRole: !!(draft.targetRoles && draft.targetRoles.length > 0),
        isAnonymous: !!draft.isAnonymous,
        maxSubmissions: draft.maxSubmissions || 1,
        showDraftTip: false
      })
      if (this.data.editorCtx && draft.description) {
        this.data.editorCtx.setContents({ html: draft.description })
      }
      utils.showToast({ title: '已恢复草稿', icon: 'success' })
    } catch (e) {
      this.setData({ showDraftTip: false })
    }
  },

  /**
   * 放弃草稿
   */
  handleDiscardDraft() {
    this.setData({ showDraftTip: false })
    try {
      wx.removeStorageSync(DRAFT_KEY)
    } catch (e) {}
  },

  onEditorReady() {
    const query = wx.createSelectorQuery()
    query.select('#editor').context(res => {
      this.setData({ editorCtx: res.context })
      if (this.data.description && res.context) {
        res.context.setContents({ html: this.data.description })
      }
    }).exec()
  },

  onEditorInput(e) {
    this.setData({ description: e.detail.html })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  /**
   * 选择 tag
   */
  handleSelectTag(e) {
    const tag = e.currentTarget.dataset.tag
    if (!tag || tag === this.data.tag) return
    this.setData({ tag })
  },

  /**
   * 点击控件库，添加控件并打开配置弹窗
   */
  handleAddBlock(e) {
    const type = e.currentTarget.dataset.type
    if (!type) return
    const block = createDefaultBlock(type)
    this.openBlockModal(block, -1)
  },

  /**
   * 打开控件配置弹窗
   */
  openBlockModal(block, index) {
    this.setData({
      showBlockModal: true,
      modalAnimating: false,
      editingIndex: index,
      editingBlock: utils.deepClone(block)
    })
  },

  /**
   * 关闭控件配置弹窗
   */
  closeBlockModal() {
    this._closeModal('showBlockModal', () => {
      this.setData({ editingBlock: null, editingIndex: -1 })
    })
  },

  stopPropagation() {},

  /**
   * 确认控件配置
   */
  handleConfirmBlock() {
    const block = this.data.editingBlock
    if (!block) return

    // 校验
    if (['radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity'].includes(block.type)) {
      if (!block.title || !block.title.trim()) {
        utils.showToast({ title: '请输入题干', icon: 'none' })
        return
      }
    }
    if (['radio', 'checkbox', 'judge'].includes(block.type)) {
      const options = (block.options || []).map(o => String(o).trim()).filter(o => o)
      if (options.length < 2) {
        utils.showToast({ title: '至少填写 2 个选项', icon: 'none' })
        return
      }
    }
    if (block.type === 'side_dish') {
      const categories = (block.categories || []).map(c => ({ ...c, name: String(c.name || '').trim() })).filter(c => c.name)
      if (categories.length === 0) {
        utils.showToast({ title: '至少填写 1 个副食类别', icon: 'none' })
        return
      }
      for (const c of categories) {
        if (!c.maxCount || c.maxCount < 1) {
          utils.showToast({ title: `类别「${c.name}」份数至少为 1`, icon: 'none' })
          return
        }
      }
    }

    const decorated = decorateBlock(block)
    const blocks = [...this.data.blocks]
    if (this.data.editingIndex >= 0) {
      blocks[this.data.editingIndex] = decorated
    } else {
      decorated.isNew = true
      blocks.push(decorated)
    }

    this.setData({ blocks })
    this.closeBlockModal()

    // 清理 isNew 标记（动画结束后）
    setTimeout(() => {
      const clean = this.data.blocks.map(b => ({ ...b, isNew: false }))
      this.setData({ blocks: clean })
    }, 500)
  },

  // ===== 控件配置弹窗内操作 =====

  onBlockTitleInput(e) {
    this.setData({ 'editingBlock.title': e.detail.value })
  },

  onBlockRequiredToggle() {
    this.setData({ 'editingBlock.required': !this.data.editingBlock.required })
  },

  onOptionInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ [`editingBlock.options[${index}]`]: e.detail.value })
  },

  onAddOption() {
    const options = [...(this.data.editingBlock.options || []), '']
    this.setData({ 'editingBlock.options': options })
  },

  onRemoveOption(e) {
    const index = e.currentTarget.dataset.index
    const options = [...(this.data.editingBlock.options || [])]
    options.splice(index, 1)
    this.setData({ 'editingBlock.options': options })
  },

  onCategoryNameInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ [`editingBlock.categories[${index}].name`]: e.detail.value })
  },

  onCategoryMaxInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ [`editingBlock.categories[${index}].maxCount`]: e.detail.value })
  },

  onAddCategory() {
    const categories = [...(this.data.editingBlock.categories || []), { id: genId('cat'), name: '', maxCount: 1 }]
    this.setData({ 'editingBlock.categories': categories })
  },

  onRemoveCategory(e) {
    const index = e.currentTarget.dataset.index
    const categories = [...(this.data.editingBlock.categories || [])]
    categories.splice(index, 1)
    this.setData({ 'editingBlock.categories': categories })
  },

  onGroupInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ [`editingBlock.groups[${index}]`]: e.detail.value })
  },

  onAddGroup() {
    const groups = [...(this.data.editingBlock.groups || []), '']
    this.setData({ 'editingBlock.groups': groups })
  },

  onRemoveGroup(e) {
    const index = e.currentTarget.dataset.index
    const groups = [...(this.data.editingBlock.groups || [])]
    groups.splice(index, 1)
    this.setData({ 'editingBlock.groups': groups })
  },

  onMaxRegistrationsInput(e) {
    this.setData({ 'editingBlock.maxRegistrations': e.detail.value })
  },

  /**
   * 编辑已有控件
   */
  handleEditBlock(e) {
    const index = e.currentTarget.dataset.index
    const block = this.data.blocks[index]
    if (!block) return
    this.openBlockModal(block, index)
  },

  /**
   * 上移 / 下移
   */
  handleMoveBlock(e) {
    const index = Number(e.currentTarget.dataset.index)
    const dir = e.currentTarget.dataset.dir
    const blocks = [...this.data.blocks]
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= blocks.length) return

    // 记录被移动的 block id（用于播放移动动画）
    const movingId = blocks[index].id
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]

    const animBlocks = blocks.map(b => ({
      ...b,
      moveAnim: b.id === movingId ? dir : ''
    }))
    this.setData({ blocks: animBlocks })

    // 动画结束后清除标记
    setTimeout(() => {
      this.setData({
        blocks: this.data.blocks.map(b => ({ ...b, moveAnim: '' }))
      })
    }, 400)
  },

  /**
   * 删除控件（淡出动画后移除）
   */
  handleRemoveBlock(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (this.data.removingIndex >= 0) return
    this.setData({ removingIndex: index })
    setTimeout(() => {
      const blocks = [...this.data.blocks]
      blocks.splice(index, 1)
      this.setData({ blocks, removingIndex: -1 })
    }, 320)
  },

  // ===== 截止时间 =====

  handleToggleDeadline() {
    this.setData({ showDeadline: !this.data.showDeadline })
    if (!this.data.showDeadline) {
      this.setData({ deadline: '', deadlineTs: null })
    }
  },

  onDeadlineChange(e) {
    const detail = e.detail || {}
    let deadlineTs = null
    if (detail.year && detail.month) {
      deadlineTs = new Date(detail.year, detail.month - 1, detail.day, detail.hour || 0, detail.minute || 0, 0).getTime()
    }
    this.setData({ deadline: detail.value || '', deadlineTs })
  },

  // ===== 目标角色 =====

  handleToggleTargetRole() {
    this.setData({ showTargetRole: !this.data.showTargetRole })
    if (!this.data.showTargetRole) {
      this.setData({ targetRoles: [], isTargetOnlyVisible: false })
    }
  },

  handleToggleRole(e) {
    const role = e.currentTarget.dataset.role
    let targetRoles = [...this.data.targetRoles]
    const idx = targetRoles.indexOf(role)
    if (idx >= 0) {
      targetRoles.splice(idx, 1)
    } else {
      targetRoles.push(role)
    }
    const targetRoleOptions = this.syncTargetRoleOptions(targetRoles)
    this.setData({ targetRoles, targetRoleOptions })
  },

  /**
   * 根据选中的角色列表，刷新角色选项的选中态（WXML 不支持 indexOf 方法调用）
   */
  syncTargetRoleOptions(targetRoles) {
    return this.data.targetRoleOptions.map(o => ({
      ...o,
      checked: (targetRoles || []).indexOf(o.value) >= 0
    }))
  },

  onTargetOnlyVisibleToggle() {
    this.setData({ isTargetOnlyVisible: !this.data.isTargetOnlyVisible })
  },

  // ===== 匿名填写 / 填写次数 =====

  onAnonymousToggle() {
    this.setData({ isAnonymous: !this.data.isAnonymous })
  },

  onMaxSubmissionsMinus() {
    const val = Math.max(1, (this.data.maxSubmissions || 1) - 1)
    this.setData({ maxSubmissions: val })
  },

  onMaxSubmissionsPlus() {
    const val = Math.min(99, (this.data.maxSubmissions || 1) + 1)
    this.setData({ maxSubmissions: val })
  },

  // ===== 提交 =====

  /**
   * 构建表单数据
   */
  buildFormData() {
    const title = this.data.title.trim()
    const deadline = this.data.deadlineTs || null
    const blocks = this.data.blocks.map(stripBlock)
    return {
      title,
      description: this.data.description || '',
      tag: this.data.tag,
      deadline,
      blocks,
      targetRoles: this.data.showTargetRole ? this.data.targetRoles : [],
      isTargetOnlyVisible: this.data.showTargetRole ? this.data.isTargetOnlyVisible : false,
      isAnonymous: this.data.tag === 'questionnaire' ? this.data.isAnonymous : false,
      maxSubmissions: this.data.tag === 'quiz' ? this.data.maxSubmissions : 1
    }
  },

  /**
   * 暂存（本地缓存 + 可选发布为草稿）
   */
  handleSaveDraft() {
    if (!this.validateBasic()) return

    const draft = this.buildFormData()
    draft.deadline = this.data.deadline // 暂存时保留字符串，便于恢复
    draft.deadlineTs = this.data.deadlineTs

    try {
      wx.setStorageSync(DRAFT_KEY, draft)
    } catch (e) {
      utils.showToast({ title: '暂存失败', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    utils.showToast({ title: '已暂存到本地', icon: 'success' })
    setTimeout(() => this.setData({ saving: false }), 400)
  },

  /**
   * 基础校验
   */
  validateBasic() {
    if (!this.data.canPublish) {
      wx.showModal({
        title: '提示',
        content: '仅馆员可发布信息',
        showCancel: false,
        confirmText: '知道了'
      })
      return false
    }
    if (!this.data.title.trim()) {
      utils.showToast({ title: '请输入标题', icon: 'none' })
      return false
    }
    return true
  },

  /**
   * 发布
   */
  handlePublish() {
    if (this.data.publishing) return
    if (!this.validateBasic()) return

    const formData = this.buildFormData()

    // 确认发布
    wx.showModal({
      title: '确认发布',
      content: `确定发布「${formData.title}」吗？`,
      success: (res) => {
        if (!res.confirm) return
        this.doSubmit(formData)
      }
    })
  },

  doSubmit(formData) {
    this.setData({ publishing: true })
    wx.showLoading({ title: '发布中...', mask: true })

    const action = this.data.isEdit ? 'update' : 'create'
    const payload = {
      action,
      params: this.data.isEdit
        ? { formId: this.data.formId, ...formData, status: 'published' }
        : { ...formData, status: 'published' }
    }

    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: payload
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '发布失败')
      }
      // 清除本地草稿
      try { wx.removeStorageSync(DRAFT_KEY) } catch (e) {}
      utils.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    }).catch(err => {
      wx.hideLoading()
      console.error('发布失败:', err)
      utils.showToast({ title: err.message || '发布失败', icon: 'none' })
    }).finally(() => {
      this.setData({ publishing: false })
    })
  }
})
