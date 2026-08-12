/**
 * 就医申请页面
 * 
 * 功能：
 * - 查看就医申请记录列表（审批通过的记录）
 * - 添加就医申请（底部弹窗表单）
 * - 查看记录详情
 * - 导出PDF
 */
const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

Page({
  behaviors: [paginationBehavior],

  data: {
    loading: false,
    submitting: false,
    exporting: false,

    // 弹窗控制
    showFormPopup: false,
    showDetailPopup: false,

    // 数据列表
    recordList: [],
    groupedRecords: [],

    // 选中的记录
    selectedRecord: null,
    detailLogs: [],
    approvedAtText: '',
    submittedAtText: '',

    // 表单数据
    form: {
      patientName: '',
      relation: '',
      medicalDate: '',
      institution: '',
      otherInstitution: '',
      reasonForSelection: '',
      reason: ''
    },

    // 选项列表
    institutions: [],
    relations: [],

    // 日期限制
    today: '',

    // 弹窗滚动位置
    formScrollTop: 0,
    detailScrollTop: 0
  },

  async onLoad(options) {
    this.initPagination({
      initialPageSize: 10,
      loadMorePageSize: 10
    })

    this.loadConstants()

    // 如果是从审批中心复制过来的
    if (options && options.mode === 'copy' && options.data) {
      try {
        const copyData = JSON.parse(decodeURIComponent(options.data))
        this.setData({
          form: {
            patientName: copyData.patientName || '',
            relation: copyData.relation || '',
            medicalDate: copyData.medicalDate || '',
            institution: copyData.institution || '',
            otherInstitution: copyData.otherInstitution || '',
            reasonForSelection: copyData.reasonForSelection || '',
            reason: copyData.reason || ''
          },
          showFormPopup: true
        })
      } catch (e) {
        console.error('解析复制数据失败:', e)
      }
    }
  },

  async onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
    // 如果没有在显示弹窗，则刷新列表
    if (!this.data.showFormPopup) {
      wx.showLoading({
        title: '加载中...',
        mask: true
      })
      try {
        await this.refreshList()
      } finally {
        wx.hideLoading()
        wx.showModal({
          title: '温馨提示',
          content: '1.就医当天务必携带身份证件。\n2.非葡语干部可请本处室葡语干部陪同前往。',
          showCancel: false,
          confirmText: '我知道了'})
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

  /**
   * 加载系统常量（医疗机构、关系选项）
   * 使用 app.js 的缓存机制获取
   */
  loadConstants() {
    const RELATION_OPTIONS = app.getConstantSync('RELATION_OPTIONS') || []
    const MEDICAL_INSTITUTIONS = app.getConstantSync('MEDICAL_INSTITUTIONS') || []

    this.setData({
      institutions: MEDICAL_INSTITUTIONS.map(item =>
        typeof item === 'string' ? {
          name: item,
          value: item
        } : item
      ),
      relations: RELATION_OPTIONS.map(item =>
        typeof item === 'string' ? {
          name: item,
          value: item
        } : item
      ),
      today: utils.getLocalDateString()
    })
  },

  /**
   * 重写 loadData 方法（分页加载就医记录）
   */
  async loadData(params) {
    const {
      page,
      pageSize
    } = params

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'medicalApplication',
        data: {
          action: 'getHistory',
          page,
          pageSize
        }
      }).then(res => {
        if (res.result.code === 0) {
          const data = res.result.data
          const recordList = (data.list || []).map(item => this.formatRecordItem(item))

          this.setData({
            recordList: page === 1 ? recordList : [...this.data.recordList, ...recordList]
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
        console.error('加载就医记录失败:', error)
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
    const createdAt = new Date(item.createdAt)
    const institutionText = item.institution === '其他' ?
      item.otherInstitution :
      item.institution

    return {
      ...item,
      institutionText: institutionText || '-',
      createdAtText: utils.formatDateTime(item.createdAt),
      medicalDateText: item.medicalDate || '-',
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

    const groupedRecords = Object.values(groupedMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    this.setData({
      groupedRecords
    })
  },

  // ========== 弹窗操作 ==========

  /**
   * 显示申请表单
   */
  showApplicationForm() {
    this.setData({
      showFormPopup: true,
      formScrollTop: 0,
      form: {
        patientName: this.data.form.patientName || '',
        relation: this.data.form.relation || '',
        medicalDate: this.data.form.medicalDate || utils.getLocalDateString(),
        institution: this.data.form.institution || '',
        otherInstitution: this.data.form.otherInstitution || '',
        reasonForSelection: this.data.form.reasonForSelection || '',
        reason: this.data.form.reason || ''
      }
    })
  },

  hideFormPopup() {
    this.setData({
      showFormPopup: false
    })
  },

  /**
   * 显示记录详情
   */
  async showRecordDetail(e) {
    const record = e.currentTarget.dataset.record

    wx.showLoading({
      title: '加载中...'
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'medicalApplication',
        data: {
          action: 'getDetail',
          recordId: record._id
        }
      })

      if (res.result.code === 0) {
        const actionTextMap = app.getConstantSync('WORKFLOW_ACTION_TEXT') || {}
        const logs = (res.result.data.logs || []).map(log => ({
          ...log,
          timeText: log.createdAt ? utils.formatDateTime(log.createdAt) : '-',
          actionText: actionTextMap[log.action] || log.action
        }))

        // 申请时间 = action=start 日志的 createdAt
        const startLog = logs.find(l => l.action === 'start')
        const submittedAtText = startLog ?
          startLog.timeText :
          (record.createdAt ? utils.formatDateTime(record.createdAt) : '-')

        this.setData({
          selectedRecord: record,
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

  stopPropagation() {},

  // ========== 表单输入处理 ==========

  handlePatientNameInput(e) {
    this.setData({
      'form.patientName': e.detail.value
    })
  },

  handleRelationSelect(e) {
    const relation = e.currentTarget.dataset.value
    this.setData({
      'form.relation': relation
    })
  },

  handleMedicalDateChange(e) {
    this.setData({
      'form.medicalDate': e.detail.value
    })
  },

  handleInstitutionSelect(e) {
    const institution = e.currentTarget.dataset.value
    this.setData({
      'form.institution': institution
    })
  },

  handleOtherInstitutionInput(e) {
    this.setData({
      'form.otherInstitution': e.detail.value
    })
  },

  handleReasonForSelectionInput(e) {
    this.setData({
      'form.reasonForSelection': e.detail.value
    })
  },

  handleReasonInput(e) {
    this.setData({
      'form.reason': e.detail.value
    })
  },

  /**
   * 验证表单
   */
  validateForm() {
    const form = this.data.form

    if (!String(form.patientName || '').trim()) {
      utils.showToast({
        title: '请填写就医人姓名',
        icon: 'none'
      })
      return false
    }

    if (!form.relation) {
      utils.showToast({
        title: '请选择与申请人关系',
        icon: 'none'
      })
      return false
    }

    if (!form.medicalDate) {
      utils.showToast({
        title: '请选择就医日期',
        icon: 'none'
      })
      return false
    }

    if (!form.institution) {
      utils.showToast({
        title: '请选择就医机构',
        icon: 'none'
      })
      return false
    }

    if (form.institution === '其他' && !String(form.otherInstitution || '').trim()) {
      utils.showToast({
        title: '请填写就医机构名称',
        icon: 'none'
      })
      return false
    }

    if (!String(form.reason || '').trim()) {
      utils.showToast({
        title: '请填写就医原因',
        icon: 'none'
      })
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
    this.setData({
      submitting: true
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'medicalApplication',
        data: {
          action: 'submit',
          businessData: {
            patientName: form.patientName.trim(),
            relation: form.relation,
            medicalDate: form.medicalDate,
            institution: form.institution,
            otherInstitution: form.otherInstitution ? form.otherInstitution.trim() : '',
            reasonForSelection: form.reasonForSelection ? form.reasonForSelection.trim() : '',
            reason: form.reason.trim()
          }
        }
      })

      if (res.result.code === 0) {
        wx.showModal({
          title: '提交成功',
          content: '提交成功，请等待审批，您可在审批中心“我的发起”中查看进度。',
          showCancel: false,
          confirmText: '我知道了',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.setData({
                showFormPopup: false
              })
              // 跳转到审批中心
              setTimeout(() => {
                wx.switchTab({
                  url: '/pages/office/approval/approval'
                })
              }, 1500)
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

  /**
   * 导出PDF
   */
  async handleExportPdf() {
    if (this.data.exporting) return
    if (!this.data.selectedRecord) return

    this.setData({
      exporting: true
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'generateOrderPdf',
        data: {
          orderId: this.data.selectedRecord.orderId
        }
      })

      if (res.result.code === 0) {
        const fileUrl = res.result.data.fileUrl
        const fileName = res.result.data.fileName

        // 下载文件并打开
        wx.showLoading({
          title: '正在打开文件...'
        })
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
            success: () => {
              console.log('PDF打开成功')
            },
            fail: (err) => {
              console.error('打开PDF失败:', err)
              utils.showToast({
                title: '打开文件失败',
                icon: 'none'
              })
            }
          })
        } else {
          utils.showToast({
            title: '下载文件失败',
            icon: 'none'
          })
        }
      } else {
        utils.showToast({
          title: res.result.message || '导出失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('导出PDF失败:', error)
      utils.showToast({
        title: '导出失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        exporting: false
      })
    }
  }
})