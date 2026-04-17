/**
 * 休假申请页面
 *
 * 功能：
 * - 首次配置（仿餐食管理入伙配置弹窗）
 * - 双Tab（申请 / 我的记录）
 * - 申请：类型选择、日期选择、天数预览、配额校验、扩展表单、提交工作流
 * - 记录：分页列表、补填按钮、详情弹窗
 * - 余额查看弹窗
 */
const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

// 常量
const TERM_LEAVE_RETURN_BONUS_DAYS = 2

// 休假类型选项
const LEAVE_TYPE_OPTIONS = [
  { value: 'annual', name: '年休假' },
  { value: 'term', name: '任期假' },
  { value: 'combo_annual_term', name: '年休假+任期假' },
  { value: 'combo_term_annual', name: '任期假+年休假' },
  { value: 'holiday', name: '法定节假日' },
  { value: 'other', name: '其他' }
]

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
      initialAnnualRemaining: '',
      initialTermRemaining: ''
    },
    setupSubmitting: false,

    // ========== 申请表单 ==========
    form: {
      leaveType: '',           // 当前选中的类型
      startDate: '',
      endDate: '',
      isReturnToHome: false,   // 任期假是否回国
      termLeaveRound: null,   // 第几次任期假
      otherTypeName: '',       // 其他类型名称
      expenseType: 'public',
      leaveLocation: '',
      leaveRoute: '',
      proposedFlights: '',
      isTransferringBenefit: false,
      transferredCount: 0,
      needsVisaAssistance: false,
      otherNotes: '',
      reason: ''
    },

    // 天数预览
    calculatedDays: {
      totalDays: 0,
      workDays: 0,
      termTotalDays: 0,
      comboHint: ''
    },

    // 配额相关
    myQuota: null,
    quotaHintText: '',
    quotaDisplayAvailable: '',
    quotaDisplayTotal: '',
    quotaWarning: '',
    quotaOverLimit: false,
    availableTermRounds: [],

    showQuotaPopup: false,
    quotaDetail: null,

    // ========== 记录列表 ==========
    recordList: [],
    groupedRecords: [],
    list: [], // for pagination behavior

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
      supplementType: '',
      expenseType: 'self',
      leaveLocation: '',
      remark: ''
    },
    supplementSubmitting: false,

    today: '',

    // 常量
    TERM_LEAVE_RETURN_BONUS_DAYS: TERM_LEAVE_RETURN_BONUS_DAYS,
    leaveTypeOptions: LEAVE_TYPE_OPTIONS
  },

  onLoad(options) {
    this.initPagination({
      initialPageSize: 15,
      loadMorePageSize: 15
    })

    this.setData({ today: utils.getLocalDateString() })
    this.loadConstants()

    // 检查首次配置状态
    this.checkFirstSetupAndLoad()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
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
   * 加载系统常量
   */
  loadConstants() {
    const LEAVE_TYPE_FROM_CONFIG = app.getConstantSync('LEAVE_TYPE_OPTIONS') || []
    if (LEAVE_TYPE_FROM_CONFIG.length > 0) {
      this.setData({
        leaveTypeOptions: LEAVE_TYPE_FROM_CONFIG.map(item =>
          typeof item === 'string' ? { name: item, value: this.normalizeLeaveTypeKey(item) } : item
        )
      })
    }
  },

  /** 将中文名转key */
  normalizeLeaveTypeKey(name) {
    const map = { '年休假': 'annual', '任期假': 'term', '组合假(年+任)': 'combo_annual_term', '组合假(任+年)': 'combo_term_annual', '法定节假日': 'holiday', '其他': 'other' }
    return map[name] || name.toLowerCase().replace(/[^a-z]/g, '_')
  },

  // ==================== 首次配置检查与加载 ====================

  async checkFirstSetupAndLoad() {
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      const result = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: { action: 'getMyQuotas' }
      })

      if (result.result.code === 0) {
        const quota = result.result.data
        if (!quota) {
          // 无记录 → 弹出首次配置弹窗
          this.setData({
            myQuota: null,
            showFirstSetup: true,
            loading: false
          })
          wx.hideLoading()
          return
        }

        this.setData({
          myQuota: quota,
          showFirstSetup: false,
          loading: false,
          availableTermRounds: this.buildAvailableTermRounds(quota)
        })

        // 加载记录列表
        await this.loadRecordData()
      } else {
        throw new Error(result.result.message)
      }
    } catch (error) {
      console.error('[leave] 初始化失败:', error)
      this.setData({ loading: false })
    } finally {
      wx.hideLoading()
    }
  },

  buildAvailableTermRounds(quota) {
    if (!quota || !quota.termLeaves) return []
    return quota.termLeaves
      .filter(t => !t.used)
      .map(t => ({ round: t.round, eligibleDate: t.eligibleDate, isReturnToHome: t.isReturnToHome }))
  },

  // ==================== 首次配置操作 ====================

  handleSetupWorkStartDateChange(e) {
    this.setData({ 'setupForm.workStartDate': e.detail.value })
  },

  handleSetupArrivalDateChange(e) {
    this.setData({ 'setupForm.arrivalDate': e.detail.value })
  },

  handleSetupAnnualInput(e) {
    this.setData({ 'setupForm.initialAnnualRemaining': e.detail.value })
  },

  handleSetupTermInput(e) {
    this.setData({ 'setupForm.initialTermRemaining': e.detail.value })
  },

  handleSetupCancel() {
    this.setData({ showFirstSetup: false })
    wx.navigateBack({ delta: 1 })
  },

  async handleSetupConfirm() {
    const form = this.data.setupForm
    if (!form.workStartDate) return utils.showToast({ title: '请选择参加工作日期', icon: 'none' })
    if (!form.arrivalDate) return utils.showToast({ title: '请选择到任日期', icon: 'none' })
    if (form.initialAnnualRemaining === '' || isNaN(Number(form.initialAnnualRemaining))) {
      return utils.showToast({ title: '请填写剩余年休假天数', icon: 'none' })
    }
    if (form.initialTermRemaining === '' || isNaN(Number(form.initialTermRemaining))) {
      return utils.showToast({ title: '请填写剩余任期假次数', icon: 'none' })
    }

    this.setData({ setupSubmitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'initSetup',
          params: {
            workStartDate: form.workStartDate,
            arrivalDate: form.arrivalDate,
            initialAnnualRemaining: Number(form.initialAnnualRemaining),
            initialTermRemaining: Number(form.initialTermRemaining)
          }
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '配置成功', icon: 'success' })
        const quota = res.result.data
        this.setData({
          myQuota: quota,
          showFirstSetup: false,
          setupSubmitting: false,
          availableTermRounds: this.buildAvailableTermRounds(quota),
          setupForm: { workStartDate: '', arrivalDate: '', initialAnnualRemaining: '', initialTermRemaining: '' }
        })
      } else {
        utils.showToast({ title: res.result.message || '配置失败', icon: 'none' })
      }
    } catch (error) {
      console.error('首次配置失败:', error)
      utils.showToast({ title: '配置失败，请重试', icon: 'none' })
    } finally {
      this.setData({ setupSubmitting: false })
    }
  },

  stopPropagation() {},

  // ==================== Tab切换 ====================

  handleTabSwitch(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })

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

  // ==================== 休假类型选择 ====================

  handleLeaveTypeSelect(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      'form.leaveType': value,
      // 重置日期和计算
      calculatedDays: { totalDays: 0, workDays: 0, termTotalDays: 0, comboHint: '' },
      // 重置任期假特有字段
      'form.termLeaveRound': null,
      'form.isReturnToHome': false
    })

    // 更新余额提示
    this.updateQuotaDisplay(value)

    // 如果是其他类型，重置otherTypeName
    if (value !== 'other') {
      this.setData({ 'form.otherTypeName': '' })
    }

    // 重新触发天数计算（如果已有日期）
    if (this.data.form.startDate && this.data.form.endDate) {
      this.recalcDaysPreview()
    }
  },

  // ==================== 日期选择处理 ====================

  handleStartDateChange(e) {
    this.setData({ 'form.startDate': e.detail.value })
    if (e.detail.value > this.data.form.endDate) {
      this.setData({ 'form.endDate': e.detail.value })
    }
    this.recalcDaysPreview()
  },

  handleEndDateChange(e) {
    this.setData({ 'form.endDate': e.detail.value })
    this.recalcDaysPreview()
  },

  /** 调用云函数计算天数预览 */
  async recalcDaysPreview() {
    const { leaveType, startDate, endDate, isReturnToHome } = this.data.form
    if (!startDate || !endDate || !leaveType) {
      this.setData({ calculatedDays: { totalDays: 0, workDays: 0, termTotalDays: 0, comboHint: '' } })
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'calculateDays',
          params: { leaveType, startDate, endDate, isReturnToHome }
        }
      })

      if (res.result.code === 0) {
        const calcData = res.result.data
        this.setData({ calculatedDays: calcData })
        // 同时更新余额警告
        this.updateQuotaWarning(calcData)
      }
    } catch (err) {
      console.error('天数计算失败:', err)
    }
  },

  // ==================== 任期假选项 ====================

  handleSwitchReturnToHome(e) {
    this.setData({ 'form.isReturnToHome': e.detail.value })
    this.recalcDaysPreview()
  },

  handleTermRoundSelect(e) {
    this.setData({ 'form.termLeaveRound': e.currentTarget.dataset.round })
  },

  // ==================== 扩展表单字段 ====================

  handleExpenseTypeSelect(e) {
    this.setData({ 'form.expenseType': e.currentTarget.dataset.value })
    // 关闭公费待遇转让
    if (e.currentTarget.dataset.value === 'self') {
      this.setData({ 'form.isTransferringBenefit': false, 'form.transferredCount': 0 })
    }
  },

  handleOtherTypeNameInput(e) {
    this.setData({ 'form.otherTypeName': e.detail.value })
  },

  handleLeaveLocationInput(e) {
    this.setData({ 'form.leaveLocation': e.detail.value })
  },

  handleLeaveRouteInput(e) {
    this.setData({ 'form.leaveRoute': e.detail.value })
  },

  handleProposedFlightsInput(e) {
    this.setData({ 'form.proposedFlights': e.detail.value })
  },

  handleSwitchTransferringBenefit(e) {
    this.setData({ 'form.isTransferringBenefit': e.detail.value })
    if (!e.detail.value) {
      this.setData({ 'form.transferredCount': 0 })
    }
  },

  handleTransferredCountChange(e) {
    this.setData({ 'form.transferredCount': e.detail.value })
  },

  handleSwitchVisaAssistance(e) {
    this.setData({ 'form.needsVisaAssistance': e.detail.value })
  },

  handleOtherNotesInput(e) {
    this.setData({ 'form.otherNotes': e.detail.value })
  },

  handleReasonInput(e) {
    this.setData({ 'form.reason': e.detail.value })
  },

  // ==================== 配额显示逻辑 ====================

  updateQuotaDisplay(leaveType) {
    const quota = this.data.myQuota
    if (!quota) {
      this.setData({ quotaHintText: '暂无配额信息' })
      return
    }

    switch (leaveType) {
      case 'annual':
      case 'combo_annual_term':
      case 'combo_term_annual': {
        let available = 0
        let total = 0
        if (quota.annualLeaves) {
          quota.annualLeaves.forEach(a => {
            if (a.status === 'active') {
              available += (a.availableDays || 0)
              total += a.totalDays
            }
          })
        }
        this.setData({
          quotaHintText: '年休假余额',
          quotaDisplayAvailable: `${available}天`,
          quotaDisplayTotal: `年度总计${total}天`
        })
        break
      }
      case 'term': {
        const used = quota.totalTermUsed || 0
        const total = TERM_LEAVE_RULES_COUNT || 5
        this.setData({
          quotaHintText: '任期假可用次数',
          quotaDisplayAvailable: `${total - used}次`,
          quotaDisplayTotal: `共${total}次（每期${TERM_LEAVE_DAYS_PER_ROUND}天，回国+${TERM_LEAVE_RETURN_BONUS_DAYS}天）`
        })
        break
      }
      case 'holiday':
      case 'other':
        this.setData({
          quotaHintText: '此类型不占用配额',
          quotaDisplayAvailable: '-',
          quotaDisplayTotal: ''
        })
        break
      default:
        this.setData({ quotaHintText: '', quotaDisplayAvailable: '', quotaDisplayTotal: '' })
    }
  },

  updateQuotaWarning(calcData) {
    const { leaveType } = this.data.form
    const quota = this.data.myQuota
    let warning = ''
    let overLimit = false

    if (!quota) return

    if ((leaveType === 'annual' || leaveType === 'combo_annual_term') && calcData.workDays > 0) {
      let availableAnnual = 0
      if (quota.annualLeaves) {
        quota.annualLeaves.forEach(a => {
          if (a.status === 'active') availableAnnual += (a.availableDays || 0)
        })
      }
      if (calcData.workDays > availableAnnual) {
        warning = `不符合休假天数：年休假不足${calcData.workDays - availableAnnual}天`
        overLimit = true
      }
    }

    if (leaveType === 'term' && this.data.availableTermRounds.length === 0) {
      warning = '不符合休假次数：无可用任期假'
      overLimit = true
    }

    this.setData({ quotaWarning: warning, quotaOverLimit: overLimit })
  },

  async loadMyQuotas() {
    try {
      const res = await wx.cloud.callFunction({ name: 'leaveManager', data: { action: 'getMyQuotas' } })
      if (res.result.code === 0) {
        const quota = res.result.data
        this.setData({
          myQuota: quota,
          availableTermRounds: this.buildAvailableTermRounds(quota)
        })
        if (this.data.form.leaveType) {
          this.updateQuotaDisplay(this.data.form.leaveType)
        }
      }
    } catch (e) { console.error('加载配额失败:', e) }
  },

  // ==================== 提交申请 ====================

  validateApplicationForm() {
    const f = this.data.form
    if (!f.leaveType) { utils.showToast({ title: '请选择休假类型', icon: 'none' }); return false; }
    if (!f.startDate) { utils.showToast({ title: '请选择开始日期', icon: 'none' }); return false; }
    if (!f.endDate) { utils.showToast({ title: '请选择结束日期', icon: 'none' }); return false; }
    if (f.leaveType === 'term' || f.leaveType === 'combo_annual_term' || f.leaveType === 'combo_term_annual') {
      if (!f.termLeaveRound) { utils.showToast({ title: '请选择第几次任期假', icon: 'none' }); return false; }
    }
    if (f.leaveType === 'other' && !String(f.otherTypeName || '').trim()) {
      utils.showToast({ title: '请输入自定义类型名', icon: 'none' }); return false;
    }
    if (!String(f.reason || '').trim()) { utils.showToast({ title: '请填写休假原因', icon: 'none' }); return false; }
    if (this.data.quotaOverLimit) { utils.showToast({ title: '不符合休假天数', icon: 'none' }); return false; }
    return true;
  },

  async handleSubmitApplication() {
    if (this.data.submitting) return
    if (!this.validateApplicationForm()) return

    const f = this.data.form
    this.setData({ submitting: true })

    try {
      const submitParams = { ...f }
      submitParams.totalDays = this.data.calculatedDays.totalDays
      submitParams.workDays = this.data.calculatedDays.workDays

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
              // 重置表单
              this.resetForm()
              // 切换到记录tab
              this.setData({ activeTab: 'records' }, () => {
                this.loadRecordData(true)
              })
            }
          }
        })
      } else {
        utils.showToast({ title: res.result.message || '提交失败', icon: 'none' })
      }
    } catch (error) {
      console.error('提交申请失败:', error)
      utils.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  resetForm() {
    this.setData({
      form: {
        leaveType: '', startDate: '', endDate: '', isReturnToHome: false,
        termLeaveRound: null, otherTypeName: '', expenseType: 'public',
        leaveLocation: '', leaveRoute: '', proposedFlights: '',
        isTransferringBenefit: false, transferredCount: 0,
        needsVisaAssistance: false, otherNotes: '', reason: ''
      },
      calculatedDays: { totalDays: 0, workDays: 0, termTotalDays: 0, comboHint: '' },
      quotaWarning: '', quotaOverLimit: false
    })
  },

  // ==================== 记录列表（分页）====================

  async loadData(params) {
    const { page, pageSize } = params
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'leaveManager',
        data: { action: 'getMyRecords', params: { page, pageSize } }
      }).then(res => {
        if (res.result.code === 0) {
          const data = res.result.data
          const recordList = (data.list || []).map(item => this.formatRecordItem(item))
          this.setData({
            recordList: page === 1 ? recordList : [...this.data.recordList, ...recordList],
            list: page === 1 ? recordList : [...this.data.list, ...recordList]
          })
          this.updateGroupedRecords()

          resolve({ data: recordList, hasMore: data.hasMore !== false })
        } else {
          reject(new Error(res.result.message))
        }
      }).catch(error => {
        console.error('加载记录失败:', error)
        utils.showToast({ title: '加载失败', icon: 'none' })
        reject(error)
      })
    })
  },

  formatRecordItem(item) {
    const createdAt = new Date(item.createdAt)
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
    wx.showLoading({ title: '加载中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: { action: 'getRecordDetail', params: { recordId: record._id } }
      })

      if (res.result.code === 0) {
        const actionTextMap = app.getConstantSync('WORKFLOW_ACTION_TEXT') || {}
        const logs = (res.result.data.logs || []).map(log => ({
          ...log,
          timeText: log.createdAt ? utils.formatDateTime(log.createdAt) : '-',
          actionText: actionTextMap[log.action] || log.action
        }))

        const startLog = logs.find(l => l.action === 'start')
        const submittedAtText = startLog
          ? startLog.timeText
          : (record.createdAt ? utils.formatDateTime(record.createdAt) : '-')

        this.setData({
          selectedRecord: res.result.data,
          detailLogs: logs,
          submittedAtText,
          showDetailPopup: true
        })
      }
    } catch (error) {
      console.error('获取详情失败:', error)
      utils.showToast({ title: '获取详情失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  hideDetailPopup() { this.setData({ showDetailPopup: false }) },

  hideQuotaPopup() { this.setData({ showQuotaPopup: false }) },

  showQuotaDetail() {
    if (this.data.myQuota) {
      this.setData({ quotaDetail: this.data.myQuota, showQuotaPopup: true })
    }
  },

  // ==================== 补填记录 ====================

  showSupplementPopup() {
    this.setData({
      showSupplementPopup: true,
      supplementForm: {
        startDate: '',
        endDate: '',
        supplementType: '',
        expenseType: 'self',
        leaveLocation: '',
        remark: ''
      }
    })
  },

  hideSupplementPopup() { this.setData({ showSupplementPopup: false }) },

  handleSupplementStartChange(e) { this.setData({ 'supplementForm.startDate': e.detail.value }) },
  handleSupplementEndChange(e) { this.setData({ 'supplementForm.endDate': e.detail.value }) },
  handleSupplementTypeSelect(e) { this.setData({ 'supplementForm.supplementType': e.currentTarget.dataset.value }) },
  handleSupplementExpenseSelect(e) { this.setData({ 'supplementForm.expenseType': e.currentTarget.dataset.value }) },
  handleSupplementLocationInput(e) { this.setData({ 'supplementForm.leaveLocation': e.detail.value }) },
  handleSupplementRemarkInput(e) { this.setData({ 'supplementForm.remark': e.detail.value }) },

  async handleSubmitSupplement() {
    const sf = this.data.supplementForm
    if (!sf.startDate || !sf.endDate) { return utils.showToast({ title: '请选择休假日期', icon: 'none' }) }
    if (!sf.supplementType) { return utils.showToast({ title: '请选择假期构成', icon: 'none' }) }

    this.setData({ supplementSubmitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'leaveManager',
        data: {
          action: 'supplementRecord',
          params: sf
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '补填成功', icon: 'success' })
        this.hideSupplementPopup()
        // 刷新记录列表
        this.loadRecordData(true)
        // 刷新配额
        this.loadMyQuotas()
      } else {
        utils.showToast({ title: res.result.message || '补填失败', icon: 'none' })
      }
    } catch (error) {
      console.error('补填失败:', error)
      utils.showToast({ title: '补填失败，请重试', icon: 'none' })
    } finally {
      this.setData({ supplementSubmitting: false })
    }
  }
})

// 本地常量
const TERM_LEAVE_RULES_COUNT = 5
const TERM_LEAVE_DAYS_PER_ROUND = 20
