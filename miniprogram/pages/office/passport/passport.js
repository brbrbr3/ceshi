/**
 * 护照借用页面
 */
const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

// 工作流状态样式映射
const WORKFLOW_STATUS_STYLE = {
  pending: {
    color: '#D97706',
    bg: '#FEF3C7',
    text: '审批中'
  },
  completed: {
    color: '#16A34A',
    bg: '#DCFCE7',
    text: '已通过'
  },
  rejected: {
    color: '#DC2626',
    bg: '#FEE2E2',
    text: '已驳回'
  },
  cancelled: {
    color: '#6B7280',
    bg: '#F3F4F6',
    text: '已取消'
  }
}

Page({
  behaviors: [paginationBehavior],

  data: {
    loading: false,
    submitting: false,
    showFormPopup: false,
    showDetailPopup: false,
    borrowedRecords: [], // 当前在借记录
    recordList: [], // 申请记录列表
    groupedRecords: [], // 按月分组的记录
    selectedRecord: null, // 选中的记录详情
    
    // 表单数据
    form: {
      borrowerNames: '',
      borrowDate: '',
      expectedReturnDate: '',
      reason: ''
    },
    
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
  },

  async onShow() {
    wx.showLoading({ title: '加载中...', mask: true })

    try {
      await Promise.all([
        this.loadPassportStatus(),
        this.refreshList()
      ])
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
          borrowDateText: this.formatDate(new Date(item.borrowDate)),
          expectedReturnDate: item.expectedReturnDate ? this.formatDate(new Date(item.expectedReturnDate)) : ''
        }))
        
        this.setData({ borrowedRecords })
      }
    } catch (error) {
      console.error('获取护照状态失败:', error)
    }
  },

  /**
   * 重写 loadData 方法
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
   */
  formatRecordItem(item) {
    const style = WORKFLOW_STATUS_STYLE[item.workflowStatus] || WORKFLOW_STATUS_STYLE.pending
    const businessData = item.businessData || {}
    const createdAt = new Date(item.createdAt)
    
    // 判断是否已归还
    let statusText = style.text
    let statusColor = style.color
    let statusBg = style.bg
    
    if (item.workflowStatus === 'completed' && businessData.returnedAt) {
      statusText = '已归还'
      statusColor = '#6B7280'
      statusBg = '#F3F4F6'
    } else if (item.workflowStatus === 'completed') {
      statusText = '在借中'
      statusColor = '#2563EB'
      statusBg = '#EFF6FF'
    }

    return {
      ...item,
      borrowerNames: businessData.borrowerNames || [],
      borrowerNamesText: (businessData.borrowerNames || []).join('、'),
      borrowDate: businessData.borrowDate,
      borrowDateText: businessData.borrowDate || '',
      expectedReturnDate: businessData.expectedReturnDate || '',
      reason: businessData.reason || '',
      returnedAt: businessData.returnedAt,
      returnedAtText: businessData.returnedAt ? utils.formatTime(businessData.returnedAt) : '',
      createdAtText: utils.formatTime(item.createdAt),
      statusText,
      statusColor,
      statusBg,
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
    this.setData({ 
      showDetailPopup: false,
      selectedRecord: null
    })
  },

  /**
   * 阻止冒泡
   */
  stopPropagation() {},

  // 表单输入处理
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

  onReachBottom() {
    this.loadMore()
  },

  async onPullDownRefresh() {
    await this.loadPassportStatus()
    await this.refreshList()
    wx.stopPullDownRefresh()
  }
})
