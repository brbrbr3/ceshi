/**
 * 护照管理页面
 * 
 * Tab页：
 * - 护照借出：用户申请和查看记录
 * - 待借护照（管理员）：查看已批准待借出申请
 * - 在借护照（管理员）：查看在借护照
 * - 护照信息维护：用户填写护照信息
 */
const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

Page({
  behaviors: [paginationBehavior],

  data: {
    // Tab相关
    activeTab: 'borrow',
    isAdmin: false,
    
    // 加载状态
    loading: false,
    submitting: false,
    operating: false,
    
    // 弹窗控制
    showFormPopup: false,
    showDetailPopup: false,
    showApprovedPopup: false,
    showBorrowedPopup: false,
    showInfoFormPopup: false,
    
    // 数据列表
    borrowedRecords: [], // 当前在借记录（Tab 1）
    recordList: [], // 申请记录列表（Tab 1）
    groupedRecords: [], // 按月分组的记录（Tab 1）
    approvedList: [], // 待借护照列表（Tab 2）
    borrowedList: [], // 在借护照列表（Tab 3）
    passportInfoList: [], // 护照信息列表（Tab 4）
    
    // 选中的记录
    selectedRecord: null, // 普通用户查看详情
    selectedApproved: null, // 管理员待借详情
    selectedBorrowed: null, // 管理员在借详情
    
    // 表单数据
    form: {
      borrowerNames: '',
      borrowDate: '',
      expectedReturnDate: '',
      reason: ''
    },
    
    // 护照信息表单
    passportForm: {
      ownerName: '',
      gender: '男',
      passportNo: '',
      issueDate: '',
      expiryDate: ''
    },
    isEditMode: false, // 是否编辑模式
    editingPassportId: null, // 正在编辑的护照ID
    
    // 日期选择器限制
    minDate: '',
    maxDate: '',
    maxReturnDate: ''
  },

  async onLoad() {
    // 初始化分页配置
    this.initPagination({
      initialPageSize: 10,
      loadMorePageSize: 10
    })

    // 初始化日期
    this.initDatePickers()
    
    // 检查管理员权限
    await this.checkAdminPermission()
  },

  async onShow() {
    const fontStyle = app.globalData.fontStyle
  if (this.data.fontStyle !== fontStyle) {
    this.setData({ fontStyle })
  }
    wx.showLoading({ title: '加载中...', mask: true })

    try {
      await this.loadCurrentTabData()
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 初始化日期选择器
   */
  initDatePickers() {
    const today = new Date()
    const todayStr = this.formatDate(today)
    
    // 最大借用日期：今天
    // 最大归还日期：3个月后
    const maxReturn = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
    
    this.setData({
      minDate: todayStr,
      maxDate: todayStr,
      maxReturnDate: this.formatDate(maxReturn),
      'form.borrowDate': todayStr
    })
  },

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 检查管理员权限
   */
  async checkAdminPermission() {
    try {
      const result = await app.checkUserRegistration()
      if (result.registered && result.user) {
        const user = result.user
        const isAdmin = user.isAdmin || user.role === '管理员'
        this.setData({ isAdmin })
      }
    } catch (error) {
      console.error('检查权限失败:', error)
    }
  },

  /**
   * 加载当前Tab数据
   */
  async loadCurrentTabData() {
    const activeTab = this.data.activeTab
    
    switch (activeTab) {
      case 'borrow':
        await Promise.all([
          this.loadPassportStatus(),
          this.refreshList()
        ])
        break
      case 'approved':
        await this.loadApprovedList()
        break
      case 'borrowed':
        await this.loadBorrowedList()
        break
      case 'info':
        await this.loadPassportInfoList()
        break
    }
  },

  /**
   * Tab切换
   */
  async handleTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    
    // 清空列表数据
    this.setData({
      activeTab: tab,
      loading: true,
      recordList: [],
      groupedRecords: [],
      approvedList: [],
      borrowedList: [],
      passportInfoList: []
    })
    
    wx.showLoading({ title: '加载中...', mask: true })
    
    try {
      await this.loadCurrentTabData()
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },

  /**
   * 加载护照借用状态
   */
  async loadPassportStatus() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'getMyPassportStatus'
        }
      })

      if (res.result.code === 0) {
        const borrowedRecords = (res.result.data.borrowedRecords || []).map(item => ({
          ...item,
          borrowDateText: item.borrowDate || '',
          expectedReturnDate: item.expectedReturnDate || '',
          borrowerNamesText: (item.borrowerNames || []).join('、')
        }))
        
        this.setData({ borrowedRecords })
      }
    } catch (error) {
      console.error('获取护照状态失败:', error)
    }
  },

  /**
   * 重写 loadData 方法（分页加载借用记录）
   */
  async loadData(params) {
    const { page, pageSize } = params

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'getHistory',
          page,
          pageSize
        }
      }).then(res => {
        if (res.result.code === 0) {
          const data = res.result.data
          const recordList = (data.list || []).map(item => this.formatRecordItem(item))

          // 更新列表
          this.setData({
            recordList: page === 1 ? recordList : [...this.data.recordList, ...recordList]
          })

          // 更新分组
          this.updateGroupedRecords()

          resolve({
            data: recordList,
            hasMore: data.page * data.pageSize < data.total
          })
        } else {
          reject(new Error(res.result.message))
        }
      }).catch(error => {
        console.error('加载申请记录失败:', error)
        utils.showToast({
          title: '加载失败',
          icon: 'none'
        })
        reject(error)
      })
    })
  },

  /**
   * 格式化记录项
   * 数据来源：passport_records 集合
   */
  formatRecordItem(item) {
    const createdAt = new Date(item.createdAt)
    
    // 直接使用 passport_records 的 status 字段
    // 状态：approved(已批准待借出) | borrowed(在借中) | returned(已归还) | not_returned(不再收回)
    const status = item.status || 'approved'
    
    const STATUS_STYLE = {
      approved: { text: '已批准，待借出', color: '#D97706', bg: '#FEF3C7' },
      borrowed: { text: '在借中', color: '#2563EB', bg: '#EFF6FF' },
      returned: { text: '已归还', color: '#6B7280', bg: '#F3F4F6' },
      not_returned: { text: '不再收回', color: '#6B7280', bg: '#F3F4F6' }
    }
    
    const style = STATUS_STYLE[status] || STATUS_STYLE.approved

    return {
      ...item,
      borrowerNames: item.borrowerNames || [],
      borrowerNamesText: (item.borrowerNames || []).join('、'),
      borrowDate: item.borrowDate,
      borrowDateText: item.borrowDate || '',
      expectedReturnDate: item.expectedReturnDate || '',
      reason: item.reason || '',
      returnedAt: item.returnedAt,
      returnedAtText: item.returnedAt ? utils.formatDateTime(item.returnedAt) : '',
      createdAtText: utils.formatDateTime(item.createdAt),
      statusText: style.text,
      statusColor: style.color,
      statusBg: style.bg,
      monthKey: `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`,
      monthText: `${createdAt.getFullYear()}年${createdAt.getMonth() + 1}月`
    }
  },

  /**
   * 更新按月分组的记录
   */
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

    // 转换为数组并按月份倒序排列
    const groupedRecords = Object.values(groupedMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))

    this.setData({ groupedRecords })
  },

  /**
   * 加载待借护照列表（管理员）
   */
  async loadApprovedList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'getApprovedList',
          page: 1,
          pageSize: 100
        }
      })

      if (res.result.code === 0) {
        const approvedList = (res.result.data.list || []).map(item => ({
          ...item,
          borrowerNamesText: (item.borrowerNames || []).join('、'),
          borrowDate: item.borrowDate || ''
        }))
        
        this.setData({ approvedList })
      }
    } catch (error) {
      console.error('加载待借列表失败:', error)
      utils.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 加载在借护照列表（管理员）
   */
  async loadBorrowedList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'getBorrowedList',
          page: 1,
          pageSize: 100
        }
      })

      if (res.result.code === 0) {
        const borrowedList = (res.result.data.list || []).map(item => ({
          ...item,
          borrowerNamesText: (item.borrowerNames || []).join('、'),
          borrowDate: item.borrowDate || '',
          borrowedAtText: item.borrowedAt ? utils.formatDateTime(item.borrowedAt) : ''
        }))
        
        this.setData({ borrowedList })
      }
    } catch (error) {
      console.error('加载在借列表失败:', error)
      utils.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 加载护照信息列表
   */
  async loadPassportInfoList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'getPassportInfoList',
          page: 1,
          pageSize: 100
        }
      })

      if (res.result.code === 0) {
        const today = new Date()
        const thresholdDate = new Date(today)
        thresholdDate.setDate(thresholdDate.getDate() + 180)
        
        const passportInfoList = (res.result.data.list || []).map(item => {
          const expiryDate = new Date(item.expiryDate)
          const isExpiringSoon = expiryDate <= thresholdDate
          
          return {
            ...item,
            isExpiringSoon
          }
        })
        
        this.setData({ passportInfoList })
      }
    } catch (error) {
      console.error('加载护照信息失败:', error)
      utils.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 显示申请表单
   */
  showApplicationForm() {
    const today = this.formatDate(new Date())
    
    this.setData({
      showFormPopup: true,
      form: {
        borrowerNames: '',
        borrowDate: today,
        expectedReturnDate: '',
        reason: ''
      }
    })
  },

  /**
   * 隐藏表单弹窗
   */
  hideFormPopup() {
    this.setData({ showFormPopup: false })
  },

  /**
   * 显示记录详情
   */
  showRecordDetail(e) {
    const record = e.currentTarget.dataset.record
    this.setData({
      selectedRecord: record,
      showDetailPopup: true
    })
  },

  /**
   * 隐藏详情弹窗
   */
  hideDetailPopup() {
    this.setData({ showDetailPopup: false })
  },

  /**
   * 显示待借详情（管理员）
   */
  showApprovedDetail(e) {
    const record = e.currentTarget.dataset.record
    this.setData({
      selectedApproved: record,
      showApprovedPopup: true
    })
  },

  /**
   * 隐藏待借详情弹窗
   */
  hideApprovedPopup() {
    this.setData({ showApprovedPopup: false })
  },

  /**
   * 显示在借详情（管理员）
   */
  showBorrowedDetail(e) {
    const record = e.currentTarget.dataset.record
    this.setData({
      selectedBorrowed: record,
      showBorrowedPopup: true
    })
  },

  /**
   * 隐藏在借详情弹窗
   */
  hideBorrowedPopup() {
    this.setData({ showBorrowedPopup: false })
  },

  /**
   * 显示护照信息表单
   */
  showPassportInfoForm() {
    this.setData({
      showInfoFormPopup: true,
      isEditMode: false,
      editingPassportId: null,
      passportForm: {
        ownerName: '',
        gender: '男',
        passportNo: '',
        issueDate: '',
        expiryDate: ''
      }
    })
  },

  /**
   * 隐藏护照信息表单
   */
  hideInfoFormPopup() {
    this.setData({ showInfoFormPopup: false })
  },

  /**
   * 编辑护照信息
   */
  handleEditPassportInfo(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      showInfoFormPopup: true,
      isEditMode: true,
      editingPassportId: item._id,
      passportForm: {
        ownerName: item.ownerName,
        gender: item.gender,
        passportNo: item.passportNo,
        issueDate: item.issueDate,
        expiryDate: item.expiryDate
      }
    })
  },

  /**
   * 删除护照信息
   */
  async handleDeletePassportInfo(e) {
    const passportId = e.currentTarget.dataset.id
    
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除此护照信息吗？',
        success: (res) => {
          resolve(res.confirm)
        }
      })
    })
    
    if (!confirm) return
    
    wx.showLoading({ title: '删除中...', mask: true })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'deletePassportInfo',
          passportId
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '删除成功', icon: 'success' })
        await this.loadPassportInfoList()
      } else {
        utils.showToast({ title: res.result.message || '删除失败', icon: 'none' })
      }
    } catch (error) {
      console.error('删除护照信息失败:', error)
      utils.showToast({ title: '删除失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 阻止冒泡
   */
  stopPropagation() {},

  // ========== 表单输入处理 ==========
  
  handleBorrowerInput(e) {
    this.setData({ 'form.borrowerNames': e.detail.value })
  },

  handleDateChange(e) {
    this.setData({ 'form.borrowDate': e.detail.value })
  },

  handleReturnDateChange(e) {
    this.setData({ 'form.expectedReturnDate': e.detail.value })
  },

  handleReasonInput(e) {
    this.setData({ 'form.reason': e.detail.value })
  },

  handleOwnerNameInput(e) {
    this.setData({ 'passportForm.ownerName': e.detail.value })
  },

  handleGenderSelect(e) {
    const gender = e.currentTarget.dataset.gender
    this.setData({ 'passportForm.gender': gender })
  },

  handlePassportNoInput(e) {
    this.setData({ 'passportForm.passportNo': e.detail.value })
  },

  handleIssueDateChange(e) {
    this.setData({ 'passportForm.issueDate': e.detail.value })
  },

  handleExpiryDateChange(e) {
    this.setData({ 'passportForm.expiryDate': e.detail.value })
  },

  /**
   * 验证表单
   */
  validateForm() {
    const form = this.data.form

    if (!String(form.borrowerNames || '').trim()) {
      utils.showToast({ title: '请填写借用的护照', icon: 'none' })
      return false
    }

    if (!form.borrowDate) {
      utils.showToast({ title: '请选择借用日期', icon: 'none' })
      return false
    }

    if (!String(form.reason || '').trim()) {
      utils.showToast({ title: '请填写借用事由', icon: 'none' })
      return false
    }

    return true
  },

  /**
   * 提交申请
   */
  async submitApplication() {
    if (this.data.submitting) return
    if (!this.validateForm()) return

    const form = this.data.form

    this.setData({ submitting: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'submit',
          businessData: {
            borrowerNames: form.borrowerNames.trim(),
            borrowDate: form.borrowDate,
            expectedReturnDate: form.expectedReturnDate || '',
            reason: form.reason.trim()
          }
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '提交成功', icon: 'success' })
        this.setData({ showFormPopup: false })
        
        // 刷新数据
        await this.loadPassportStatus()
        await this.refreshList()
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

  /**
   * 管理员借出护照
   */
  async handleBorrowPassport() {
    if (this.data.operating) return
    if (!this.data.selectedApproved) return

    this.setData({ operating: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'borrowPassport',
          recordId: this.data.selectedApproved._id
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '借出成功', icon: 'success' })
        this.setData({ showApprovedPopup: false, selectedApproved: null })
        await this.loadApprovedList()
      } else {
        utils.showToast({ title: res.result.message || '借出失败', icon: 'none' })
      }
    } catch (error) {
      console.error('借出护照失败:', error)
      utils.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ operating: false })
    }
  },

  /**
   * 管理员收回护照
   */
  async handleReturnPassport() {
    if (this.data.operating) return
    if (!this.data.selectedBorrowed) return

    this.setData({ operating: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'returnPassport',
          recordId: this.data.selectedBorrowed._id
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '收回成功', icon: 'success' })
        this.setData({ showBorrowedPopup: false, selectedBorrowed: null })
        await this.loadBorrowedList()
      } else {
        utils.showToast({ title: res.result.message || '收回失败', icon: 'none' })
      }
    } catch (error) {
      console.error('收回护照失败:', error)
      utils.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ operating: false })
    }
  },

  /**
   * 标记不再收回
   */
  async handleMarkNotReturned() {
    if (this.data.operating) return
    if (!this.data.selectedBorrowed) return
    
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '确认操作',
        content: '确定标记为"不再收回"吗？此操作不可撤销。',
        success: (res) => {
          resolve(res.confirm)
        }
      })
    })
    
    if (!confirm) return

    this.setData({ operating: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data: {
          action: 'markNotReturned',
          recordId: this.data.selectedBorrowed._id
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '标记成功', icon: 'success' })
        this.setData({ showBorrowedPopup: false, selectedBorrowed: null })
        await this.loadBorrowedList()
      } else {
        utils.showToast({ title: res.result.message || '标记失败', icon: 'none' })
      }
    } catch (error) {
      console.error('标记失败:', error)
      utils.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ operating: false })
    }
  },

  /**
   * 提交护照信息
   */
  async handleSubmitPassportInfo() {
    if (this.data.submitting) return
    
    const { ownerName, gender, passportNo, issueDate, expiryDate } = this.data.passportForm
    
    // 验证
    if (!ownerName || !gender || !passportNo || !issueDate || !expiryDate) {
      utils.showToast({ title: '请填写完整的护照信息', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      const action = this.data.isEditMode ? 'updatePassportInfo' : 'addPassportInfo'
      const data = {
        action,
        passportData: {
          ownerName: ownerName.trim(),
          gender,
          passportNo: passportNo.trim(),
          issueDate,
          expiryDate
        }
      }
      
      if (this.data.isEditMode) {
        data.passportId = this.data.editingPassportId
      }

      const res = await wx.cloud.callFunction({
        name: 'passportManager',
        data
      })

      if (res.result.code === 0) {
        utils.showToast({ title: this.data.isEditMode ? '修改成功' : '添加成功', icon: 'success' })
        this.setData({ showInfoFormPopup: false })
        await this.loadPassportInfoList()
      } else {
        utils.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      console.error('提交护照信息失败:', error)
      utils.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onReachBottom() {
    // 仅在护照借出Tab使用分页
    if (this.data.activeTab === 'borrow') {
      this.loadMore()
    }
  },

  async onPullDownRefresh() {
    await this.loadCurrentTabData()
    wx.stopPullDownRefresh()
  }
})