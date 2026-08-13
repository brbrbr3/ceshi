const app = getApp()
const utils = require('../../../common/utils.js')
const { getTagConfig } = require('../../../common/form-constants.js')

Page({
  data: {
    formId: '',
    form: null,
    blocks: [],
    tagLabel: '',
    tagIcon: '',
    tagColor: '',
    tagBg: '',
    timeText: '',
    mySubmission: null,
    isCreator: false,
    canPublish: false,
    isClosed: false,
    hasFillableBlocks: false,
    isAnonymous: false,
    maxSubmissions: 1,
    canSubmit: true,
    readonly: false,
    submitting: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ formId: options.id })
      this.loadForm(options.id)
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
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
      const { form, mySubmission, isCreator, canPublish, canSubmit } = result.data
      const tagCfg = getTagConfig(form.tag)
      const blocks = this.prepareBlocks(form.blocks || [], mySubmission)
      const hasFillableBlocks = blocks.some(b => ['radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity'].includes(b.type))

      this.setData({
        form,
        blocks,
        tagLabel: tagCfg.label,
        tagIcon: tagCfg.icon,
        tagColor: tagCfg.color,
        tagBg: tagCfg.bg,
        timeText: utils.formatDateTime(form.publishedAt || form.createdAt),
        mySubmission,
        isCreator,
        canPublish,
        isClosed: form.isClosed,
        hasFillableBlocks,
        isAnonymous: !!form.isAnonymous,
        maxSubmissions: form.maxSubmissions || 1,
        canSubmit: canSubmit !== false,
        readonly: form.isClosed || canSubmit === false
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('加载详情失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    })
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
        block.answer = answerMap[b.id] === '报名' ? '报名' : ''
        block.answerText = block.answer === '报名' ? '已报名' : '未报名'
      } else {
        block.answer = answerMap[b.id] !== undefined ? answerMap[b.id] : ''
        block.answerText = block.answer !== '' && block.answer !== null ? block.answer : '未填写'
      }
      return block
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
    const id = e.currentTarget.dataset.id
    const blocks = this.data.blocks
    const block = blocks.find(b => b.id === id)
    if (!block) return
    const newVal = block.answer === '报名' ? '' : '报名'
    this.updateBlockAnswer(id, newVal)
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

  // ===== 发布者入口 =====

  goEdit() {
    wx.navigateTo({
      url: `/pages/office/form-edit/form-edit?id=${this.data.formId}`
    })
  },

  goResult() {
    wx.navigateTo({
      url: `/pages/office/form-result/form-result?id=${this.data.formId}`
    })
  },

  goSubmissions() {
    wx.navigateTo({
      url: `/pages/office/form-submissions/form-submissions?id=${this.data.formId}`
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
