const app = getApp()
const utils = require('../../../../common/utils.js')

// 排序模式循环顺序与文案
const SORT_MODES = ['time', 'score', 'department']
const SORT_MODE_TEXT = {
  time: '按提交时间',
  score: '按分数',
  department: '按部门分组'
}

Page({
  data: {
    formId: '',
    title: '',
    tag: '',
    isQuiz: false,
    list: [],
    displayList: [],
    sortMode: 'time',
    sortModeText: '按提交时间',
    filterMode: 'all',
    maxSubmissions: 1,
    loading: true,
    exporting: false,
    allExpanded: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ formId: options.id })
      this.loadSubmissions(options.id)
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  loadSubmissions(formId) {
    wx.showLoading({ title: '加载中...', mask: true })
    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: { action: 'listSubmissions', params: { formId } }
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '加载失败')
      }
      const form = result.data.form || {}
      const blocks = form.blocks || []
      const isQuiz = form.tag === 'quiz'
      const list = (result.data.list || []).map(s => this.formatSubmission(s, blocks, isQuiz))
      this.setData({
        title: form.title || '',
        tag: form.tag || '',
        isQuiz,
        maxSubmissions: Math.max(1, Number(form.maxSubmissions) || 1),
        list,
        sortMode: 'time',
        sortModeText: '按提交时间',
        filterMode: 'all',
        loading: false
      })
      this.applySort()
    }).catch(err => {
      wx.hideLoading()
      console.error('加载提交明细失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  /**
   * 格式化单条提交记录
   */
  formatSubmission(s, blocks, isQuiz) {
    const scoreDetailMap = {}
    let scoreTotal = 0
    if (isQuiz && s.score) {
      scoreTotal = s.score.totalScore || 0
      ;(s.score.details || []).forEach(d => { scoreDetailMap[d.blockId] = d })
    }
    const answerDetails = (s.answers || []).map((a, idx) => {
      const block = blocks.find(b => b.id === a.blockId)
      const sd = scoreDetailMap[a.blockId]
      return {
        blockId: a.blockId,
        index: idx + 1,
        title: block ? block.title : a.blockId,
        type: a.type,
        valueText: this.formatValue(a.type, a.value),
        scoreText: sd ? `${sd.score} / ${sd.fullScore} 分` : '',
        isCorrect: sd ? !!sd.correct : null
      }
    })
    return {
      ...s,
      key: s._id,
      timeText: utils.formatDateTime(s.submittedAt),
      department: s.department || '',
      answerDetails,
      scoreTotal,
      expanded: false
    }
  },

  /**
   * 根据当前排序模式重排列表并生成展示列表
   */
  applySort() {
    let list = [...this.data.list]
    const sortMode = this.data.sortMode
    const filterMode = this.data.filterMode

    // 只留最高成绩：每个用户仅保留得分最高的一条提交
    if (filterMode === 'highest') {
      const bestMap = {}
      list.forEach(item => {
        const key = item._openid || item.openid || item.userName || item._id
        if (!bestMap[key] || (item.scoreTotal || 0) > (bestMap[key].scoreTotal || 0)) {
          bestMap[key] = item
        }
      })
      list = Object.values(bestMap)
    }

    let displayList = []

    if (sortMode === 'score') {
      // 按分数从高到低
      list.sort((a, b) => (b.scoreTotal || 0) - (a.scoreTotal || 0))
      displayList = list
    } else if (sortMode === 'department') {
      // 按部门分组，组内按分数从高到低
      const groups = {}
      const order = []
      list.forEach(item => {
        const dept = item.department || '未分配部门'
        if (!groups[dept]) { groups[dept] = []; order.push(dept) }
        groups[dept].push(item)
      })
      order.forEach(dept => {
        groups[dept].sort((a, b) => (b.scoreTotal || 0) - (a.scoreTotal || 0))
        displayList.push({ key: `g_${dept}`, isGroup: true, name: dept, count: groups[dept].length })
        displayList = displayList.concat(groups[dept])
      })
    } else {
      // 按提交时间从早到晚
      list.sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
      displayList = list
    }

    this.setData({ displayList, sortModeText: SORT_MODE_TEXT[sortMode] || '按提交时间' })
  },

  /**
   * 根据类型格式化答案值
   */
  formatValue(type, value) {
    if (type === 'checkbox') {
      return (value || []).join('、')
    }
    if (type === 'side_dish') {
      return (value || []).map(v => `${v.categoryName}×${v.count}`).join('、')
    }
    if (type === 'activity') {
      if (value === '报名') return '已报名'
      if (Array.isArray(value)) return value.filter(Boolean).join('、')
    }
    return value === undefined || value === null || value === '' ? '（空）' : value
  },

  /**
   * 展开/收起答案明细
   */
  handleToggleExpand(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const list = this.data.list.map(item => item._id === id ? { ...item, expanded: !item.expanded } : item)
    this.setData({ list })
    this.applySort()
  },

  /**
   * 全部展开 / 全部收起
   */
  handleToggleAll() {
    const allExpanded = !this.data.allExpanded
    const list = this.data.list.map(item => ({ ...item, expanded: allExpanded }))
    this.setData({ list, allExpanded })
    this.applySort()
  },

  /**
   * 循环切换排序方式（答题表单）：时间 → 分数 → 部门 → 时间
   */
  onSortToggle() {
    const idx = SORT_MODES.indexOf(this.data.sortMode)
    const next = SORT_MODES[(idx + 1) % SORT_MODES.length]
    this.setData({ sortMode: next })
    this.applySort()
  },

  /**
   * 切换筛选模式（不筛选 / 只留最高成绩）
   */
  onFilterToggle() {
    const filterMode = this.data.filterMode === 'highest' ? 'all' : 'highest'
    this.setData({ filterMode })
    this.applySort()
  },

  /**
   * 导出副食订购清单 PDF
   */
  handleExportPdf() {
    if (this.data.exporting) return
    if (!this.data.formId) return

    this.setData({ exporting: true })
    wx.showLoading({ title: '生成PDF...', mask: true })

    wx.cloud.callFunction({
      name: 'generateOrderPdf',
      data: { type: 'contentFormSideDish', formId: this.data.formId }
    }).then(async res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '生成失败')
      }
      const { fileUrl, fileName } = result.data || {}
      if (!fileUrl) {
        throw new Error('导出地址为空')
      }

      // 下载并打开 PDF
      wx.showLoading({ title: '正在打开...', mask: true })
      const downloadResult = await new Promise((resolve, reject) => {
        wx.downloadFile({ url: fileUrl, success: resolve, fail: reject })
      })
      wx.hideLoading()

      if (downloadResult.statusCode === 200) {
        wx.openDocument({
          filePath: downloadResult.tempFilePath,
          fileType: 'pdf',
          showMenu: true,
          fail: () => utils.showToast({ title: '打开文件失败', icon: 'none' })
        })
      } else {
        utils.showToast({ title: '下载文件失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('导出PDF失败:', err)
      utils.showToast({ title: err.message || '导出失败', icon: 'none' })
    }).finally(() => {
      this.setData({ exporting: false })
    })
  }
})
