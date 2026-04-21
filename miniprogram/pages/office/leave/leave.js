/**
 * 休假申请页面
 *
 * 功能：
 * - 首次配置（仿餐食管理入伙配置弹窗）
 * - 双Tab（申请 / 我的记录）
 * - 申请：余额卡片 → 选日期 → 系统算方案 → 选方案 → 填表单 → 提交
 * - 记录：分页列表、补填按钮、详情弹窗
 */
const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

// 常量
const TERM_LEAVE_RETURN_BONUS_DAYS = 2
const TERM_LEAVE_DAYS_PER_ROUND = 20

Page({
  behaviors: [paginationBehavior],

  data: {
    loading: false,
    submitting: false,

    // Tab控制
    activeTab: 'apply',

    // ========== 首次配置 ==========
    showFirstSetup: false,
    setupForm: {
      workStartDate: '',
      arrivalDate: '',
      annualRemainingCurrent: '',
      annualRemainingPrev: '',
      termRemainingCurrent: '',
      termRemainingPrev: '',
      prevTermReturnToHome: false,
      prevTermPublicExpense: false,
      currentTermReturnToHome: false,
      currentTermPublicExpense: false
    },
    setupSubmitting: false,
    setupWorkYearHint: '',
    setupTermHint: '',
    setupNeedPrevAnnual: false,
    setupNeedAnnual: false,
    setupNeedPrevTerm: false,
    setupCurrentYear: '',
    setupPrevYear: '',
    setupMaxTermRound: 0,
    setupPrevTermRound: 0,
    setupAnnualDaysPerYear: 0,

    // ========== 申请表单 ==========
    form: {
      startDate: '',
      endDate: '',
      isReturnToHome: false,
      otherTypeName: '',
      expenseType: 'self',
      leaveLocation: '',
      leaveRoute: '',
      proposedFlights: '',
      isTransferringBenefit: false,
      transferredCount: 0,
      needsVisaAssistance: false,
      otherNotes: '',
      reason: ''
    },

    // 余额卡片
    quotaSummary: null,
    myQuota: null,

    // 方案相关
    calculatedPlans: [],
    selectedPlan: null,
    plansLoading: false,
    showOtherTypeForm: false,
    showTermOptions: false,
    showExpenseTypeSelect: false,
    selectedPlanHasTerm: false,
    canSubmit: false,

    // 常量
    TERM_LEAVE_RETURN_BONUS_DAYS: TERM_LEAVE_RETURN_BONUS_DAYS,

    // ========== 记录列表 ==========
    recordList: [],
    groupedRecords: [],
    list: [],

    // ========== 详情弹窗 ==========
    showDetailPopup: false,
    selectedRecord: null,
    detailLogs: [],
    submittedAtText: '',

    // ========== 补填弹窗 ==========
    showSupplementPopup: false,
    supplementForm: {
      startDate: '',
      endDate: '',
      leaveComposition: '',
      expenseType: 'self',
      leaveLocation: '',
      remark: ''
    },
    supplementSubmitting: false,

    today: '',

    // 详情弹窗滚动位置
    detailScrollTop: 0
  },

  onLoad(options) {
    this.initPagination({
      initialPageSize: 15,
      loadMorePageSize: 15
    })

    this.setData({
      today: utils.getLocalDateString()
    })
    this.loadConstants()

    // 检查首次配置状态
    this.checkFirstSetupAndLoad()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
    if (!this.data.showFirstSetup && !this.data.showDetailPopup && !this.data.showSupplementPopup) {
      // 从其他页面返回时刷新数据（非弹窗状态）
      if (!this.data.loading && (this.data.recordList.length > 0 || this.data.activeTab === 'records')) {
        this.refreshCurrentTab()
      }
    }
  },

  onReachBottom() {
    if (this.data.activeTab === 'records') {
      this.loadMore()
    }
  },

  async onPullDownRefresh() {
    await this.refreshCurrentTab()
    wx.stopPullDownRefresh()
  },

  /**
   * 加载系统常量（不再需要 LEAVE_TYPE_OPTIONS）
   */
  loadConstants() {
    // 保留空方法以防其他地方调用
  },

  // ==================== 首次配置检查与加载 ====================

  async checkFirstSetupAndLoad() {
    wx.showLoading({
      title: '加载中...',
      mask: true
    })
    try {
      const result = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'getMyQuotas'
        }
      })

      if (result.result.code === 0) {
        const resData = result.result.data
        if (!resData || !resData.quota) {
          this.setData({
            myQuota: null,
            showFirstSetup: true,
            loading: false
          })
          wx.hideLoading()
          return
        }

        const {
          quota,
          quotaSummary
        } = resData

        this.setData({
          myQuota: quota,
          quotaSummary,
          showFirstSetup: false,
          loading: false
        })

        await this.loadRecordData()
      } else {
        throw new Error(result.result.message)
      }
    } catch (error) {
      console.error('[leave] 初始化失败:', error)
      this.setData({
        loading: false
      })
    } finally {
      wx.hideLoading()
    }
  },

  // ==================== 首次配置操作 ====================

  handleSetupWorkStartDateChange(e) {
    this.setData({
      'setupForm.workStartDate': e.detail.value
    })
    this.calcSetupHints()
  },

  handleSetupArrivalDateChange(e) {
    this.setData({
      'setupForm.arrivalDate': e.detail.value
    })
    this.calcSetupHints()
  },

  handleSetupAnnualCurrentInput(e) {
    const val = e.detail.value
    this.setData({
      'setupForm.annualRemainingCurrent': val
    })
    const num = Number(val)
    if (val !== '' && !isNaN(num) && (num < 0 || num > this.data.setupAnnualDaysPerYear)) {
      utils.showToast({
        title: `年休假剩余天数应在0~${this.data.setupAnnualDaysPerYear}之间`,
        icon: 'none'
      })
    }
  },

  handleSetupAnnualPrevInput(e) {
    const val = e.detail.value
    this.setData({
      'setupForm.annualRemainingPrev': val
    })
    const num = Number(val)
    if (val !== '' && !isNaN(num) && (num < 0 || num > this.data.setupAnnualDaysPerYear)) {
      utils.showToast({
        title: `年休假剩余天数应在0~${this.data.setupAnnualDaysPerYear}之间`,
        icon: 'none'
      })
    }
  },

  handleSetupTermCurrentInput(e) {
    this.setData({
      'setupForm.termRemainingCurrent': e.detail.value
    })
  },

  handleSetupTermPrevInput(e) {
    this.setData({
      'setupForm.termRemainingPrev': e.detail.value
    })
  },

  handleSetupPrevTermReturnSelect(e) {
    this.setData({
      'setupForm.prevTermReturnToHome': e.currentTarget.dataset.value === 'true'
    })
  },

  handleSetupPrevTermPublicExpenseSelect(e) {
    this.setData({
      'setupForm.prevTermPublicExpense': e.currentTarget.dataset.value === 'true'
    })
  },

  handleSetupCurrentTermReturnSelect(e) {
    this.setData({
      'setupForm.currentTermReturnToHome': e.currentTarget.dataset.value === 'true'
    })
  },

  handleSetupCurrentTermPublicExpenseSelect(e) {
    this.setData({
      'setupForm.currentTermPublicExpense': e.currentTarget.dataset.value === 'true'
    })
  },

  /** 根据选择的日期自动计算提示和需要填写的字段 */
  calcSetupHints() {
    const {
      workStartDate,
      arrivalDate
    } = this.data.setupForm
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const isInQ1 = currentMonth <= 3

    let setupWorkYearHint = ''
    let setupAnnualDaysPerYear = 0
    let setupNeedPrevAnnual = false
    let setupNeedAnnual = false
    let setupTermHint = ''
    let setupMaxTermRound = 0
    let setupPrevTermRound = 0
    let setupNeedPrevTerm = false

    // === 年休假提示 ===
    if (workStartDate) {
      const endOfYear = new Date(currentYear, 11, 31)
      const workStart = new Date(workStartDate)
      const workYears = (endOfYear.getTime() - workStart.getTime()) / (365.25 * 24 * 3600 * 1000)

      if (workYears < 10) {
        setupWorkYearHint = '您工作未满10年，每年年休假为5天'
        setupAnnualDaysPerYear = 5
      } else if (workYears < 20) {
        setupWorkYearHint = '您工作已满10年未满20年，每年年休假为10天'
        setupAnnualDaysPerYear = 10
      } else {
        setupWorkYearHint = '您工作已满20年，每年年休假为15天'
        setupAnnualDaysPerYear = 15
      }
    }

    // === 年休假：是否需要填写 x-1 年剩余 ===
    if (arrivalDate) {
      const arrivalYear = parseInt(arrivalDate.substring(0, 4), 10)
      // 到任当年无年休假，从到任第二年起才有
      // 到任今年则无需填写任何年休假剩余
      setupNeedAnnual = arrivalYear !== currentYear
      // Q1 时需要填写 x-1 年条件：到任年份 <= x-2（即 x-1 年有配额且在 Q1 还未过期）
      if (arrivalYear === currentYear) {
        setupNeedPrevAnnual = false
      } else {
        setupNeedPrevAnnual = isInQ1 && arrivalYear <= currentYear - 2
      }
    }

    // === 任期假提示 ===
    if (arrivalDate) {
      const arrival = new Date(arrivalDate)
      const monthsSinceArrival = (now.getFullYear() - arrival.getFullYear()) * 12 +
        (now.getMonth() - arrival.getMonth())

      // 按规则计算可休次数
      const TERM_RULES = [{
          round: 1,
          months: 6,
          desc: '6个月'
        },
        {
          round: 2,
          months: 24,
          desc: '2年'
        },
        {
          round: 3,
          months: 36,
          desc: '3年'
        },
        {
          round: 4,
          months: 48,
          desc: '4年'
        },
        {
          round: 5,
          months: 60,
          desc: '5年'
        },
        {
          round: 6,
          months: 72,
          desc: '6年'
        },
        {
          round: 7,
          months: 84,
          desc: '7年'
        },
        {
          round: 8,
          months: 96,
          desc: '8年'
        }
      ]

      for (const rule of TERM_RULES) {
        if (monthsSinceArrival >= rule.months) {
          setupMaxTermRound = rule.round
        }
      }

      if (setupMaxTermRound === 0) {
        setupTermHint = '您到任未满6个月，尚不可休任期假'
      } else {
        const matchedRule = TERM_RULES.find(r => r.round === setupMaxTermRound)
        setupTermHint = `您到任已满${matchedRule.desc}，可以休第${setupMaxTermRound}次任期假`
      }

      // 是否需要填写第 y-1 次任期假剩余天数
      if (setupMaxTermRound > 1) {
        setupNeedPrevTerm = true
        setupPrevTermRound = setupMaxTermRound - 1
      }
    }

    this.setData({
      setupWorkYearHint,
      setupAnnualDaysPerYear,
      setupNeedPrevAnnual,
      setupNeedAnnual,
      setupTermHint,
      setupMaxTermRound,
      setupPrevTermRound,
      setupNeedPrevTerm,
      setupCurrentYear: String(currentYear),
      setupPrevYear: String(currentYear - 1),
      setupPrevAnnualPlaceholder: `请输入${currentYear - 1}年剩余年休假天数（0-${setupAnnualDaysPerYear}）`,
      setupCurrentAnnualPlaceholder: `请输入${currentYear}年剩余年休假天数（0-${setupAnnualDaysPerYear}）`
    })
  },

  handleSetupCancel() {
    this.setData({
      showFirstSetup: false
    })
    wx.navigateBack({
      delta: 1
    })
  },

  async handleSetupConfirm() {
    const form = this.data.setupForm
    if (!form.workStartDate) return utils.showToast({
      title: '请选择参加工作日期',
      icon: 'none'
    })
    if (!form.arrivalDate) return utils.showToast({
      title: '请选择到任日期',
      icon: 'none'
    })

    const arrivalYear = parseInt(form.arrivalDate.substring(0, 4), 10)
    const currentYear = new Date().getFullYear()

    // 到任今年无需填写年休假
    if (arrivalYear !== currentYear) {
      if (form.annualRemainingCurrent === '' || isNaN(Number(form.annualRemainingCurrent)) || Number(form.annualRemainingCurrent) < 0) {
        return utils.showToast({
          title: `请填写${this.data.setupCurrentYear}年年休假剩余天数`,
          icon: 'none'
        })
      }
      if (Number(form.annualRemainingCurrent) > this.data.setupAnnualDaysPerYear) {
        return utils.showToast({
          title: `${this.data.setupCurrentYear}年年休假剩余天数不能超过${this.data.setupAnnualDaysPerYear}`,
          icon: 'none'
        })
      }
      if (this.data.setupNeedPrevAnnual) {
        if (form.annualRemainingPrev === '' || isNaN(Number(form.annualRemainingPrev)) || Number(form.annualRemainingPrev) < 0) {
          return utils.showToast({
            title: `请填写${this.data.setupPrevYear}年年休假剩余天数`,
            icon: 'none'
          })
        }
        if (Number(form.annualRemainingPrev) > this.data.setupAnnualDaysPerYear) {
          return utils.showToast({
            title: `${this.data.setupPrevYear}年年休假剩余天数不能超过${this.data.setupAnnualDaysPerYear}`,
            icon: 'none'
          })
        }
      }
    }

    // 任期假填写校验
    if (this.data.setupMaxTermRound > 0) {
      if (form.termRemainingCurrent === '' || isNaN(Number(form.termRemainingCurrent)) || Number(form.termRemainingCurrent) < 0) {
        return utils.showToast({
          title: `请填写第${this.data.setupMaxTermRound}次任期假剩余天数`,
          icon: 'none'
        })
      }
      if (Number(form.termRemainingCurrent) > 20) {
        return utils.showToast({
          title: `第${this.data.setupMaxTermRound}次任期假剩余天数不能超过20`,
          icon: 'none'
        })
      }
      if (this.data.setupNeedPrevTerm) {
        if (form.termRemainingPrev === '' || isNaN(Number(form.termRemainingPrev)) || Number(form.termRemainingPrev) < 0) {
          return utils.showToast({
            title: `请填写第${this.data.setupPrevTermRound}次任期假剩余天数`,
            icon: 'none'
          })
        }
        if (Number(form.termRemainingPrev) > 20) {
          return utils.showToast({
            title: `第${this.data.setupPrevTermRound}次任期假剩余天数不能超过20`,
            icon: 'none'
          })
        }
      }
    }

    this.setData({
      setupSubmitting: true
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'initSetup',
          params: {
            workStartDate: form.workStartDate,
            arrivalDate: form.arrivalDate,
            annualRemainingCurrent: arrivalYear === currentYear ? 0 : Number(form.annualRemainingCurrent || 0),
            annualRemainingPrev: this.data.setupNeedPrevAnnual ? Number(form.annualRemainingPrev || 0) : 0,
            termRemainingCurrent: this.data.setupMaxTermRound > 0 ? Number(form.termRemainingCurrent || 0) : 0,
            termRemainingPrev: this.data.setupNeedPrevTerm ? Number(form.termRemainingPrev || 0) : 0,
            maxTermRound: this.data.setupMaxTermRound,
            needPrevAnnual: this.data.setupNeedPrevAnnual,
            needPrevTerm: this.data.setupNeedPrevTerm,
            prevTermReturnToHome: form.prevTermReturnToHome,
            prevTermPublicExpense: form.prevTermPublicExpense,
            currentTermReturnToHome: form.currentTermReturnToHome,
            currentTermPublicExpense: form.currentTermPublicExpense
          }
        }
      })

      if (res.result.code === 0) {
        utils.showToast({
          title: '配置成功',
          icon: 'success'
        })
        const quota = res.result.data
        this.setData({
          myQuota: quota,
          showFirstSetup: false,
          setupSubmitting: false,
          setupForm: {
            workStartDate: '',
            arrivalDate: '',
            annualRemainingCurrent: '',
            annualRemainingPrev: '',
            termRemainingCurrent: '',
            termRemainingPrev: '',
            prevTermReturnToHome: false,
            prevTermPublicExpense: false,
            currentTermReturnToHome: false,
            currentTermPublicExpense: false
          },
          setupWorkYearHint: '',
          setupTermHint: '',
          setupNeedPrevAnnual: false,
          setupNeedAnnual: false,
          setupNeedPrevTerm: false,
          setupMaxTermRound: 0,
          setupPrevTermRound: 0
        })
        // 重新加载配额摘要
        this.loadMyQuotas()
      } else {
        utils.showToast({
          title: res.result.message || '配置失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('首次配置失败:', error)
      utils.showToast({
        title: '配置失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        setupSubmitting: false
      })
    }
  },

  stopPropagation() {},

  // ==================== Tab切换 ====================

  handleTabSwitch(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({
      activeTab: tab
    })

    if (tab === 'records' && this.data.list.length === 0) {
      this.loadRecordData()
    }
  },

  refreshCurrentTab() {
    if (this.data.activeTab === 'records') {
      return this.loadRecordData(true)
    } else {
      // 申请tab刷新配额
      return this.loadMyQuotas()
    }
  },

  // ==================== 日期选择与方案计算 ====================

  handleStartDateChange(e) {
    this.setData({
      'form.startDate': e.detail.value
    })
    if (e.detail.value > this.data.form.endDate) {
      this.setData({
        'form.endDate': e.detail.value
      })
    }
    this.recalculatePlans()
  },

  handleEndDateChange(e) {
    this.setData({
      'form.endDate': e.detail.value
    })
    this.recalculatePlans()
  },

  /** 防抖调用 calculatePlans */
  _plansTimer: null,
  recalculatePlans() {
    const {
      startDate,
      endDate
    } = this.data.form
    // 清除旧方案
    this.setData({
      calculatedPlans: [],
      selectedPlan: null,
      canSubmit: false,
      showTermOptions: false,
      showExpenseTypeSelect: false,
      selectedPlanHasTerm: false
    })

    if (!startDate || !endDate) return

    clearTimeout(this._plansTimer)
    this._plansTimer = setTimeout(() => {
      this.doCalculatePlans()
    }, 500)
  },

  /** 调用云函数计算方案 */
  async doCalculatePlans() {
    const {
      startDate,
      endDate,
      isReturnToHome
    } = this.data.form
    if (!startDate || !endDate) return

    this.setData({
      plansLoading: true
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'calculatePlans',
          params: {
            startDate,
            endDate,
            isReturnToHome
          }
        }
      })

      if (res.result.code === 0) {
        const data = res.result.data
        const plans = data.availablePlans || []
        const autoSelected = data.autoSelected

        // 判断是否涉及任期假（用于显示回国选项和公费选项）
        const hasTermInPlans = plans.some(p => p.consumed && p.consumed.some(c => c.type === 'term'))

        this.setData({
          calculatedPlans: plans,
          selectedPlan: autoSelected,
          plansLoading: false,
          showTermOptions: hasTermInPlans,
          showExpenseTypeSelect: hasTermInPlans || this.data.showOtherTypeForm,
          selectedPlanHasTerm: false
        })

        // 如果有自动选中，更新相关状态
        if (autoSelected) {
          this.onPlanSelected(autoSelected)
        }
      } else {
        this.setData({
          plansLoading: false
        })
        if (res.result.code === 400) {
          utils.showToast({
            title: res.result.message,
            icon: 'none'
          })
        }
      }
    } catch (err) {
      console.error('方案计算失败:', err)
      this.setData({
        plansLoading: false
      })
    }
  },

  /** 用户选择方案 */
  handlePlanSelect(e) {
    const planKey = e.currentTarget.dataset.plan
    this.setData({
      selectedPlan: planKey
    })
    this.onPlanSelected(planKey)
  },

  /** 方案选中后的联动 */
  onPlanSelected(planKey) {
    const plan = this.data.calculatedPlans.find(p => p.planKey === planKey)
    if (!plan) return

    const hasTerm = plan.consumed && plan.consumed.some(c => c.type === 'term')
    const canUsePublic = hasTerm && plan.consumed.some(c => c.type === 'term' && c.canUsePublicExpense)

    this.setData({
      showTermOptions: hasTerm,
      showExpenseTypeSelect: hasTerm,
      selectedPlanHasTerm: hasTerm,
      canSubmit: true
    })

    // 如果涉及任期假但公费不可用，自动选自费
    if (hasTerm && !canUsePublic) {
      this.setData({
        'form.expenseType': 'self'
      })
    }
  },

  // ==================== 任期假选项 ====================

  handleSwitchReturnToHome(e) {
    this.setData({
      'form.isReturnToHome': e.detail.value,
      isReturnToHome: e.detail.value
    })
    // 重新计算方案（回国+2天影响覆盖天数）
    this.recalculatePlans()
  },

  // ==================== "其他"类型入口 ====================

  handleOtherTypeSwitch(e) {
    const willShow = e.detail.value
    this.setData({
      showOtherTypeForm: willShow,
      showExpenseTypeSelect: willShow,
      canSubmit: willShow ? false : !!this.data.selectedPlan
    })
    // 关闭时重置
    if (!willShow) {
      this.setData({
        'form.otherTypeName': '',
        'form.expenseType': 'self'
      })
    }
  },

  // ==================== 扩展表单字段 ====================

  handleExpenseTypeSelect(e) {
    this.setData({
      'form.expenseType': e.currentTarget.dataset.value
    })
    // 关闭公费待遇转让
    if (e.currentTarget.dataset.value === 'self') {
      this.setData({
        'form.isTransferringBenefit': false,
        'form.transferredCount': 0
      })
    }
  },

  handleOtherTypeNameInput(e) {
    const value = e.detail.value
    this.setData({
      'form.otherTypeName': value
    })
    // "其他"类型：填写类型名+日期+原因后可提交
    if (this.data.showOtherTypeForm) {
      const hasName = String(value || '').trim().length > 0
      const hasDates = this.data.form.startDate && this.data.form.endDate
      this.setData({
        canSubmit: hasName && hasDates
      })
    }
  },

  handleLeaveLocationInput(e) {
    this.setData({
      'form.leaveLocation': e.detail.value
    })
  },

  handleLeaveRouteInput(e) {
    this.setData({
      'form.leaveRoute': e.detail.value
    })
  },

  handleProposedFlightsInput(e) {
    this.setData({
      'form.proposedFlights': e.detail.value
    })
  },

  handleSwitchTransferringBenefit(e) {
    this.setData({
      'form.isTransferringBenefit': e.detail.value
    })
    if (!e.detail.value) {
      this.setData({
        'form.transferredCount': 0
      })
    }
  },

  handleTransferredCountMinus() {
    const val = this.data.form.transferredCount || 0;
    if (val > 0) {
      this.setData({ 'form.transferredCount': val - 1 });
    }
  },

  handleTransferredCountPlus() {
    const val = this.data.form.transferredCount || 0;
    if (val < 99) {
      this.setData({ 'form.transferredCount': val + 1 });
    }
  },

  handleTransferredCountInput(e) {
    let val = parseInt(e.detail.value) || 0;
    val = Math.max(0, Math.min(99, val));
    this.setData({ 'form.transferredCount': val });
  },

  handleSwitchVisaAssistance(e) {
    this.setData({
      'form.needsVisaAssistance': e.detail.value
    })
  },

  handleOtherNotesInput(e) {
    this.setData({
      'form.otherNotes': e.detail.value
    })
  },

  handleReasonInput(e) {
    this.setData({
      'form.reason': e.detail.value
    })
  },

  async loadMyQuotas() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'getMyQuotas'
        }
      })
      if (res.result.code === 0) {
        const {
          quota,
          quotaSummary
        } = res.result.data
        this.setData({
          myQuota: quota,
          quotaSummary
        })
      }
    } catch (e) {
      console.error('加载配额失败:', e)
    }
  },

  // ==================== 提交申请 ====================

  validateApplicationForm() {
    const f = this.data.form
    if (this.data.showOtherTypeForm) {
      // "其他"类型提交
      if (!f.startDate) {
        utils.showToast({
          title: '请选择开始日期',
          icon: 'none'
        });
        return false;
      }
      if (!f.endDate) {
        utils.showToast({
          title: '请选择结束日期',
          icon: 'none'
        });
        return false;
      }
      if (!String(f.otherTypeName || '').trim()) {
        utils.showToast({
          title: '请输入自定义类型名',
          icon: 'none'
        });
        return false;
      }
    } else {
      // 方案提交
      if (!f.startDate) {
        utils.showToast({
          title: '请选择开始日期',
          icon: 'none'
        });
        return false;
      }
      if (!f.endDate) {
        utils.showToast({
          title: '请选择结束日期',
          icon: 'none'
        });
        return false;
      }
      if (!this.data.selectedPlan) {
        utils.showToast({
          title: '请选择休假方案',
          icon: 'none'
        });
        return false;
      }
    }
    if (!String(f.reason || '').trim()) {
      utils.showToast({
        title: '请填写休假原因',
        icon: 'none'
      });
      return false;
    }
    return true;
  },

  async handleSubmitApplication() {
    if (this.data.submitting) return
    if (!this.validateApplicationForm()) return

    // 检查用户是否有休假记录
    try {
      const checkRes = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'getMyRecords',
          params: {
            page: 1,
            pageSize: 1
          }
        }
      })
      if (checkRes.result.code === 0) {
        const hasRecords = (checkRes.result.data.list || []).length > 0
        if (!hasRecords) {
          wx.showModal({
            title: '提示',
            content: '您还没有休假记录，建议先补填过往休假记录以便系统正确扣减配额。',
            cancelText: '前往补填',
            confirmText: '仍然提交',
            success: (res) => {
              if (res.confirm) {
                // 仍然提交
                this.doSubmitApplication()
              } else {
                // 前往补填：切换到记录tab
                this.setData({
                  activeTab: 'records'
                })
                this.loadRecordData()
              }
            }
          })
          return
        }
      }
    } catch (e) {
      console.error('[leave] 检查休假记录失败:', e)
      // 检查失败时不阻止提交
    }

    this.doSubmitApplication()
  },

  async doSubmitApplication() {
    if (this.data.submitting) return
    this.setData({
      submitting: true
    })

    const f = this.data.form
    try {
      let submitParams

      if (this.data.showOtherTypeForm) {
        // === "其他"类型提交 ===
        submitParams = {
          leaveType: 'other',
          otherTypeName: f.otherTypeName,
          startDate: f.startDate,
          endDate: f.endDate,
          expenseType: f.expenseType,
          leaveLocation: f.leaveLocation,
          leaveRoute: f.leaveRoute,
          proposedFlights: f.proposedFlights,
          isTransferringBenefit: f.isTransferringBenefit,
          transferredCount: f.transferredCount,
          needsVisaAssistance: f.needsVisaAssistance,
          otherNotes: f.otherNotes,
          reason: f.reason
        }
      } else {
        // === 方案提交 ===
        submitParams = {
          startDate: f.startDate,
          endDate: f.endDate,
          isReturnToHome: f.isReturnToHome,
          selectedPlan: this.data.selectedPlan,
          expenseType: f.expenseType,
          leaveLocation: f.leaveLocation,
          leaveRoute: f.leaveRoute,
          proposedFlights: f.proposedFlights,
          isTransferringBenefit: f.isTransferringBenefit,
          transferredCount: f.transferredCount,
          needsVisaAssistance: f.needsVisaAssistance,
          otherNotes: f.otherNotes,
          reason: f.reason
        }
      }

      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'submit',
          params: submitParams
        }
      })

      if (res.result.code === 0) {
        wx.showModal({
          title: '提交成功',
          content: '提交成功，请等待审批。您可在审批中心"我的发起"中查看进度。',
          showCancel: false,
          confirmText: '我知道了',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.resetForm()
              this.setData({
                activeTab: 'records'
              }, () => {
                this.loadRecordData(true)
              })
            }
          }
        })
      } else {
        utils.showToast({
          title: res.result.message || '提交失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('提交申请失败:', error)
      utils.showToast({
        title: '提交失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        submitting: false
      })
    }
  },

  resetForm() {
    this.setData({
      form: {
        startDate: '',
        endDate: '',
        isReturnToHome: false,
        otherTypeName: '',
        expenseType: 'self',
        leaveLocation: '',
        leaveRoute: '',
        proposedFlights: '',
        isTransferringBenefit: false,
        transferredCount: 0,
        needsVisaAssistance: false,
        otherNotes: '',
        reason: ''
      },
      calculatedPlans: [],
      selectedPlan: null,
      plansLoading: false,
      showOtherTypeForm: false,
      showTermOptions: false,
      showExpenseTypeSelect: false,
      selectedPlanHasTerm: false,
      canSubmit: false
    })
    // 刷新配额
    this.loadMyQuotas()
  },

  // ==================== 记录列表（分页）====================

  async loadData(params) {
    const {
      page,
      pageSize
    } = params
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'getMyRecords',
          params: {
            page,
            pageSize
          }
        }
      }).then(res => {
        if (res.result.code === 0) {
          const data = res.result.data
          const recordList = (data.list || []).map(item => this.formatRecordItem(item))
          this.setData({
            recordList: page === 1 ? recordList : [...this.data.recordList, ...recordList],
            list: page === 1 ? recordList : [...this.data.list, ...recordList]
          })
          this.updateGroupedRecords()

          resolve({
            data: recordList,
            hasMore: data.hasMore !== false
          })
        } else {
          reject(new Error(res.result.message))
        }
      }).catch(error => {
        console.error('加载记录失败:', error)
        utils.showToast({
          title: '加载失败',
          icon: 'none'
        })
        reject(error)
      })
    })
  },

  formatRecordItem(item) {
    const createdAt = utils.toLocalTime(item.createdAt)
    return {
      ...item,
      createdAtText: utils.formatDateTime(item.createdAt),
      monthKey: `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`,
      monthText: `${createdAt.getFullYear()}年${createdAt.getMonth() + 1}月`
    }
  },

  updateGroupedRecords() {
    const recordList = this.data.recordList
    const groupedMap = {}
    recordList.forEach(record => {
      if (!groupedMap[record.monthKey]) {
        groupedMap[record.monthKey] = {
          monthKey: record.monthKey,
          monthText: record.monthText,
          records: []
        }
      }
      groupedMap[record.monthKey].records.push(record)
    })
    this.setData({
      groupedRecords: Object.values(groupedMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    })
  },

  async loadRecordData(forceRefresh) {
    if (forceRefresh) {
      await this.refreshList()
    } else {
      this.resetPagination()
      await this.loadListData(false)
    }
  },

  // ==================== 详情弹窗 ====================

  async showRecordDetail(e) {
    const record = e.currentTarget.dataset.record
    wx.showLoading({
      title: '加载中...'
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'getRecordDetail',
          params: {
            recordId: record._id
          }
        }
      })

      if (res.result.code === 0) {
        const actionTextMap = app.getConstantSync('WORKFLOW_ACTION_TEXT') || {}
        const logs = (res.result.data.logs || []).map(log => ({
          ...log,
          timeText: log.createdAt ? utils.formatDateTime(log.createdAt) : '-',
          actionText: actionTextMap[log.action] || log.action
        }))

        const startLog = logs.find(l => l.action === 'start')
        const submittedAtText = startLog ?
          startLog.timeText :
          (record.createdAt ? utils.formatDateTime(record.createdAt) : '-')

        const detail = res.result.data
        // 前端用时区偏移重新格式化创建时间，覆盖后端的服务器时区格式化结果
        if (detail.createdAt) {
          detail.createdAtText = utils.formatDateTime(detail.createdAt)
          detail.updatedAtText = utils.formatDateTime(detail.updatedAt)
        }

        this.setData({
          selectedRecord: detail,
          detailLogs: logs,
          submittedAtText,
          detailScrollTop: 0,
          showDetailPopup: true
        })
      }
    } catch (error) {
      console.error('获取详情失败:', error)
      utils.showToast({
        title: '获取详情失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  hideDetailPopup() {
    this.setData({
      showDetailPopup: false
    })
  },

  hideQuotaPopup() {
    this.setData({
      showQuotaPopup: false
    })
  },

  showQuotaDetail() {
    if (this.data.myQuota) {
      this.setData({
        quotaDetail: this.data.myQuota,
        showQuotaPopup: true
      })
    }
  },

  // ==================== 补填记录 ====================

  showSupplementPopup() {
    this.setData({
      showSupplementPopup: true,
      supplementForm: {
        startDate: '',
        endDate: '',
        leaveComposition: '',
        expenseType: 'self',
        leaveLocation: '',
        remark: ''
      }
    })
  },

  hideSupplementPopup() {
    this.setData({
      showSupplementPopup: false
    })
  },

  handleSupplementStartChange(e) {
    this.setData({
      'supplementForm.startDate': e.detail.value
    })
  },
  handleSupplementEndChange(e) {
    this.setData({
      'supplementForm.endDate': e.detail.value
    })
  },
  handleSupplementCompositionInput(e) {
    this.setData({
      'supplementForm.leaveComposition': e.detail.value
    })
  },
  handleSupplementExpenseSelect(e) {
    this.setData({
      'supplementForm.expenseType': e.currentTarget.dataset.value
    })
  },
  handleSupplementLocationInput(e) {
    this.setData({
      'supplementForm.leaveLocation': e.detail.value
    })
  },
  handleSupplementRemarkInput(e) {
    this.setData({
      'supplementForm.remark': e.detail.value
    })
  },

  async handleSubmitSupplement() {
    const sf = this.data.supplementForm
    if (!sf.startDate || !sf.endDate) {
      return utils.showToast({
        title: '请选择休假日期',
        icon: 'none'
      })
    }
    if (!sf.leaveComposition || !sf.leaveComposition.trim()) {
      return utils.showToast({
        title: '请填写假期构成',
        icon: 'none'
      })
    }

    this.setData({
      supplementSubmitting: true
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'supplementRecord',
          params: {
            startDate: sf.startDate,
            endDate: sf.endDate,
            leaveType: 'other',
            leaveComposition: sf.leaveComposition,
            expenseType: sf.expenseType,
            leaveLocation: sf.leaveLocation,
            remark: sf.remark
          }
        }
      })

      if (res.result.code === 0) {
        utils.showToast({
          title: '补填成功',
          icon: 'success'
        })
        this.hideSupplementPopup()
        // 刷新记录列表
        this.loadRecordData(true)
        // 刷新配额
        this.loadMyQuotas()
      } else {
        utils.showToast({
          title: res.result.message || '补填失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('补填失败:', error)
      utils.showToast({
        title: '补填失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        supplementSubmitting: false
      })
    }
  }
})