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

// 职别→购车标准映射常量
const POSITION_CAR_STANDARD_MAP = [
  { position: '副司级以上，副师职以上武官', carStandard: 45000, carMinStandard: 27000, carSubsidy: 6380 },
  { position: '处级，文职武官、副师职副武官', carStandard: 41000, carMinStandard: 24600, carSubsidy: 5860 },
  { position: '一秘、二秘', carStandard: 36000, carMinStandard: 21600, carSubsidy: 5100 },
  { position: '三秘、随员、职员、试用期人员', carStandard: 31000, carMinStandard: 18600, carSubsidy: 4330 },
  { position: '工勤人员', carStandard: 23000, carMinStandard: 6900, carSubsidy: 3310 }
]

const POSITION_OPTIONS = POSITION_CAR_STANDARD_MAP.map(item => item.position)

Page({
  behaviors: [paginationBehavior],

  data: {
    loading: false,
    submitting: false,
    uploading: false,
    exporting: false,

    // Tab 切换
    currentTab: 'mine',       // mine | manage
    isOfficeStaff: false,     // 是否办公室人员

    // 弹窗控制
    showFormPopup: false,
    showDetailPopup: false,
    showStepEditPopup: false,
    showTypeSelector: false,
    showPurchaseAppForm: false,
    showPurchaseLoanForm: false,

    // 数据列表
    recordList: [],

    // 选中的记录和详情
    selectedRecord: null,
    detailData: null,

    // 表单数据（购车流程）
    form: {
      carModel: ''
    },

    // 馆内购车申请表单数据
    purchaseAppForm: {
      arrivalDate: '',
      termMonths: 48,
      position: '',
      positionIndex: -1,
      carStandard: 0,
      carMinStandard: 0,
      carSubsidy: 0,
      plannedPurchaseDate: '',
      saleCompany: '',
      brand: '',
      specModel: '',
      displacement: '',
      isNewCar: true,
      usedTime: '',
      usedMileage: '',
      priceWithShipping: '',
      priceInUSD: '',
      isApplyLoan: false
    },

    // 职别选项
    positionOptions: POSITION_OPTIONS,

    // 馆内购车借款申请表单数据
    purchaseLoanForm: {
      arrivalDate: '',
      position: '',
      positionIndex: -1,
      carSubsidy: 0,
      termMonths: 48,
      totalSubsidy: 0,
      carModel: '',
      priceInUSD: '',
      exchangeRate: '',
      isFirstResident: true,
      borrowableAmount: 0,
      requestedAmount: ''
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
    const fontStyle = app.globalData.fontStyle
  if (this.data.fontStyle !== fontStyle) {
    this.setData({ fontStyle })
  }
    if (!this.data.showFormPopup && !this.data.showDetailPopup && !this.data.showStepEditPopup && !this.data.showPurchaseAppForm && !this.data.showPurchaseLoanForm && !this.data.showTypeSelector) {
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
    const recordType = item.type || 'purchase_process'
    const isProcess = recordType === 'purchase_process'
    const isApplication = recordType === 'purchase_application'
    const isLoan = recordType === 'purchase_loan'

    let statusText = ''
    let statusColor = '#0891B2'

    if (isProcess) {
      statusText = item.status === 'completed' ? '已完成' : `G${item.currentGroup}-${item.currentGroupName || ''}`
      statusColor = item.status === 'completed' ? '#16A34A' : '#0891B2'
    } else if (isApplication || isLoan) {
      const statusMap = {
        'pending_approval': { text: '待审批', color: '#D97706' },
        'approved': { text: '已通过', color: '#16A34A' },
        'rejected': { text: '已驳回', color: '#DC2626' },
        'workflow_failed': { text: '审批异常', color: '#DC2626' },
        'terminated': { text: '已中止', color: '#DC2626' }
      }
      const mapped = statusMap[item.status] || { text: item.status, color: '#64748B' }
      statusText = mapped.text
      statusColor = mapped.color
    }

    return {
      ...item,
      type: recordType,
      carModel: item.carModel || item.brand || '',
      createdAtText: item.createdAt ? utils.formatDateTime(item.createdAt) : '',
      updatedAtText: item.updatedAt ? utils.formatRelativeTime(item.updatedAt) : '',
      statusText,
      statusColor
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
    this.setData({ showTypeSelector: true })
  },

  hideTypeSelector() {
    this.setData({ showTypeSelector: false })
  },

  handleTypeSelect(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ showTypeSelector: false })

    if (type === 'purchase_process') {
      // 原有购车流程
      this.setData({
        showFormPopup: true,
        form: { carModel: '' }
      })
    } else if (type === 'purchase_application') {
      // 馆内购车申请
      this.setData({
        showPurchaseAppForm: true,
        purchaseAppForm: {
          arrivalDate: '',
          termMonths: 48,
          position: '',
          positionIndex: -1,
          carStandard: 0,
          carMinStandard: 0,
          carSubsidy: 0,
          plannedPurchaseDate: '',
          saleCompany: '',
          brand: '',
          specModel: '',
          displacement: '',
          isNewCar: true,
          usedTime: '',
          usedMileage: '',
          priceWithShipping: '',
          priceInUSD: '',
          isApplyLoan: false
        }
      })
    } else if (type === 'purchase_loan') {
      // 馆内购车借款申请
      this.setData({
        showPurchaseLoanForm: true,
        purchaseLoanForm: {
          arrivalDate: '',
          position: '',
          positionIndex: -1,
          carSubsidy: 0,
          termMonths: 48,
          totalSubsidy: 0,
          carModel: '',
          priceInUSD: '',
          exchangeRate: '',
          isFirstResident: true,
          borrowableAmount: 0,
          requestedAmount: ''
        }
      })
    }
  },

  hideFormPopup() {
    this.setData({ showFormPopup: false })
  },

  hidePurchaseAppForm() {
    this.setData({ showPurchaseAppForm: false })
  },

  hidePurchaseLoanForm() {
    this.setData({ showPurchaseLoanForm: false })
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

  // ========== 馆内购车申请表单事件 ==========

  handleArrivalDateChange(e) {
    this.setData({ 'purchaseAppForm.arrivalDate': e.detail.value })
  },

  handleTermMonthsMinus() {
    const current = this.data.purchaseAppForm.termMonths
    if (current > 6) {
      this.setData({ 'purchaseAppForm.termMonths': current - 6 })
    }
  },

  handleTermMonthsPlus() {
    const current = this.data.purchaseAppForm.termMonths
    if (current < 96) {
      this.setData({ 'purchaseAppForm.termMonths': current + 6 })
    }
  },

  handlePositionChange(e) {
    const index = Number(e.detail.value)
    const position = POSITION_OPTIONS[index]
    const standardItem = POSITION_CAR_STANDARD_MAP[index]
    this.setData({
      'purchaseAppForm.position': position,
      'purchaseAppForm.positionIndex': index,
      'purchaseAppForm.carStandard': standardItem.carStandard,
      'purchaseAppForm.carMinStandard': standardItem.carMinStandard,
      'purchaseAppForm.carSubsidy': standardItem.carSubsidy
    })
  },

  handlePlannedPurchaseDateChange(e) {
    this.setData({ 'purchaseAppForm.plannedPurchaseDate': e.detail.value })
  },

  handleSaleCompanyInput(e) {
    this.setData({ 'purchaseAppForm.saleCompany': e.detail.value })
  },

  handleBrandInput(e) {
    this.setData({ 'purchaseAppForm.brand': e.detail.value })
  },

  handleSpecModelInput(e) {
    this.setData({ 'purchaseAppForm.specModel': e.detail.value })
  },

  handleDisplacementInput(e) {
    this.setData({ 'purchaseAppForm.displacement': e.detail.value })
  },

  handleIsNewCarChange(e) {
    const isNewCar = e.detail.value
    this.setData({
      'purchaseAppForm.isNewCar': isNewCar,
      'purchaseAppForm.usedTime': isNewCar ? '无' : '',
      'purchaseAppForm.usedMileage': isNewCar ? '无' : ''
    })
  },

  handleUsedTimeInput(e) {
    this.setData({ 'purchaseAppForm.usedTime': e.detail.value })
  },

  handleUsedMileageInput(e) {
    this.setData({ 'purchaseAppForm.usedMileage': e.detail.value })
  },

  handlePriceWithShippingInput(e) {
    this.setData({ 'purchaseAppForm.priceWithShipping': e.detail.value })
  },

  handlePriceInUSDInput(e) {
    this.setData({ 'purchaseAppForm.priceInUSD': e.detail.value })
  },

  handleIsApplyLoanChange(e) {
    this.setData({ 'purchaseAppForm.isApplyLoan': e.detail.value })
  },

  validatePurchaseAppForm() {
    const f = this.data.purchaseAppForm
    if (!f.arrivalDate) { utils.showToast({ title: '请选择到馆日期', icon: 'none' }); return false }
    if (f.positionIndex < 0) { utils.showToast({ title: '请选择职别', icon: 'none' }); return false }
    if (!f.plannedPurchaseDate) { utils.showToast({ title: '请选择拟购车日期', icon: 'none' }); return false }
    if (!String(f.brand || '').trim()) { utils.showToast({ title: '请填写品牌', icon: 'none' }); return false }
    if (!f.isNewCar && !String(f.usedTime || '').trim()) { utils.showToast({ title: '请填写已行驶时间', icon: 'none' }); return false }
    if (!f.isNewCar && !String(f.usedMileage || '').trim()) { utils.showToast({ title: '请填写已行驶里程', icon: 'none' }); return false }
    return true
  },

  async submitPurchaseApplication() {
    if (this.data.submitting) return
    if (!this.validatePurchaseAppForm()) return

    this.setData({ submitting: true })

    try {
      const f = this.data.purchaseAppForm
      const res = await wx.cloud.callFunction({
        name: 'carPurchase',
        data: {
          action: 'createPurchaseApplication',
          arrivalDate: f.arrivalDate,
          termMonths: f.termMonths,
          position: f.position,
          plannedPurchaseDate: f.plannedPurchaseDate,
          saleCompany: f.saleCompany,
          brand: f.brand,
          specModel: f.specModel,
          displacement: f.displacement,
          isNewCar: f.isNewCar,
          usedTime: f.usedTime,
          usedMileage: f.usedMileage,
          priceWithShipping: f.priceWithShipping,
          priceInUSD: f.priceInUSD,
          isApplyLoan: f.isApplyLoan
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '申请已提交', icon: 'success' })
        this.setData({ showPurchaseAppForm: false })
        await this.refreshList()
      } else {
        utils.showToast({ title: res.result.message || '提交失败', icon: 'none' })
      }
    } catch (error) {
      console.error('提交馆内购车申请失败:', error)
      utils.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ========== 馆内购车借款申请表单事件 ==========

  /** 重算借款申请的 totalSubsidy 和 borrowableAmount */
  _recalcLoanForm(f) {
    const _carSubsidy = Number(f.carSubsidy) || 0
    const _termMonths = Number(f.termMonths) || 0
    const _priceInUSD = Number(f.priceInUSD) || 0
    const _exchangeRate = Number(f.exchangeRate) || 0
    const _isFirstResident = f.isFirstResident

    const totalSubsidy = _carSubsidy * _termMonths

    let borrowableAmount = 0
    if (_priceInUSD > 0 && _exchangeRate > 0) {
      if (_isFirstResident) {
        borrowableAmount = Math.min(_priceInUSD * 0.85, totalSubsidy / _exchangeRate)
      } else {
        borrowableAmount = Math.min(_priceInUSD * 0.50, totalSubsidy * 0.60 / _exchangeRate)
      }
      borrowableAmount = Math.round(borrowableAmount * 100) / 100
    }

    this.setData({
      'purchaseLoanForm.totalSubsidy': totalSubsidy,
      'purchaseLoanForm.borrowableAmount': borrowableAmount
    })
  },

  handleLoanArrivalDateChange(e) {
    this.setData({ 'purchaseLoanForm.arrivalDate': e.detail.value })
  },

  handleLoanTermMonthsMinus() {
    const current = this.data.purchaseLoanForm.termMonths
    if (current > 6) {
      this.setData({ 'purchaseLoanForm.termMonths': current - 1 })
      this._recalcLoanForm({ ...this.data.purchaseLoanForm, termMonths: current - 1 })
    }
  },

  handleLoanTermMonthsPlus() {
    const current = this.data.purchaseLoanForm.termMonths
    if (current < 96) {
      this.setData({ 'purchaseLoanForm.termMonths': current + 1 })
      this._recalcLoanForm({ ...this.data.purchaseLoanForm, termMonths: current + 1 })
    }
  },

  handleLoanPositionChange(e) {
    const index = Number(e.detail.value)
    const position = POSITION_OPTIONS[index]
    const standardItem = POSITION_CAR_STANDARD_MAP[index]
    const updateData = {
      'purchaseLoanForm.position': position,
      'purchaseLoanForm.positionIndex': index,
      'purchaseLoanForm.carSubsidy': standardItem.carSubsidy
    }
    this.setData(updateData)
    this._recalcLoanForm({ ...this.data.purchaseLoanForm, carSubsidy: standardItem.carSubsidy })
  },

  handleLoanCarModelInput(e) {
    this.setData({ 'purchaseLoanForm.carModel': e.detail.value })
  },

  handleLoanPriceInUSDInput(e) {
    this.setData({ 'purchaseLoanForm.priceInUSD': e.detail.value })
    this._recalcLoanForm({ ...this.data.purchaseLoanForm, priceInUSD: e.detail.value })
  },

  handleLoanExchangeRateInput(e) {
    this.setData({ 'purchaseLoanForm.exchangeRate': e.detail.value })
    this._recalcLoanForm({ ...this.data.purchaseLoanForm, exchangeRate: e.detail.value })
  },

  handleLoanIsFirstResidentChange(e) {
    const isFirstResident = e.detail.value
    this.setData({ 'purchaseLoanForm.isFirstResident': isFirstResident })
    this._recalcLoanForm({ ...this.data.purchaseLoanForm, isFirstResident })
  },

  handleLoanRequestedAmountInput(e) {
    this.setData({ 'purchaseLoanForm.requestedAmount': e.detail.value })
  },

  validatePurchaseLoanForm() {
    const f = this.data.purchaseLoanForm
    if (!f.arrivalDate) { utils.showToast({ title: '请选择赴任日期', icon: 'none' }); return false }
    if (f.positionIndex < 0) { utils.showToast({ title: '请选择职别', icon: 'none' }); return false }
    if (!String(f.carModel || '').trim()) { utils.showToast({ title: '请填写拟购车型号', icon: 'none' }); return false }
    if (!Number(f.priceInUSD) || Number(f.priceInUSD) <= 0) { utils.showToast({ title: '请填写拟购车价格', icon: 'none' }); return false }
    if (!Number(f.exchangeRate) || Number(f.exchangeRate) <= 0) { utils.showToast({ title: '请填写美元人民币比价', icon: 'none' }); return false }
    if (!Number(f.requestedAmount) || Number(f.requestedAmount) <= 0) { utils.showToast({ title: '请填写拟借金额', icon: 'none' }); return false }
    if (f.borrowableAmount > 0 && Number(f.requestedAmount) > f.borrowableAmount) { utils.showToast({ title: `拟借金额不能超过可借金额(${f.borrowableAmount})`, icon: 'none' }); return false }
    return true
  },

  async submitPurchaseLoan() {
    if (this.data.submitting) return
    if (!this.validatePurchaseLoanForm()) return

    this.setData({ submitting: true })

    try {
      const f = this.data.purchaseLoanForm
      const res = await wx.cloud.callFunction({
        name: 'carPurchase',
        data: {
          action: 'createPurchaseLoan',
          arrivalDate: f.arrivalDate,
          position: f.position,
          termMonths: f.termMonths,
          carModel: f.carModel,
          priceInUSD: f.priceInUSD,
          exchangeRate: f.exchangeRate,
          isFirstResident: f.isFirstResident,
          requestedAmount: f.requestedAmount
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '借款申请已提交', icon: 'success' })
        this.setData({ showPurchaseLoanForm: false })
        await this.refreshList()
      } else {
        utils.showToast({ title: res.result.message || '提交失败', icon: 'none' })
      }
    } catch (error) {
      console.error('提交购车借款申请失败:', error)
      utils.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ========== 详情查看 ==========

  async showRecordDetail(e) {
    const record = e.currentTarget.dataset.record
    if (!record || !record._id) return

    const recordType = record.type || 'purchase_process'

    wx.showLoading({ title: '加载中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'carPurchase',
        data: { action: 'getDetail', recordId: record._id }
      })

      if (res.result.code === 0) {
        const detail = res.result.data
        if (detail.type === 'purchase_application' || detail.type === 'purchase_loan') {
          // 馆内购车申请详情
          this.setData({
            selectedRecord: record,
            detailData: detail,
            showDetailPopup: true
          })
        } else {
          // 购车流程详情（原有逻辑）
          this.setData({
            selectedRecord: record,
            detailData: this.formatDetailData(detail),
            showDetailPopup: true
          })
        }
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

  stopPropagation() { },

  // ========== 导出PDF ==========

  async handleExportPdf() {
    if (this.data.exporting) return
    if (!this.data.detailData || !this.data.detailData.orderId) {
      utils.showToast({ title: '无法导出，缺少工单信息', icon: 'none' })
      return
    }

    this.setData({ exporting: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'generateOrderPdf',
        data: { orderId: this.data.detailData.orderId }
      })

      if (res.result.code === 0) {
        const fileUrl = res.result.data.fileUrl
        const fileName = res.result.data.fileName

        wx.showLoading({ title: '正在打开文件...' })
        const downloadResult = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url: fileUrl,
            success: resolve,
            fail: reject
          })
        })

        wx.hideLoading()

        if (downloadResult.statusCode === 200) {
          wx.openDocument({
            filePath: downloadResult.tempFilePath,
            fileName: fileName,
            fileType: 'pdf',
            showMenu: true,
            success: () => { console.log('PDF打开成功') },
            fail: (err) => {
              console.error('打开PDF失败:', err)
              utils.showToast({ title: '打开文件失败', icon: 'none' })
            }
          })
        } else {
          utils.showToast({ title: '下载文件失败', icon: 'none' })
        }
      } else {
        utils.showToast({ title: res.result.message || '导出失败', icon: 'none' })
      }
    } catch (error) {
      console.error('导出PDF失败:', error)
      utils.showToast({ title: '导出失败，请重试', icon: 'none' })
    } finally {
      this.setData({ exporting: false })
    }
  },

  // ========== 中止购车记录 ==========
  async terminateRecord(e) {

    const recordId = e.currentTarget.dataset.recordId
    if (!recordId) return

    const confirm = await new Promise(resolve => {
      wx.showModal({
        title: '确认中止',
        content: '中止后将停止审批流程，不可恢复，确定？',
        confirmText: '中止',
        confirmColor: '#DC2626',
        success(res) {
          resolve(res.confirm)
        }
      })
    })

    if (!confirm) return

    this.hideDetailPopup()
    wx.showLoading({ title: '中止中...' })
    try {
      // 优先中止工作流工单（workflowEngine 会自动更新 car_purchase_records 状态）
      if (this.data.detailData && this.data.detailData.orderId) {
        await wx.cloud.callFunction({
          name: 'workflowEngine',
          data: {
            action: 'terminateOrder',
            orderId: this.data.detailData.orderId,
            reason: '申请人主动中止'
          }
        })
      } else {
        // 无关联工单时，仅更新记录状态
        await wx.cloud.callFunction({
          name: 'carPurchase',
          data: { action: 'terminateRecord', recordId }
        })
      }
      utils.showToast({ title: '已中止', icon: 'success' })
      await this.refreshList()
    } catch (error) {
      console.error('中止失败:', error)
      utils.showToast({ title: '中止失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
  // ========== 删除购车记录 ==========

  async deleteRecord(e) {
    const recordId = e.currentTarget.dataset.recordId
    if (!recordId) return

    const confirm = await new Promise(resolve => {
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复，确定要删除该条购车记录吗？',
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
      // 优先中止工作流工单（workflowEngine 会自动更新 car_purchase_records 状态）
      if (this.data.detailData && this.data.detailData.orderId) {
        await wx.cloud.callFunction({
          name: 'workflowEngine',
          data: {
            action: 'terminateOrder',
            orderId: this.data.detailData.orderId,
            reason: '申请人主动中止'
          }
        })
      } else {
        await wx.cloud.callFunction({
          name: 'carPurchase',
          data: { action: 'deleteRecord', recordId }
        })
      }
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
