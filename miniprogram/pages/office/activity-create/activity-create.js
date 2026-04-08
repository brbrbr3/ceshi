const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    form: {
      title: '',
      registrationDeadline: '',
      isMaxRegistrationsEnabled: false,
      maxRegistrations: 50,
      isTargetRoleEnabled: false,
      selectedRoles: [],
      isGroupedActivity: false,
      groups: [{ name: '' }],
      isTargetOnlyVisible: false,
      isRegistrationVisible: true
    },
    roleCheckedMap: {},
    roleOptions: [],
    submitting: false,
    toolbarExpanded: false,
    editorCtx: null,
    contentHtml: ''
  },

  onLoad() {
    const roles = app.getConstantSync('ROLE_OPTIONS') || []
    this.setData({ roleOptions: roles })
    // 报名截止时间最小值 = 现在
    const today = new Date()
    today.setDate(today.getDate())
    today.setHours(today.getHours()+1)
    const y = today.getFullYear()
    const m = String(today.getMonth()+1).padStart(2, '0')//月份从0月开始
    const d = String(today.getDate()).padStart(2, '0')
    const h = String(today.getHours()).padStart(2, '0')
    this.setData({ deadlineMinDatetime: `${y}-${m}-${d} ${h}:00:00` })
  },

  // ========== 编辑器相关 ==========
  handleEditorReady() {
    const query = wx.createSelectorQuery()
    query.select('#contentEditor').context().exec((res) => {
      if (res[0] && res[0].context) {
        this.editorCtx = res[0].context
      }
    })
  },

  handleEditorInput() {
    clearTimeout(this._inputTimer)
    this._inputTimer = setTimeout(() => {
      this._getEditorContent()
    }, 300)
  },

  handleStatusChange(e) {
    this.setData({ formats: e.detail })
  },

  handleToggleToolbar() {
    this.setData({ toolbarExpanded: !this.data.toolbarExpanded })
  },

  handleFormat(e) {
    const name = e.currentTarget.dataset.name
    const value = e.currentTarget.dataset.value || null
    if (!this.editorCtx) return
    this.editorCtx.format(name, value)
  },

  handleInsertDivider() {
    if (!this.editorCtx) return
    this.editorCtx.insertDivider()
  },

  _getEditorContent() {
    if (!this.editorCtx) return
    this.editorCtx.getContents({
      success: (res) => {
        this.setData({ contentHtml: res.html || '' })
      }
    })
  },

  // ========== 表单输入 ==========
  handleTitleInput(e) {
    this.setData({ 'form.title': e.detail.value })
  },

  // ========== 报名截止日期 ==========
  onDeadlineChange(e) {
    this.setData({ 'form.registrationDeadline': e.detail.value })
  },

  // ========== 人数上限 ==========
  onMaxRegistrationsChange(e) {
    this.setData({ 'form.isMaxRegistrationsEnabled': e.detail.value })
  },

  decreaseMaxRegs() {
    const val = this.data.form.maxRegistrations
    if (val > 1) this.setData({ 'form.maxRegistrations': val - 1 })
  },

  increaseMaxRegs() {
    const val = this.data.form.maxRegistrations
    if (val < 9999) this.setData({ 'form.maxRegistrations': val + 1 })
  },

  handleMaxRegsInput(e) {
    let val = parseInt(e.detail.value) || 1
    if (val < 1) val = 1
    if (val > 9999) val = 9999
    this.setData({ 'form.maxRegistrations': val })
  },

  // ========== 目标用户 ==========
  onTargetRoleChange(e) {
    this.setData({ 'form.isTargetRoleEnabled': e.detail.value })
  },

  handleRoleCheck(e) {
    const selected = e.detail.value
    // 构建 checked map 供 wxml 使用
    const checkedMap = {}
    ;(this.data.roleOptions || []).forEach(r => { checkedMap[r] = selected.includes(r) })
    this.setData({ 'form.selectedRoles': selected, roleCheckedMap: checkedMap })
  },

  // ========== 分组活动 ==========
  onGroupedChange(e) {
    this.setData({ 'form.isGroupedActivity': e.detail.value })
  },

  addGroup() {
    const groups = [...this.data.form.groups, { name: '' }]
    this.setData({ 'form.groups': groups })
  },

  removeGroup(e) {
    const idx = e.currentTarget.dataset.index
    const groups = this.data.form.groups.filter((_, i) => i !== idx)
    this.setData({ 'form.groups': groups })
  },

  handleGroupNameInput(e) {
    const idx = e.currentTarget.dataset.index
    const name = e.detail.value
    const groups = [...this.data.form.groups]
    groups[idx].name = name
    this.setData({ 'form.groups': groups })
  },

  // ========== 其他开关 ==========
  onTargetVisibleChange(e) {
    this.setData({ 'form.isTargetOnlyVisible': e.detail.value })
  },

  onRegVisibleChange(e) {
    this.setData({ 'form.isRegistrationVisible': e.detail.value })
  },

  // ========== 提交 ==========
  handleSubmit() {
    const { form } = this.data
    const { title, registrationDeadline, isTargetRoleEnabled, selectedRoles, isGroupedActivity, groups, isMaxRegistrationsEnabled, maxRegistrations } = form

    // 校验标题
    if (!title || !title.trim()) {
      utils.showToast({ title: '请输入标题', icon: 'none' }); return
    }

    // 校验报名截止日期
    if (!registrationDeadline) {
      utils.showToast({ title: '请选择报名截止日期', icon: 'none' }); return
    }

    // 获取编辑器内容
    this._getEditorContent()

    setTimeout(() => {
      const contentHtml = this.data.contentHtml
      const plainText = (contentHtml || '').replace(/<[^>]+>/g, '').trim()

      if (!plainText) {
        utils.showToast({ title: '请输入活动内容', icon: 'none' }); return
      }

      if (plainText.length > 2000) {
        utils.showToast({ title: '内容不能超过2000个字符', icon: 'none' }); return
      }

      // 校验分组
      if (isGroupedActivity) {
        const validGroups = groups.filter(g => g.name.trim())
        if (validGroups.length === 0) {
          utils.showToast({ title: '至少需要一个有效分组', icon: 'none' }); return
        }

        // 去重校验
        const names = validGroups.map(g => g.name.trim())
        if (names.length !== new Set(names).size) {
          utils.showToast({ title: '分组名称不能重复', icon: 'none' }); return
        }
      }

      // 准备提交数据：截止时间转为 number 时间戳（毫秒）
      // 注意：datetime-picker 输出 "YYYY-MM-DD HH:mm:ss"，iOS 不支持空格格式，需转为 T 分隔
      const iosSafeStr = registrationDeadline.replace(' ', 'T')
      const deadlineTimestamp = new Date(iosSafeStr).getTime()
      if (!deadlineTimestamp || isNaN(deadlineTimestamp)) {
        utils.showToast({ title: '截止时间格式无效', icon: 'none' }); return
      }

      const submitData = {
        title: title.trim(),
        content: contentHtml.trim(),
        registrationDeadline: deadlineTimestamp,
        isMaxRegistrationsEnabled,
        maxRegistrations: isMaxRegistrationsEnabled ? maxRegistrations : 50,
        isTargetRoleEnabled,
        targetRoles: isTargetRoleEnabled ? selectedRoles : [],
        isGroupedActivity,
        groups: isGroupedActivity
          ? groups.filter(g => g.name.trim()).map(g => ({ name: g.name.trim() }))
          : [],
        isTargetOnlyVisible: form.isTargetOnlyVisible,
        isRegistrationVisible: form.isRegistrationVisible
      }

      this.doSubmit(submitData)
    }, 100)
  },

  doSubmit(data) {
    this.setData({ submitting: true })
    wx.showLoading({ title: '发布中...' })

    wx.cloud.callFunction({
      name: 'activityManager',
      data: { action: 'create', data }
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.code === 0) {
        utils.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => { wx.navigateBack() }, 1500)
      } else {
        throw new Error(res.result.message || '发布失败')
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('创建活动失败:', err)
      utils.showToast({ title: err.message || '发布失败', icon: 'none' })
      this.setData({ submitting: false })
    })
  }
})
