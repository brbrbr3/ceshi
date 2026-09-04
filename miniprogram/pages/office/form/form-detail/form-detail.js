const app = getApp()
const utils = require('../../../../common/utils.js')
const { getTagConfig } = require('../../../../common/form-constants.js')
const modalAnimation = require('../../../../behaviors/modalAnimation.js')

// ===== 答题分值计算（与云函数 contentFormManager 保持一致，仅用于预览模式） =====
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function isScorableChoice(type) {
  return type === 'radio' || type === 'checkbox' || type === 'judge'
}

function getCorrectAnswers(block) {
  if (block.type === 'checkbox') {
    if (Array.isArray(block.correctAnswers)) return block.correctAnswers.map(a => String(a).trim()).filter(Boolean)
    return block.correctAnswers ? [String(block.correctAnswers).trim()] : []
  }
  return block.correctAnswers ? [String(block.correctAnswers).trim()] : []
}

/**
 * 把纯文本中的 http/https 链接自动转成 <a> 标签
 * （editor 录入的是纯文本网址，需转成链接才能渲染）
 */
function autoLinkify(html) {
  if (!html) return html
  const protectedTags = []
  html = html.replace(/<(img|a)\b[^>]*>/gi, (m) => {
    protectedTags.push(m)
    return `\u0000${protectedTags.length - 1}\u0000`
  })
  html = html.replace(/(https?:\/\/[^\s<>"'&]+)/g, '<a href="$1">$1</a>')
  html = html.replace(/\u0000(\d+)\u0000/g, (m, i) => protectedTags[Number(i)])
  return html
}

function calcFullScores(quizScore, blocks) {
  const qs = quizScore || {}
  const scoreMode = qs.scoreMode || 'total'
  const textareaMode = qs.textareaMode || 'ignore'
  const choiceBlocks = (blocks || []).filter(b => isScorableChoice(b.type))
  const textareaBlocks = (blocks || []).filter(b => b.type === 'textarea')
  const full = {}

  if (scoreMode === 'total') {
    const totalScore = Number(qs.totalScore) || 100
    const allocation = qs.totalAllocation || 'byQuestion'
    if (allocation === 'byCorrectAnswer') {
      let totalCorrect = 0
      choiceBlocks.forEach(b => { totalCorrect += getCorrectAnswers(b).length })
      if (totalCorrect > 0) {
        const perCorrect = totalScore / totalCorrect
        choiceBlocks.forEach(b => { full[b.id] = round2(getCorrectAnswers(b).length * perCorrect) })
      } else {
        const per = totalScore / Math.max(1, choiceBlocks.length)
        choiceBlocks.forEach(b => { full[b.id] = round2(per) })
      }
      if (textareaMode === 'score') {
        const per = totalScore / Math.max(1, choiceBlocks.length + textareaBlocks.length)
        textareaBlocks.forEach(b => { full[b.id] = round2(per) })
      }
    } else {
      const scoredCount = choiceBlocks.length + (textareaMode === 'score' ? textareaBlocks.length : 0)
      const per = totalScore / Math.max(1, scoredCount)
      choiceBlocks.forEach(b => { full[b.id] = round2(per) })
      if (textareaMode === 'score') {
        textareaBlocks.forEach(b => { full[b.id] = round2(per) })
      }
    }
  } else if (scoreMode === 'byType') {
    const typeScores = qs.typeScores || {}
    choiceBlocks.forEach(b => { full[b.id] = round2(Number(typeScores[b.type]) || 0) })
    if (textareaMode === 'score' && textareaBlocks.length > 0) {
      // 简答题分值：优先使用用户填写的 typeScores.textarea，否则回退到题型平均值
      let textareaScore = Number(typeScores.textarea) || 0
      if (!textareaScore) {
        const vals = ['radio', 'checkbox', 'judge'].map(t => Number(typeScores[t]) || 0).filter(v => v > 0)
        textareaScore = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      }
      textareaBlocks.forEach(b => { full[b.id] = round2(textareaScore) })
    }
  } else if (scoreMode === 'byCorrectAnswer') {
    const scores = Array.isArray(qs.correctAnswerScores) ? qs.correctAnswerScores : []
    choiceBlocks.forEach(b => {
      const sum = scores.filter(x => x && x.blockId === b.id).reduce((a, x) => a + (Number(x.score) || 0), 0)
      full[b.id] = round2(sum)
    })
    if (textareaMode === 'score' && textareaBlocks.length > 0) {
      const all = scores.map(x => Number(x && x.score) || 0).filter(v => v > 0)
      const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0
      textareaBlocks.forEach(b => { full[b.id] = round2(avg) })
    }
  }

  return full
}

Page({
  behaviors: [modalAnimation],

  data: {
    formId: '',
    form: null,
    blocks: [],
    tagLabel: '',
    tagIcon: '',
    tagColor: '',
    tagBg: '',
    timeText: '',
    deadlineText: '',
    mySubmission: null,
    isCreator: false,
    canPublish: false,
    isClosed: false,
    hasFillableBlocks: false,
    isAnonymous: false,
    maxSubmissions: 1,
    canSubmit: true,
    readonly: false,
    isPreview: false,
    submitting: false,
    isQuiz: false,
    quizResult: null,
    quizAnswering: false,
    registerModal: { show: false, blockId: '', input: '', names: [] }
  },

  onLoad(options) {
    if (options.preview === '1') {
      this.loadPreview()
    } else if (options.id) {
      this.setData({ formId: options.id })
      this.loadForm(options.id)
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    this.setData({ themeClass: app.getThemeClass(), pageStyle: app.getPageStyle() })
    app.applySystemUITheme(app.globalData.theme)
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
    // 编辑返回后刷新（首次进入不重复加载）
    if (this.data.formId && !this.data.isPreview) {
      if (this._loaded) {
        this.loadForm(this.data.formId)
      } else {
        this._loaded = true
      }
    }
  },

  /**
   * 预览模式：读取编辑页传入的本地数据直接渲染，不调云函数
   */
  loadPreview() {
    const data = app.globalData.previewForm
    if (!data) {
      utils.showToast({ title: '预览数据不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    const form = {
      _id: '',
      title: data.title || '',
      description: data.description || '',
      tag: data.tag || 'announcement',
      deadline: data.deadline || null,
      blocks: data.blocks || [],
      targetRoles: data.targetRoles || [],
      isTargetOnlyVisible: false,
      isAnonymous: !!data.isAnonymous,
      maxSubmissions: data.maxSubmissions || 1,
      status: 'published',
      publishedAt: Date.now(),
      createdAt: Date.now(),
      createdByName: data.createdByName || '预览',
      submissionCount: 0,
      readCount: 0,
      isClosed: false,
      quizScore: data.quizScore || null
    }
    form.description = autoLinkify(form.description || '')
    const tagCfg = getTagConfig(form.tag)
    let blocks = this.prepareBlocks(form.blocks || [], null)
    blocks = this.applyScoreText(blocks, form.quizScore)
    const hasFillableBlocks = blocks.some(b => ['radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity'].includes(b.type))

    this.setData({
      form,
      blocks,
      tagLabel: tagCfg.label,
      tagIcon: tagCfg.icon,
      tagColor: tagCfg.color,
      tagBg: tagCfg.bg,
      timeText: '预览模式',
      deadlineText: form.deadline ? utils.formatDateTime(form.deadline) : '',
      mySubmission: null,
      isCreator: false,
      canPublish: false,
      isClosed: false,
      hasFillableBlocks,
      isAnonymous: !!data.isAnonymous,
      maxSubmissions: data.maxSubmissions || 1,
      canSubmit: true,
      readonly: false,
      isPreview: true
    })
  },

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
      const { form, mySubmission, isCreator, canPublish, canSubmit, quizResult } = result.data
      form.description = autoLinkify(form.description || '')
      const tagCfg = getTagConfig(form.tag)
      const isQuiz = form.tag === 'quiz'
      const blocks = this.prepareBlocks(form.blocks || [], mySubmission)
      const hasFillableBlocks = blocks.some(b => ['radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity'].includes(b.type))

      // 答题表单已提交时默认只读展示（最后一次作答），点击「再次答题」后才解锁
      const quizSubmitted = isQuiz && !!mySubmission
      const readonly = form.isClosed || canSubmit === false || quizSubmitted

      this.setData({
        form,
        blocks,
        tagLabel: tagCfg.label,
        tagIcon: tagCfg.icon,
        tagColor: tagCfg.color,
        tagBg: tagCfg.bg,
        timeText: utils.formatDateTime(form.publishedAt || form.createdAt),
        deadlineText: form.deadline ? utils.formatDateTime(form.deadline) : '',
        mySubmission,
        isCreator,
        canPublish,
        isClosed: form.isClosed,
        hasFillableBlocks,
        isAnonymous: !!form.isAnonymous,
        maxSubmissions: form.maxSubmissions || 1,
        canSubmit: canSubmit !== false,
        isQuiz,
        quizResult: quizResult || null,
        quizAnswering: false,
        readonly
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('加载详情失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    })
  },

  /**
   * 富文本链接点击：复制到剪贴板
   */
  onLinkTap(e) {
    const href = e.detail && e.detail.href
    if (!href) return
    wx.setClipboardData({ data: href })
  },

  /**
   * 预处理 blocks：为每个控件附加 answer 字段（回填我的提交）
   */
  prepareBlocks(rawBlocks, mySubmission) {
    const answerMap = {}
    if (mySubmission && Array.isArray(mySubmission.answers)) {
      mySubmission.answers.forEach(a => { answerMap[a.blockId] = a.value })
    }

    const FILLABLE_TYPES = ['radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity']
    let fillCounter = 0

    return (rawBlocks || []).map(b => {
      const block = { ...b }
      // 连续编号：仅填写类控件编号，text 说明块不编号（分节用）
      if (FILLABLE_TYPES.includes(b.type)) {
        fillCounter += 1
        block.fillIndex = fillCounter
      } else {
        block.fillIndex = null
      }
      if (b.type === 'activity' && !Array.isArray(b.groups)) {
        block.groups = []
      }
      if (b.type === 'activity') {
        const regCount = b.registrationCount || 0
        block.activityMetaText = b.maxRegistrations
          ? `已报名 ${regCount} 人 · 上限 ${b.maxRegistrations} 人`
          : `已报名 ${regCount} 人`
        block.isFull = b.maxRegistrations ? regCount >= b.maxRegistrations : false
      }
      if (b.type === 'side_dish') {
        const countMap = {}
        const answer = answerMap[b.id]
        if (Array.isArray(answer)) {
          answer.forEach(item => { countMap[item.categoryId] = item.count })
        }
        block.categories = (b.categories || []).map(c => ({ ...c, count: countMap[c.id] || 0 }))
        const items = block.categories.filter(c => (c.count || 0) > 0).map(c => `${c.name}×${c.count}`)
        block.answerText = items.length > 0 ? items.join('、') : '未填写'
      } else if (b.type === 'checkbox') {
        block.answer = Array.isArray(answerMap[b.id]) ? answerMap[b.id] : []
        block.answerText = block.answer.length > 0 ? block.answer.join('、') : '未填写'
        // 预计算每个选项的选中态（WXML 不支持 indexOf 方法调用）
        block.optionItems = (b.options || []).map(opt => ({
          value: opt,
          checked: block.answer.indexOf(opt) >= 0
        }))
      } else if (b.type === 'activity' && !(b.groups && b.groups.length > 0)) {
        const myVal = answerMap[b.id]
        if (Array.isArray(myVal)) {
          block.answer = myVal.filter(Boolean)
        } else if (myVal && myVal !== '报名') {
          block.answer = [myVal]
        } else if (myVal === '报名' && mySubmission && mySubmission.userName) {
          block.answer = [mySubmission.userName] // 兼容旧数据
        } else {
          block.answer = []
        }
        block.answerText = block.answer.length > 0 ? block.answer.join('、') : '未报名'
      } else {
        block.answer = answerMap[b.id] !== undefined ? answerMap[b.id] : ''
        block.answerText = block.answer !== '' && block.answer !== null ? block.answer : '未填写'
      }
      return block
    })
  },

  /**
   * 答题表单：showScore 开启时为题干注入分值文本（预览模式前端计算）
   */
  applyScoreText(blocks, quizScore) {
    if (!quizScore || !quizScore.showScore) return blocks
    const full = calcFullScores(quizScore, blocks)
    return blocks.map(b => {
      const fs = full[b.id]
      if (fs !== undefined && (isScorableChoice(b.type) || b.type === 'textarea')) {
        return { ...b, scoreText: `${fs} 分` }
      }
      return b
    })
  },

  // ===== 填写事件 =====

  /**
   * 选择题选项点击（单选/多选/判断/活动分组）
   */
  onOptionTap(e) {
    if (this.data.readonly) return
    const id = e.currentTarget.dataset.id
    const value = e.currentTarget.dataset.value
    const block = this.data.blocks.find(b => b.id === id)
    if (!block) return

    if (block.type === 'checkbox') {
      const answer = Array.isArray(block.answer) ? [...block.answer] : []
      const idx = answer.indexOf(value)
      if (idx >= 0) {
        answer.splice(idx, 1)
      } else {
        answer.push(value)
      }
      // 同步更新 optionItems 的选中态（WXML 不支持 indexOf 方法调用）
      const optionItems = (block.options || []).map(opt => ({
        value: opt,
        checked: answer.indexOf(opt) >= 0
      }))
      const blocks = this.data.blocks.map(b => b.id === id ? { ...b, answer, optionItems } : b)
      this.setData({ blocks })
    } else {
      this.updateBlockAnswer(id, value)
    }
  },

  onTextareaInput(e) {
    const id = e.currentTarget.dataset.id
    this.updateBlockAnswer(id, e.detail.value)
  },

  onActivityRegisterToggle(e) {
    if (this.data.readonly) return
    const id = e.currentTarget.dataset.id
    const block = this.data.blocks.find(b => b.id === id)
    if (!block) return
    const names = Array.isArray(block.answer) ? [...block.answer] : []
    // 人数已满且本人未报名 → 禁止报名
    if (block.isFull && names.length === 0) {
      utils.showToast({ title: '人数已满，无法报名', icon: 'none' })
      return
    }
    // 首次报名预填本人姓名；继续添加时输入框置空，便于输入他人
    const myName = names.length === 0 ? ((app.globalData.userProfile || {}).name || '') : ''
    this.setData({
      registerModal: { show: true, blockId: id, input: myName, names }
    })
  },

  onRegisterInput(e) {
    this.setData({ 'registerModal.input': e.detail.value })
  },

  onAddRegisterName() {
    const { input, names } = this.data.registerModal
    const name = (input || '').trim()
    if (!name) {
      utils.showToast({ title: '请输入报名人姓名', icon: 'none' })
      return
    }
    if (names.indexOf(name) >= 0) {
      utils.showToast({ title: '该报名人已添加', icon: 'none' })
      return
    }
    this.setData({
      'registerModal.names': [...names, name],
      'registerModal.input': ''
    })
  },

  onRemoveRegisterName(e) {
    const index = e.currentTarget.dataset.index
    const names = [...this.data.registerModal.names]
    names.splice(index, 1)
    this.setData({ 'registerModal.names': names })
  },

  confirmRegisterModal() {
    const { blockId, input, names } = this.data.registerModal
    // 输入框还有未确认的姓名时，先加入
    const name = (input || '').trim()
    let finalNames = names
    if (name && names.indexOf(name) < 0) {
      finalNames = [...names, name]
    }
    if (finalNames.length === 0) {
      utils.showToast({ title: '请至少添加一位报名人', icon: 'none' })
      return
    }
    const blocks = this.data.blocks.map(b => b.id === blockId ? { ...b, answer: finalNames, answerText: finalNames.join('、') } : b)
    this.setData({ blocks })
    this._closeModal('registerModal.show', () => {
      this.setData({ 'registerModal.blockId': '', 'registerModal.input': '', 'registerModal.names': [] })
    })
  },

  closeRegisterModal() {
    this._closeModal('registerModal.show', () => {
      this.setData({ 'registerModal.blockId': '', 'registerModal.input': '', 'registerModal.names': [] })
    })
  },

  onSideDishCountChange(e) {
    const id = e.currentTarget.dataset.id
    const catId = e.currentTarget.dataset.catId
    const delta = Number(e.currentTarget.dataset.delta)
    const blocks = this.data.blocks.map(b => {
      if (b.id !== id) return b
      const categories = (b.categories || []).map(c => {
        if (c.id !== catId) return c
        let count = (c.count || 0) + delta
        if (count < 0) count = 0
        if (count > c.maxCount * 2) count = c.maxCount * 2
        return { ...c, count }
      })
      return { ...b, categories }
    })
    this.setData({ blocks })
  },

  updateBlockAnswer(blockId, value) {
    const blocks = this.data.blocks.map(b => b.id === blockId ? { ...b, answer: value } : b)
    this.setData({ blocks })
  },

  // ===== 提交 =====

  buildAnswers() {
    const answers = []
    this.data.blocks.forEach(b => {
      if (b.type === 'text') return
      if (b.type === 'side_dish') {
        const items = (b.categories || [])
          .filter(c => (c.count || 0) > 0)
          .map(c => ({ categoryId: c.id, categoryName: c.name, count: c.count }))
        if (items.length > 0) {
          answers.push({ blockId: b.id, type: b.type, value: items })
        }
      } else if (b.type === 'checkbox') {
        if (Array.isArray(b.answer) && b.answer.length > 0) {
          answers.push({ blockId: b.id, type: b.type, value: b.answer })
        }
      } else if (b.type === 'activity' && !(b.groups && b.groups.length > 0)) {
        if (Array.isArray(b.answer) && b.answer.length > 0) {
          answers.push({ blockId: b.id, type: b.type, value: b.answer })
        }
      } else {
        if (b.answer !== '' && b.answer !== undefined && b.answer !== null) {
          answers.push({ blockId: b.id, type: b.type, value: b.answer })
        }
      }
    })
    return answers
  },

  validateRequired() {
    for (const b of this.data.blocks) {
      if (b.type === 'text' || !b.required) continue
      let empty = false
      if (b.type === 'side_dish') {
        empty = !(b.categories || []).some(c => (c.count || 0) > 0)
      } else if (b.type === 'checkbox') {
        empty = !(Array.isArray(b.answer) && b.answer.length > 0)
      } else if (b.type === 'activity' && !(b.groups && b.groups.length > 0)) {
        empty = !(Array.isArray(b.answer) && b.answer.length > 0)
      } else {
        empty = b.answer === '' || b.answer === undefined || b.answer === null
      }
      if (empty) {
        utils.showToast({ title: `请填写「${b.title || b.type}」`, icon: 'none' })
        return false
      }
    }
    return true
  },

  handleSubmit() {
    if (this.data.submitting) return
    if (this.data.isClosed) {
      utils.showToast({ title: '该信息已截止', icon: 'none' })
      return
    }
    if (!this.validateRequired()) return

    const answers = this.buildAnswers()
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })

    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: {
        action: 'submit',
        params: { formId: this.data.formId, answers }
      }
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '提交失败')
      }
      utils.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => this.loadForm(this.data.formId), 500)
    }).catch(err => {
      wx.hideLoading()
      console.error('提交失败:', err)
      utils.showToast({ title: err.message || '提交失败', icon: 'none' })
    }).finally(() => {
      this.setData({ submitting: false })
    })
  },

  handleCancelSubmit() {
    wx.showModal({
      title: '取消提交',
      content: '确定取消本次提交吗？',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })
        wx.cloud.callFunction({
          name: 'contentFormManager',
          data: { action: 'cancelSubmit', params: { formId: this.data.formId } }
        }).then(res => {
          wx.hideLoading()
          const result = res.result || {}
          if (result.code !== 0) {
            throw new Error(result.message || '操作失败')
          }
          utils.showToast({ title: '已取消提交', icon: 'success' })
          setTimeout(() => this.loadForm(this.data.formId), 500)
        }).catch(err => {
          wx.hideLoading()
          utils.showToast({ title: err.message || '操作失败', icon: 'none' })
        })
      }
    })
  },

  // ===== 答题类型交互 =====

  /**
   * 清空答题表单的所有已填答案（用于「再次答题」）
   */
  resetQuizAnswers() {
    const blocks = this.data.blocks.map(b => {
      const block = { ...b }
      if (block.type === 'checkbox') {
        block.answer = []
        block.optionItems = (block.options || []).map(opt => ({ value: opt, checked: false }))
      } else if (block.type === 'side_dish') {
        block.categories = (block.categories || []).map(c => ({ ...c, count: 0 }))
      } else if (block.type === 'radio' || block.type === 'judge' || block.type === 'textarea' || block.type === 'activity') {
        block.answer = ''
      }
      return block
    })
    this.setData({ blocks })
  },

  /**
   * 再次答题：清空表单并解锁进入可编辑态
   */
  handleQuizRetry() {
    this.resetQuizAnswers()
    this.setData({ quizAnswering: true, readonly: false })
  },

  /**
   * 放弃重答：恢复只读展示最后一次作答
   */
  handleQuizCancelRetry() {
    this.loadForm(this.data.formId)
  },

  /**
   * 查看正确答案（跳转对比页）
   */
  handleQuizViewAnswers() {
    wx.navigateTo({
      url: `/pages/office/form/form-compare/form-compare?id=${this.data.formId}`
    })
  },

  // ===== 发布者入口 =====

  goEdit() {
    wx.navigateTo({
      url: `/pages/office/form/form-edit/form-edit?id=${this.data.formId}`
    })
  },

  goResult() {
    wx.navigateTo({
      url: `/pages/office/form/form-result/form-result?id=${this.data.formId}`
    })
  },

  goSubmissions() {
    wx.navigateTo({
      url: `/pages/office/form/form-submissions/form-submissions?id=${this.data.formId}`
    })
  },

  /**
   * 删除信息（仅创建者）
   */
  handleDelete() {
    wx.showModal({
      title: '删除信息',
      content: '删除后不可恢复，该信息的所有填报记录也将一并删除。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#DC2626',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        wx.cloud.callFunction({
          name: 'contentFormManager',
          data: { action: 'delete', params: { formId: this.data.formId } }
        }).then(res => {
          wx.hideLoading()
          const result = res.result || {}
          if (result.code !== 0) {
            throw new Error(result.message || '删除失败')
          }
          utils.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 600)
        }).catch(err => {
          wx.hideLoading()
          console.error('删除失败:', err)
          utils.showToast({ title: err.message || '删除失败', icon: 'none' })
        })
      }
    })
  }
})
