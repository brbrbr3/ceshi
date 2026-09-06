const app = getApp()
const utils = require('../../../../common/utils.js')
const modalAnimation = require('../../../../behaviors/modalAnimation.js')
const {
  getTagList,
  getBlockTypeList,
  getFillableTypes,
  getTagBlocks,
  getTagConfig,
  getBlockTypeConfig
} = require('../../../../common/form-constants.js')

const DRAFT_KEY = 'content_form_draft'

// 生成短随机 id
function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// 给 block 附加展示字段
function decorateBlock(block) {
  const cfg = getBlockTypeConfig(block.type)
  const decorated = {
    ...block,
    typeLabel: cfg.label,
    typeIcon: cfg.icon,
    typeColor: cfg.color,
    typeBg: cfg.bg
  }
  // 选择题：预计算每个选项的标答状态（供「已添加控件」预览展示）
  if (['radio', 'checkbox', 'judge'].includes(block.type)) {
    const corrects = block.type === 'checkbox'
      ? (Array.isArray(block.correctAnswers) ? block.correctAnswers : [])
      : (block.correctAnswers ? [block.correctAnswers] : [])
    decorated.previewOptions = (block.options || []).map(o => {
      const val = String(o).trim()
      return { value: val, isCorrect: corrects.indexOf(val) >= 0 }
    })
  }
  return decorated
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
    if (block.type === 'checkbox') {
      b.correctAnswers = Array.isArray(block.correctAnswers)
        ? block.correctAnswers.map(a => String(a).trim()).filter(Boolean)
        : []
    } else {
      b.correctAnswers = block.correctAnswers ? String(block.correctAnswers).trim() : ''
    }
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
  const base = {
    id: genId('b'),
    type,
    title: '',
    required: false
  }
  if (type === 'radio') {
    base.options = ['', '']
    base.correctAnswers = ''
  } else if (type === 'checkbox') {
    base.options = ['', '']
    base.correctAnswers = []
  } else if (type === 'judge') {
    base.options = ['正确', '错误']
    base.correctAnswers = ''
  } else if (type === 'side_dish') {
    base.categories = [{
      id: genId('cat'),
      name: '',
      maxCount: 1
    }]
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
    tag: '',
    tagList: [],
    allBlockTypeList: [],
    blockTypeList: [],
    tagBlocks: {},
    fillableTypes: [],
    blocks: [],
    deadline: '',
    deadlineTs: null,
    minDate: '',
    showDeadline: false,
    targetRoles: [],
    targetRolesText: '',
    targetRoleOptions: [],
    targetDepartments: [],
    targetDepartmentsText: '',
    departmentOptions: [],
    targetDepartmentOptions: [],
    hasFillable: false,
    isTargetOnlyVisible: false,
    showTargetRole: false,
    isAnonymous: false,
    maxSubmissions: 1,
    editorCtx: null,
    // 答题分数设置（仅 tag==='quiz' 时使用）
    quizScore: {
      scoreMode: 'total',
      totalScore: '100',
      totalAllocation: 'byQuestion',
      typeScores: { radio: '', checkbox: '', judge: '', textarea: '' },
      correctAnswerScores: {},
      showScore: false,
      wrongMode: 'zero',
      allowNegative: false,
      textareaMode: 'score'
    },
    scoreModeOptions: [
      { key: 'total', label: '总分制', desc: '设置总分，按题目或正确答案平均分配' },
      { key: 'byType', label: '题型赋分制', desc: '设置各题型（单选/多选/判断/简答）的分值' },
      { key: 'byCorrectAnswer', label: '正确答案赋分制', desc: '设置各正确答案的分值' }
    ],
    allocationOptions: [
      { key: 'byQuestion', label: '按题目平均分配' },
      { key: 'byCorrectAnswer', label: '按正确答案平均分配' }
    ],
    wrongModeOptions: [
      { key: 'zero', label: '整道题不得分' },
      { key: 'partial', label: '按回答中正确和错误选项算分' },
      { key: 'deduct', label: '整道题扣分' }
    ],
    textareaModeOptions: [
      { key: 'score', label: '填写即得分' },
      { key: 'ignore', label: '不计入总分数' }
    ],
    typeScoreItems: [],
    correctScoreItems: [],
    hasTextarea: false,
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
    publishing: false,
    guardReady: false
  },

  onLoad(options) {
    app.guardRegistered().then((user) => {
      if (!user) return
      this.setData({
        guardReady: true,
        minDate: utils.getLocalDateString()
      })
      this.checkPublishPermission(user)
      this.loadFormConstants()
      this.loadDepartmentOptions()
      this.loadRoleOptions()

      if (options.id) {
        this.setData({
          formId: options.id,
          isEdit: true
        })
        this.loadForm(options.id)
      } else {
        this.checkDraft()
      }
    })
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    this.setData({ themeClass: app.getThemeClass(), pageStyle: app.getPageStyle() })
    app.applySystemUITheme(app.globalData.theme)
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
  },

  /**
   * 检查发布权限（馆员 / 管理员），user 由守卫传入
   */
  checkPublishPermission(user) {
    const canPublish = !!user.isAdmin || user.role === '馆员'
    this.setData({
      canPublish
    })
    if (!canPublish) {
      wx.showModal({
        title: '提示',
        content: '仅馆员及授权人员可发布动态',
        showCancel: false,
        confirmText: '知道了',
        success: () => wx.navigateBack()
      })
    }
  },

  /**
   * 加载已有表单（编辑模式）
   */
  loadForm(formId) {
    wx.showLoading({
      title: '加载中...',
      mask: true
    })
    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: {
        action: 'get',
        params: {
          formId
        }
      }
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
        targetRolesText: (form.targetRoles || []).join('、'),
        targetRoleOptions: this.syncTargetRoleOptions(form.targetRoles || []),
        targetDepartments: form.targetDepartments || [],
        targetDepartmentsText: (form.targetDepartments || []).join('、'),
        targetDepartmentOptions: this.syncTargetDepartmentOptions(form.targetDepartments || []),
        isTargetOnlyVisible: !!form.isTargetOnlyVisible,
        showTargetRole: !!((form.targetRoles && form.targetRoles.length > 0) || (form.targetDepartments && form.targetDepartments.length > 0)),
        isAnonymous: !!form.isAnonymous,
        maxSubmissions: form.maxSubmissions || 1,
        quizScore: this.normalizeQuizScore(form.quizScore)
      })
      this.refreshHasFillable()
      this.refreshQuizDerived()
      // 富文本内容回填
      if (this.data.editorCtx && form.description) {
        this.data.editorCtx.setContents({
          html: form.description
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('加载表单失败:', err)
      utils.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
    })
  },

  /**
   * 检查本地草稿
   */
  checkDraft() {
    try {
      const draft = wx.getStorageSync(DRAFT_KEY)
      if (draft && draft.title) {
        this.setData({
          showDraftTip: true
        })
      }
    } catch (e) { }
  },

  /**
   * 恢复草稿
   */
  handleRestoreDraft() {
    try {
      const draft = wx.getStorageSync(DRAFT_KEY)
      if (!draft) {
        this.setData({
          showDraftTip: false
        })
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
        targetRolesText: (draft.targetRoles || []).join('、'),
        targetRoleOptions: this.syncTargetRoleOptions(draft.targetRoles || []),
        targetDepartments: draft.targetDepartments || [],
        targetDepartmentsText: (draft.targetDepartments || []).join('、'),
        targetDepartmentOptions: this.syncTargetDepartmentOptions(draft.targetDepartments || []),
        isTargetOnlyVisible: !!draft.isTargetOnlyVisible,
        showTargetRole: !!((draft.targetRoles && draft.targetRoles.length > 0) || (draft.targetDepartments && draft.targetDepartments.length > 0)),
        isAnonymous: !!draft.isAnonymous,
        maxSubmissions: draft.maxSubmissions || 1,
        quizScore: this.normalizeQuizScore(draft.quizScore),
        showDraftTip: false
      })
      this.refreshHasFillable()
      this.refreshQuizDerived()
      if (this.data.editorCtx && draft.description) {
        this.data.editorCtx.setContents({
          html: draft.description
        })
      }
      utils.showToast({
        title: '已恢复草稿',
        icon: 'success'
      })
    } catch (e) {
      this.setData({
        showDraftTip: false
      })
    }
  },

  /**
   * 放弃草稿
   */
  handleDiscardDraft() {
    this.setData({
      showDraftTip: false
    })
    try {
      wx.removeStorageSync(DRAFT_KEY)
    } catch (e) { }
  },

  onEditorReady() {
    const query = wx.createSelectorQuery()
    query.select('#editor').context(res => {
      this.setData({
        editorCtx: res.context
      })
      if (this.data.description && res.context) {
        res.context.setContents({
          html: this.data.description
        })
      }
    }).exec()
  },

  onEditorInput(e) {
    this.setData({
      description: e.detail.html
    })
  },

  onTitleInput(e) {
    this.setData({
      title: e.detail.value
    })
  },

  /**
   * 从缓存同步读取 form 常量（后端 sys_config 下发，经 app-constants-cache）
   * 读不到则为空，页面按空列表展示
   */
  loadFormConstants() {
    const tagList = getTagList()
    const allBlockTypeList = getBlockTypeList()
    const tagBlocks = getTagBlocks()
    const fillableTypes = getFillableTypes()
    this.setData({
      tagList,
      allBlockTypeList,
      tagBlocks,
      fillableTypes,
      blockTypeList: this.filterBlocksByTag(this.data.tag, allBlockTypeList, tagBlocks)
    })
  },

  /**
   * 根据 tag 过滤可用控件
   */
  filterBlocksByTag(tag, blockList, tagBlocks) {
    const allowed = tagBlocks[tag] || []
    return blockList.filter(b => allowed.indexOf(b.type) >= 0)
  },

  /**
   * 选择 tag
   */
  handleSelectTag(e) {
    const tag = e.currentTarget.dataset.tag
    if (!tag || tag === this.data.tag) return
    this.setData({
      tag,
      blockTypeList: this.filterBlocksByTag(tag, this.data.allBlockTypeList, this.data.tagBlocks)
    })
  },

  // ===== 答题分数设置（quiz） =====

  /**
   * 刷新答题分数设置的派生展示数据（题型列表、正确答案列表、是否含简答题）
   */
  refreshQuizDerived() {
    const blocks = this.data.blocks || []
    const quizScore = this.data.quizScore || {}

    const typeLabels = { radio: '单选题', checkbox: '多选题', judge: '判断题', textarea: '简答题' }
    const presentTypes = ['radio', 'checkbox', 'judge'].filter(t => blocks.some(b => b.type === t))
    // 简答题：当含简答题且「填写即得分」时，纳入题型分值
    if (quizScore.textareaMode === 'score' && blocks.some(b => b.type === 'textarea')) {
      presentTypes.push('textarea')
    }
    const typeScoreItems = presentTypes.map(t => ({
      type: t,
      label: typeLabels[t],
      score: quizScore.typeScores && quizScore.typeScores[t] !== undefined ? quizScore.typeScores[t] : ''
    }))

    const scoreMap = quizScore.correctAnswerScores || {}
    const correctScoreItems = []
    blocks.forEach(b => {
      if (!['radio', 'checkbox', 'judge'].includes(b.type)) return
      const corrects = b.type === 'checkbox'
        ? (Array.isArray(b.correctAnswers) ? b.correctAnswers : [])
        : (b.correctAnswers ? [b.correctAnswers] : [])
      corrects.forEach(ans => {
        const val = String(ans).trim()
        if (!val) return
        const key = `${b.id}::${val}`
        correctScoreItems.push({
          blockId: b.id,
          answer: val,
          title: b.title || b.type,
          key,
          score: scoreMap[key] !== undefined ? scoreMap[key] : ''
        })
      })
    })

    const hasTextarea = blocks.some(b => b.type === 'textarea')

    this.setData({
      typeScoreItems,
      correctScoreItems,
      hasTextarea
    })
  },

  /**
   * 规范化后端返回的 quizScore 为前端状态
   */
  normalizeQuizScore(q) {
    q = q || {}
    return {
      scoreMode: ['total', 'byType', 'byCorrectAnswer'].includes(q.scoreMode) ? q.scoreMode : 'total',
      totalScore: q.totalScore !== undefined ? String(q.totalScore) : '100',
      totalAllocation: q.totalAllocation === 'byCorrectAnswer' ? 'byCorrectAnswer' : 'byQuestion',
      typeScores: {
        radio: q.typeScores && q.typeScores.radio !== undefined ? String(q.typeScores.radio) : '',
        checkbox: q.typeScores && q.typeScores.checkbox !== undefined ? String(q.typeScores.checkbox) : '',
        judge: q.typeScores && q.typeScores.judge !== undefined ? String(q.typeScores.judge) : '',
        textarea: q.typeScores && q.typeScores.textarea !== undefined ? String(q.typeScores.textarea) : ''
      },
      correctAnswerScores: this.normalizeCorrectAnswerScores(q.correctAnswerScores),
      showScore: !!q.showScore,
      wrongMode: ['zero', 'partial', 'deduct'].includes(q.wrongMode) ? q.wrongMode : 'zero',
      allowNegative: !!q.allowNegative,
      textareaMode: q.textareaMode === 'ignore' ? 'ignore' : 'score'
    }
  },

  normalizeCorrectAnswerScores(arr) {
    const map = {}
    if (Array.isArray(arr)) {
      arr.forEach(x => {
        if (x && x.blockId && x.answer) {
          map[`${x.blockId}::${x.answer}`] = x.score !== undefined ? String(x.score) : ''
        }
      })
    }
    return map
  },

  /**
   * 构建可提交的 quizScore
   */
  buildQuizScore() {
    const q = this.data.quizScore || {}
    const scoreMode = q.scoreMode || 'total'
    const result = {
      scoreMode,
      showScore: !!q.showScore,
      wrongMode: q.wrongMode || 'zero',
      allowNegative: !!q.allowNegative,
      textareaMode: q.textareaMode || 'score'
    }
    if (scoreMode === 'total') {
      result.totalScore = Number(q.totalScore) || 100
      result.totalAllocation = q.totalAllocation || 'byQuestion'
    } else if (scoreMode === 'byType') {
      result.typeScores = {
        radio: Number(q.typeScores && q.typeScores.radio) || 0,
        checkbox: Number(q.typeScores && q.typeScores.checkbox) || 0,
        judge: Number(q.typeScores && q.typeScores.judge) || 0,
        textarea: Number(q.typeScores && q.typeScores.textarea) || 0
      }
    } else if (scoreMode === 'byCorrectAnswer') {
      result.correctAnswerScores = this.data.correctScoreItems.map(item => ({
        blockId: item.blockId,
        answer: item.answer,
        score: Number(item.score) || 0
      }))
    }
    return result
  },

  onScoreModeChange(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ 'quizScore.scoreMode': key })
  },

  onTotalScoreInput(e) {
    this.setData({ 'quizScore.totalScore': e.detail.value })
  },

  onAllocationChange(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ 'quizScore.totalAllocation': key })
  },

  onTypeScoreInput(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ [`quizScore.typeScores.${type}`]: e.detail.value })
  },

  onCorrectScoreInput(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.correctScoreItems[index]
    if (!item) return
    const val = e.detail.value
    this.setData({
      [`correctScoreItems[${index}].score`]: val,
      [`quizScore.correctAnswerScores.${item.key}`]: val
    })
  },

  onWrongModeChange(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ 'quizScore.wrongMode': key })
  },

  onShowScoreToggle() {
    this.setData({ 'quizScore.showScore': !this.data.quizScore.showScore })
  },

  onAllowNegativeToggle() {
    this.setData({ 'quizScore.allowNegative': !this.data.quizScore.allowNegative })
  },

  onTextareaModeChange(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ 'quizScore.textareaMode': key })
    // 简答题是否纳入题型分值依赖 textareaMode，需刷新题型分值列表
    this.refreshQuizDerived()
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
    this.syncEditingOptions()
  },

  /**
   * 关闭控件配置弹窗
   */
  closeBlockModal() {
    this._closeModal('showBlockModal', () => {
      this.setData({
        editingBlock: null,
        editingIndex: -1
      })
    })
  },

  stopPropagation() { },

  /**
   * 确认控件配置
   */
  handleConfirmBlock() {
    const block = this.data.editingBlock
    if (!block) return

    // 校验
    if (['radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity'].includes(block.type)) {
      if (!block.title || !block.title.trim()) {
        if (block.type === 'side_dish' || block.type === 'activity') {
          utils.showToast({
            title: '请输入标题',
            icon: 'none'
          })
          return
        } else {
          utils.showToast({
            title: '请输入题干',
            icon: 'none'
          })
          return
        }
      }
    }
    if (['radio', 'checkbox', 'judge'].includes(block.type)) {
      const options = (block.options || []).map(o => String(o).trim()).filter(o => o)
      if (options.length < 2) {
        utils.showToast({
          title: '至少填写 2 个选项',
          icon: 'none'
        })
        return
      }
      // 答题模式：必须标注正确答案
      if (this.data.tag === 'quiz') {
        const corrects = block.type === 'checkbox'
          ? (Array.isArray(block.correctAnswers) ? block.correctAnswers.map(a => String(a).trim()).filter(Boolean) : [])
          : (block.correctAnswers ? [String(block.correctAnswers).trim()] : [])
        if (corrects.length === 0) {
          utils.showToast({
            title: '请标注正确答案（点击选项左侧按钮）',
            icon: 'none'
          })
          return
        }
      }
    }
    if (block.type === 'side_dish') {
      const categories = (block.categories || []).map(c => ({
        ...c,
        name: String(c.name || '').trim()
      })).filter(c => c.name)
      if (categories.length === 0) {
        utils.showToast({
          title: '至少填写 1 个副食类别',
          icon: 'none'
        })
        return
      }
      for (const c of categories) {
        if (!c.maxCount || c.maxCount < 1) {
          utils.showToast({
            title: `类别「${c.name}」份数至少为 1`,
            icon: 'none'
          })
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

    this.setData({
      blocks
    })
    this.closeBlockModal()
    this.refreshHasFillable()
    this.refreshQuizDerived()

    // 清理 isNew 标记（动画结束后）
    setTimeout(() => {
      const clean = this.data.blocks.map(b => ({
        ...b,
        isNew: false
      }))
      this.setData({
        blocks: clean
      })
    }, 500)
  },

  // ===== 控件配置弹窗内操作 =====

  onBlockTitleInput(e) {
    this.setData({
      'editingBlock.title': e.detail.value
    })
  },

  onBlockRequiredToggle() {
    this.setData({
      'editingBlock.required': !this.data.editingBlock.required
    })
  },

  onOptionInput(e) {
    const index = e.currentTarget.dataset.index
    const block = this.data.editingBlock
    if (!block) return
    const oldVal = String((block.options || [])[index] || '')
    const newVal = e.detail.value
    const options = [...(block.options || [])]
    options[index] = newVal

    // 选项文本变更时，同步正确答案中的对应值
    let correctAnswers = block.correctAnswers
    if (block.type === 'checkbox') {
      const arr = Array.isArray(correctAnswers) ? [...correctAnswers] : []
      const ci = arr.indexOf(oldVal)
      if (ci >= 0) arr[ci] = newVal
      correctAnswers = arr
    } else {
      if (correctAnswers === oldVal) correctAnswers = newVal
    }

    this.setData({
      'editingBlock.options': options,
      'editingBlock.correctAnswers': correctAnswers
    })
    this.syncEditingOptions()
  },

  onAddOption() {
    const options = [...(this.data.editingBlock.options || []), '']
    this.setData({
      'editingBlock.options': options
    })
    this.syncEditingOptions()
  },

  onRemoveOption(e) {
    const index = e.currentTarget.dataset.index
    const block = this.data.editingBlock
    if (!block) return
    const options = [...(block.options || [])]
    const removed = options[index]
    options.splice(index, 1)

    // 删除选项时，同步移除正确答案
    let correctAnswers = block.correctAnswers
    if (block.type === 'checkbox') {
      const arr = Array.isArray(correctAnswers) ? [...correctAnswers] : []
      correctAnswers = arr.filter(a => a !== removed)
    } else {
      if (correctAnswers === removed) correctAnswers = ''
    }

    this.setData({
      'editingBlock.options': options,
      'editingBlock.correctAnswers': correctAnswers
    })
    this.syncEditingOptions()
  },

  /**
   * 切换正确答案标记（仅答题模式可点击）
   */
  onToggleCorrectAnswer(e) {
    if (this.data.tag !== 'quiz') return
    const index = e.currentTarget.dataset.index
    const block = this.data.editingBlock
    if (!block) return
    const opt = String((block.options || [])[index] || '').trim()
    if (!opt) {
      utils.showToast({ title: '请先填写选项内容', icon: 'none' })
      return
    }
    if (block.type === 'checkbox') {
      const arr = Array.isArray(block.correctAnswers) ? [...block.correctAnswers] : []
      const ci = arr.indexOf(opt)
      if (ci >= 0) arr.splice(ci, 1)
      else arr.push(opt)
      this.setData({ 'editingBlock.correctAnswers': arr })
    } else {
      const current = block.correctAnswers
      this.setData({ 'editingBlock.correctAnswers': current === opt ? '' : opt })
    }
    this.syncEditingOptions()
  },

  /**
   * 同步编辑弹窗中选择题的 optionItems（含 isCorrect 标记，供 WXML 展示）
   */
  syncEditingOptions() {
    const block = this.data.editingBlock
    if (!block || !['radio', 'checkbox', 'judge'].includes(block.type)) return
    const corrects = block.type === 'checkbox'
      ? (Array.isArray(block.correctAnswers) ? block.correctAnswers : [])
      : (block.correctAnswers ? [block.correctAnswers] : [])
    const optionItems = (block.options || []).map(opt => {
      const val = String(opt).trim()
      return {
        value: val,
        isCorrect: corrects.indexOf(val) >= 0
      }
    })
    this.setData({ 'editingBlock.optionItems': optionItems })
  },

  onCategoryNameInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      [`editingBlock.categories[${index}].name`]: e.detail.value
    })
  },

  onCategoryMaxInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      [`editingBlock.categories[${index}].maxCount`]: e.detail.value
    })
  },

  onAddCategory() {
    const categories = [...(this.data.editingBlock.categories || []), {
      id: genId('cat'),
      name: '',
      maxCount: 1
    }]
    this.setData({
      'editingBlock.categories': categories
    })
  },

  onRemoveCategory(e) {
    const index = e.currentTarget.dataset.index
    const categories = [...(this.data.editingBlock.categories || [])]
    categories.splice(index, 1)
    this.setData({
      'editingBlock.categories': categories
    })
  },

  onGroupInput(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      [`editingBlock.groups[${index}]`]: e.detail.value
    })
  },

  onAddGroup() {
    const groups = [...(this.data.editingBlock.groups || []), '']
    this.setData({
      'editingBlock.groups': groups
    })
  },

  onRemoveGroup(e) {
    const index = e.currentTarget.dataset.index
    const groups = [...(this.data.editingBlock.groups || [])]
    groups.splice(index, 1)
    this.setData({
      'editingBlock.groups': groups
    })
  },

  onMaxRegistrationsInput(e) {
    this.setData({
      'editingBlock.maxRegistrations': e.detail.value
    })
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
    const movingId = blocks[index].id;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]]

    const animBlocks = blocks.map(b => ({
      ...b,
      moveAnim: b.id === movingId ? dir : ''
    }))
    this.setData({
      blocks: animBlocks
    })

    // 动画结束后清除标记
    setTimeout(() => {
      this.setData({
        blocks: this.data.blocks.map(b => ({
          ...b,
          moveAnim: ''
        }))
      })
    }, 400)
  },

  /**
   * 删除控件（淡出动画后移除）
   */
  handleRemoveBlock(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (this.data.removingIndex >= 0) return
    this.setData({
      removingIndex: index
    })
    setTimeout(() => {
      const blocks = [...this.data.blocks]
      blocks.splice(index, 1)
      this.setData({
        blocks,
        removingIndex: -1
      })
      this.refreshHasFillable()
      this.refreshQuizDerived()
    }, 320)
  },

  // ===== 截止时间 =====

  handleToggleDeadline() {
    this.setData({
      showDeadline: !this.data.showDeadline
    })
    if (!this.data.showDeadline) {
      this.setData({
        deadline: '',
        deadlineTs: null
      })
    }
  },

  onDeadlineChange(e) {
    const detail = e.detail || {}
    let deadlineTs = null
    if (detail.year && detail.month) {
      deadlineTs = new Date(detail.year, detail.month - 1, detail.day, detail.hour || 0, detail.minute || 0, 0).getTime()
    }
    this.setData({
      deadline: detail.value || '',
      deadlineTs
    })
  },

  // ===== 目标角色 =====

  handleToggleTargetRole() {
    this.setData({
      showTargetRole: !this.data.showTargetRole
    })
    if (!this.data.showTargetRole) {
      this.setData({
        targetRoles: [],
        targetRolesText: '',
        targetRoleOptions: this.syncTargetRoleOptions([]),
        targetDepartments: [],
        targetDepartmentsText: '',
        targetDepartmentOptions: this.syncTargetDepartmentOptions([]),
        isTargetOnlyVisible: false
      })
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
    // 互斥：选择角色时清空部门
    this.setData({
      targetRoles,
      targetRolesText: targetRoles.join('、'),
      targetRoleOptions: this.syncTargetRoleOptions(targetRoles),
      targetDepartments: [],
      targetDepartmentsText: '',
      targetDepartmentOptions: this.syncTargetDepartmentOptions([])
    })
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

  /**
   * 加载角色选项（从常量读取，审核员 mock 下 ROLE_OPTIONS 为空 → 角色列表为空）
   */
  async loadRoleOptions() {
    try {
      const allConstants = await app.getAllConstants()
      const roles = allConstants.ROLE_OPTIONS || []
      this.setData({
        targetRoleOptions: roles.map(r => ({ value: r, checked: (this.data.targetRoles || []).indexOf(r) >= 0 }))
      })
    } catch (e) {
      console.warn('加载角色选项失败:', e)
    }
  },

  /**
   * 加载部门选项（排除「无」）
   */
  async loadDepartmentOptions() {
    try {
      const allConstants = await app.getAllConstants()
      const depts = (allConstants.DEPARTMENT_OPTIONS || []).filter(d => d !== '无')
      this.setData({
        departmentOptions: depts,
        targetDepartmentOptions: this.syncTargetDepartmentOptions(this.data.targetDepartments, depts)
      })
    } catch (e) {
      console.error('加载部门选项失败:', e)
    }
  },

  /**
   * 根据选中的部门列表，刷新部门选项的选中态
   */
  syncTargetDepartmentOptions(targetDepartments, depts) {
    const source = depts || this.data.departmentOptions
    return source.map(d => ({
      value: d,
      checked: (targetDepartments || []).indexOf(d) >= 0
    }))
  },

  /**
   * 切换部门（与角色互斥）
   */
  handleToggleDepartment(e) {
    const dept = e.currentTarget.dataset.dept
    let targetDepartments = [...this.data.targetDepartments]
    const idx = targetDepartments.indexOf(dept)
    if (idx >= 0) {
      targetDepartments.splice(idx, 1)
    } else {
      targetDepartments.push(dept)
    }
    // 互斥：选择部门时清空角色
    this.setData({
      targetDepartments,
      targetDepartmentsText: targetDepartments.join('、'),
      targetDepartmentOptions: this.syncTargetDepartmentOptions(targetDepartments),
      targetRoles: [],
      targetRolesText: '',
      targetRoleOptions: this.syncTargetRoleOptions([])
    })
  },

  /**
   * 刷新 hasFillable（是否含有需要填写的控件）
   */
  refreshHasFillable() {
    const hasFillable = this.data.blocks.some(b => (this.data.fillableTypes || []).includes(b.type))
    this.setData({ hasFillable })
  },

  onTargetOnlyVisibleToggle() {
    this.setData({
      isTargetOnlyVisible: !this.data.isTargetOnlyVisible
    })
  },

  // ===== 匿名填写 / 填写次数 =====

  onAnonymousToggle() {
    this.setData({
      isAnonymous: !this.data.isAnonymous
    })
  },

  onMaxSubmissionsMinus() {
    const val = Math.max(1, (this.data.maxSubmissions || 1) - 1)
    this.setData({
      maxSubmissions: val
    })
  },

  onMaxSubmissionsPlus() {
    const val = Math.min(99, (this.data.maxSubmissions || 1) + 1)
    this.setData({
      maxSubmissions: val
    })
  },

  // ===== 提交 =====

  /**
   * 构建表单数据
   */
  buildFormData() {
    const title = this.data.title.trim()
    const deadline = this.data.deadlineTs || null
    const blocks = this.data.blocks.map(stripBlock)
    const showTarget = this.data.showTargetRole
    const targetRoles = showTarget ? this.data.targetRoles : []
    const targetDepartments = showTarget ? this.data.targetDepartments : []
    let isTargetOnlyVisible = false
    if (this.data.hasFillable) {
      // 有填写控件：isTargetOnlyVisible 为独立子开关（表单仅对选中用户可见）
      isTargetOnlyVisible = showTarget && this.data.isTargetOnlyVisible
    } else {
      // 无填写控件：开关本身即「对部分用户可见」
      isTargetOnlyVisible = showTarget
    }
    return {
      title,
      description: this.data.description || '',
      tag: this.data.tag,
      deadline,
      blocks,
      targetRoles,
      targetDepartments,
      isTargetOnlyVisible,
      isAnonymous: this.data.tag === 'questionnaire' ? this.data.isAnonymous : false,
      maxSubmissions: this.data.tag === 'quiz' ? this.data.maxSubmissions : 1,
      quizScore: this.data.tag === 'quiz' ? this.buildQuizScore() : null
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
      utils.showToast({
        title: '暂存失败',
        icon: 'none'
      })
      return
    }

    this.setData({
      saving: true
    })
    utils.showToast({
      title: '已暂存到本地',
      icon: 'success'
    })
    setTimeout(() => this.setData({
      saving: false
    }), 400)
  },

  /**
   * 基础校验
   */
  validateBasic() {
    if (!this.data.canPublish) {
      wx.showModal({
        title: '提示',
        content: '仅馆员及授权人员可发布动态',
        showCancel: false,
        confirmText: '知道了'
      })
      return false
    }
    if (!this.data.title.trim()) {
      utils.showToast({
        title: '请输入标题',
        icon: 'none'
      })
      return false
    }
    return true
  },

  /**
   * 预览：跳转详情页渲染当前编辑内容（不保存、不提交）
   */
  handlePreview() {
    if (!this.data.title.trim()) {
      utils.showToast({ title: '请输入标题', icon: 'none' })
      return
    }
    const formData = this.buildFormData()
    const user = app.globalData.userProfile || {}
    app.globalData.previewForm = {
      title: formData.title,
      description: formData.description,
      tag: formData.tag,
      deadline: formData.deadline,
      blocks: formData.blocks,
      targetRoles: formData.targetRoles,
      targetDepartments: formData.targetDepartments,
      isAnonymous: formData.isAnonymous,
      maxSubmissions: formData.maxSubmissions,
      quizScore: formData.quizScore,
      createdByName: user.name || '预览'
    }

    // 显示「生成预览」loading 动画，稍作延迟后跳转
    wx.showLoading({ title: '生成预览', mask: true })
    setTimeout(() => {
      wx.hideLoading()
      wx.navigateTo({
        url: '/pages/office/form/form-detail/form-detail?preview=1'
      })
    }, 500)
  },

  /**
   * 发布
   */
  handlePublish() {
    if (this.data.publishing) return
    if (!this.validateBasic()) return

    const formData = this.buildFormData()

    // 无填写控件时：开启「对部分用户可见」但未选择任何角色/部门 → 提示
    if (!this.data.hasFillable && formData.isTargetOnlyVisible &&
      formData.targetRoles.length === 0 && formData.targetDepartments.length === 0) {
      utils.showToast({
        title: '请选择可见的用户范围',
        icon: 'none'
      })
      return
    }

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
    this.setData({
      publishing: true
    })
    wx.showLoading({
      title: '发布中...',
      mask: true
    })

    const action = this.data.isEdit ? 'update' : 'create'
    const payload = {
      action,
      params: this.data.isEdit ?
        {
          formId: this.data.formId,
          ...formData,
          status: 'published'
        } :
        {
          ...formData,
          status: 'published'
        }
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
      try {
        wx.removeStorageSync(DRAFT_KEY)
      } catch (e) { }
      utils.showToast({
        title: '发布成功',
        icon: 'success'
      })
      setTimeout(() => wx.navigateBack(), 600)
    }).catch(err => {
      wx.hideLoading()
      console.error('发布失败:', err)
      utils.showToast({
        title: err.message || '发布失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        publishing: false
      })
    })
  }
})