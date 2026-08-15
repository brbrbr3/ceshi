const app = getApp()
const utils = require('../../../../common/utils.js')
const { getTagConfig } = require('../../../../common/form-constants.js')

// 可评分选择题类型
function isScorableChoice(type) {
  return type === 'radio' || type === 'checkbox' || type === 'judge'
}

Page({
  data: {
    formId: '',
    form: null,
    blocks: [],
    tagLabel: '',
    tagIcon: '',
    tagColor: '',
    tagBg: '',
    score: { totalScore: 0, details: [] },
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ formId: options.id })
      this.loadCompare(options.id)
    } else {
      utils.showToast({ title: '参数缺失', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  loadCompare(formId) {
    wx.showLoading({ title: '加载中...', mask: true })
    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: { action: 'getQuizCompare', params: { formId } }
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '加载失败')
      }
      const { form, blocks, lastSubmission, score } = result.data
      const tagCfg = getTagConfig(form.tag)
      const compareBlocks = this.buildCompareBlocks(blocks, lastSubmission.answers, score.details)

      this.setData({
        form,
        blocks: compareBlocks,
        tagLabel: tagCfg.label,
        tagIcon: tagCfg.icon,
        tagColor: tagCfg.color,
        tagBg: tagCfg.bg,
        score,
        loading: false
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('加载答题对比失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  /**
   * 构建对比展示数据：每题附带正确答案、我的答案、对错、得分
   */
  buildCompareBlocks(blocks, answers, details) {
    const answerMap = {}
    ;(answers || []).forEach(a => { answerMap[a.blockId] = a.value })
    const detailMap = {}
    ;(details || []).forEach(d => { detailMap[d.blockId] = d })

    let fillIndex = 0
    return (blocks || []).map(b => {
      const detail = detailMap[b.id]
      const block = { ...b }

      if (isScorableChoice(b.type) || b.type === 'textarea') {
        fillIndex += 1
        block.fillIndex = fillIndex
      } else {
        block.fillIndex = null
      }

      if (isScorableChoice(b.type)) {
        // 正确答案数组
        block.correctList = b.type === 'checkbox'
          ? (Array.isArray(b.correctAnswers) ? b.correctAnswers : [b.correctAnswers].filter(Boolean))
          : (b.correctAnswers ? [b.correctAnswers] : [])
        // 我的答案数组
        const myVal = answerMap[b.id]
        block.myList = Array.isArray(myVal)
          ? myVal
          : (myVal !== undefined && myVal !== null && myVal !== '' ? [myVal] : [])
        // 每个选项标记：正确 / 我选
        block.optionItems = (b.options || []).map(opt => {
          const isCorrect = block.correctList.indexOf(opt) >= 0
          const isMine = block.myList.indexOf(opt) >= 0
          return { value: opt, isCorrect, isMine }
        })
        block.isCorrect = detail ? !!detail.correct : false
        block.scoreText = detail ? `${detail.score} / ${detail.fullScore} 分` : ''
      } else if (b.type === 'textarea') {
        block.myAnswer = answerMap[b.id] !== undefined ? answerMap[b.id] : ''
        block.isCorrect = detail ? !!detail.correct : false
        block.scoreText = detail ? `${detail.score} / ${detail.fullScore} 分` : ''
      }

      return block
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
