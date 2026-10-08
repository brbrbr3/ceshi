const app = getApp()
const utils = require('../../../../common/utils.js')

// 排序模式循环顺序与文案
const SORT_MODES = ['time', 'score', 'department']
// 无分数表单（副食等）：只在「按提交时间 / 按部门分组」之间循环，不出现「按分数」
const SORT_MODES_NO_SCORE = ['department', 'time']
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
    showSortToggle: false, // 排序按钮是否显示（答题 / 副食）
    departmentOrder: [],   // sys_config.DEPARTMENT_OPTIONS：部门分组的先后顺序
    filterMode: 'all',
    maxSubmissions: 1,
    loading: true,
    exporting: false,
    allExpanded: false,
    guardReady: false
  },

  onLoad(options) {
    app.guardRegistered().then((user) => {
      if (!user) return
      this.setData({ guardReady: true })
      if (options.id) {
        this.setData({ formId: options.id })
        this.loadSubmissions(options.id)
      }
    })
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    this.setData({ themeClass: app.getThemeClass(), pageStyle: app.getPageStyle() })
    app.applySystemUITheme(app.globalData.theme)
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  loadSubmissions(formId) {
    wx.showLoading({ title: '加载中...', mask: true })
    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: { action: 'listSubmissions', params: { formId } }
    }).then(async res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '加载失败')
      }
      const form = result.data.form || {}
      const blocks = form.blocks || []
      const isQuiz = form.tag === 'quiz'
      const isSideDish = form.tag === 'side_dish'
      const showSortToggle = isQuiz || isSideDish
      // 有排序按钮的表单（答题 / 副食）默认按部门分开展示
      const defaultSortMode = showSortToggle ? 'department' : 'time'
      const list = (result.data.list || []).map(s => this.formatSubmission(s, blocks, isQuiz))
      // 默认按部门分组，需要先拿到部门顺序；读取失败时退化为「按出现顺序」，不阻断页面
      if (showSortToggle) {
        await this.loadDepartmentOrder()
      }
      this.setData({
        title: form.title || '',
        tag: form.tag || '',
        isQuiz,
        showSortToggle,
        maxSubmissions: Math.max(1, Number(form.maxSubmissions) || 1),
        list,
        sortMode: defaultSortMode,
        sortModeText: SORT_MODE_TEXT[defaultSortMode] || '按提交时间',
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
      // 按部门分组：组序与 trip-board 一致（见 buildDeptGroupKey / compareDeptGroup 的注释）
      // 组内：答题表单按分数降序；无分数表单（副食等）按提交时间正序
      const groups = {}
      const keys = []
      list.forEach(item => {
        const key = this.buildDeptGroupKey(item)
        if (!groups[key]) { groups[key] = []; keys.push(key) }
        groups[key].push(item)
      })
      keys.sort((a, b) => this.compareDeptGroup(a, b))
      keys.forEach(key => {
        if (this.data.isQuiz) {
          groups[key].sort((a, b) => (b.scoreTotal || 0) - (a.scoreTotal || 0))
        } else {
          groups[key].sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
        }
        displayList.push({ key: `g_${key}`, isGroup: true, name: key, count: groups[key].length })
        displayList = displayList.concat(groups[key])
      })
    } else {
      // 按提交时间从早到晚
      list.sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
      displayList = list
    }

    this.setData({ displayList, sortModeText: SORT_MODE_TEXT[sortMode] || '按提交时间' })
  },

  /**
   * 部门分组的组名规则（与 trip-board 保持一致，改一处必须同步另一处）
   * - 部门为「无」（可选领导的馆员）→ 空组名，置顶
   * - 待赴任馆员 → 排在各部门之后
   * - 角色「其他」→ 归入「其他人员」，置底
   * - 其余 → 部门名，为空则「未分配部门」
   */
  buildDeptGroupKey(item) {
    const department = item.department || ''
    const role = item.role || ''
    if (department === '无') return ''
    if (role === '待赴任馆员') return '待赴任馆员'
    if (role === '其他') return '其他人员'
    return department || '未分配部门'
  },

  /**
   * 部门组的先后顺序（与云端 tripBoard.getBoardData 的排序规则一致）
   * 空组名置顶 → 按 sys_config.DEPARTMENT_OPTIONS 顺序 → 「待赴任馆员」紧随最后一个部门
   * → 未配置的部门（如「未分配部门」）排在其后 → 「其他人员」置底
   */
  compareDeptGroup(a, b) {
    if (a === b) return 0
    if (a === '') return -1
    if (b === '') return 1
    if (a === '其他人员') return 1
    if (b === '其他人员') return -1
    const order = this.data.departmentOrder || []
    const indexOf = name => {
      if (name === '待赴任馆员') return order.length
      const i = order.indexOf(name)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    const ai = indexOf(a)
    const bi = indexOf(b)
    if (ai !== bi) return ai - bi
    return a.localeCompare(b, 'zh')
  },

  /**
   * 读取部门顺序（sys_config.DEPARTMENT_OPTIONS，与 trip-board 的分组顺序同源）
   * 失败不阻断：departmentOrder 为空时，部门分组退化为「按出现顺序」
   */
  async loadDepartmentOrder() {
    try {
      const allConstants = await app.getAllConstants()
      this.setData({ departmentOrder: allConstants.DEPARTMENT_OPTIONS || [] })
    } catch (e) {
      console.warn('读取部门顺序失败，部门分组将按出现顺序:', e)
    }
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
   * 循环切换排序方式
   * 答题表单：时间 → 分数 → 部门 → 时间
   * 无分数表单（副食）：时间 → 部门 → 时间（不出现「按分数」）
   */
  onSortToggle() {
    const modes = this.data.isQuiz ? SORT_MODES : SORT_MODES_NO_SCORE
    const idx = modes.indexOf(this.data.sortMode)
    const next = modes[(idx + 1) % modes.length]
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

    // 导出内容跟随当前排序：部门分组时把组的先后顺序一并传给云端，保证 PDF 与页面一致
    const groupOrder = this.data.sortMode === 'department'
      ? this.data.displayList.filter(d => d.isGroup).map(d => d.name)
      : []
    wx.cloud.callFunction({
      name: 'generateOrderPdf',
      data: {
        type: 'contentFormSideDish',
        formId: this.data.formId,
        sortMode: this.data.sortMode,
        groupOrder
      }
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
