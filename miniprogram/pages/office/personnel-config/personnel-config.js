const app = getApp()
const utils = require('../../../common/utils.js')
const modalAnimation = require('../../../behaviors/modalAnimation.js')
const customToast = require('../../../behaviors/customToast.js')

/**
 * 构建 disabled 项提示文案（根据双方具体关系）
 * @param {string} uName 候选人姓名
 * @param {string} selfName 当前编辑的用户姓名
 * @param {boolean} selfIsDeptHead 当前用户是否部门负责人
 * @param {string} selfDepartment 当前用户部门
 * @param {string} uDepartment 候选人部门
 * @param {boolean} selfIsAreaManager 当前用户是否片长
 * @param {string} selfLivingArea 当前用户居住区域
 * @param {string} uLivingArea 候选人居住区域
 */
function buildDisabledReason(uName, selfName, selfIsDeptHead, selfDepartment, uDepartment, selfIsAreaManager, selfLivingArea, uLivingArea) {
  const parts = []
  if (selfIsDeptHead && selfDepartment && uDepartment === selfDepartment) {
    parts.push('所在部门的部门负责人')
  }
  if (selfIsAreaManager && selfLivingArea && uLivingArea === selfLivingArea) {
    parts.push('所居住区域的片长')
  }
  if (parts.length === 0) return ''
  return `${uName}${parts.join('、')}是${selfName}，向${selfName}报备，无法取消勾选`
}

Page({
  behaviors: [modalAnimation, customToast],

  data: {
    loading: true,
    currentUser: null,
    searchKeyword: '',
    allUsers: [],
    filteredUsers: [],
    departmentOptions: [],
    livingAreas: [],
    positionOptions: [],
    canEdit: false,

    // 弹窗选项卡
    showEditModal: false,
    editUser: null,

    // 个人信息表单
    formRole: '',
    formDepartment: '',
    formIsDeptHead: false,
    formPositions: [],
    formLivingArea: '',
    formIsAreaManager: false,

    // 弹窗中订阅列表的展示维度
    subscriberGroupBy: 'department',

    // 报备配置 - 谁向该用户报备（按部门分组）
    subscriberGroups: [],
    subscriberAreaGroups: [],
    // 该用户向谁报备
    reportToOptions: [],
    formReportTo: [],

    // 部门全选状态
    deptAllSelected: {}
  },

  async onLoad() {
    await this.checkPermission()
    await this.loadConstants()
    await this.loadUsers()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  async checkPermission() {
    try {
      const result = await app.checkUserRegistration()
      if (result.registered && result.user) {
        this.setData({ currentUser: result.user, canEdit: !!result.user.isAdmin })
      }
    } catch (e) {
      // ignore
    }
  },

  async loadConstants() {
    try {
      const constants = await app.loadConstants()
      if (constants) {
        this.setData({
          departmentOptions: constants.DEPARTMENT_OPTIONS || [],
          livingAreas: constants.REPAIR_LIVING_AREAS || [],
          positionOptions: (constants.POSITION_OPTIONS || []).map(p =>
            typeof p === 'string' ? { name: p, value: p } : p
          )
        })
      }
    } catch (e) {
      console.warn('加载常量失败:', e)
    }
  },

  async loadUsers() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'personnelManager',
        data: { action: 'getAllPersonnel' }
      })
      if (res.result.code !== 0) throw new Error(res.result.message)

      const users = res.result.data.users || []
      const sorted = this.sortUsers(users)
      users.forEach(u => {
        u.avatarText = (u.name || '?')[0]
        const label = this.getUserLabel(u)
        u.labelText = label.text
        u.labelClass = label.cls
        u.displayDept = u.department || (u.role === '其他' ? '其他' : '无')
        u.displayPosition = (Array.isArray(u.position) && u.position.length > 0)
          ? u.position.join('、')
          : ''
      })
      const personnelGroups = this.buildPersonnelGroups(sorted)
      this.setData({
        allUsers: sorted,
        filteredUsers: sorted,
        personnelGroups,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      utils.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 构建分组展示的用户列表
   */
  buildPersonnelGroups(users) {
    const { departmentOptions } = this.data
    const groups = []
    const deptMap = {}

    users.forEach(u => {
      let key = ''
      if (u.role === '馆员' && u.department === '无') {
        key = '__leader__'
      } else if (u.role === '其他') {
        key = '__other__'
      } else {
        key = u.department || '未分配部门'
      }
      if (!deptMap[key]) deptMap[key] = []
      deptMap[key].push(u)
    })

    const displayName = (key) => {
      if (key === '__leader__') return ''
      if (key === '__other__') return '其他人员'
      return key
    }

    const sortKeys = Object.keys(deptMap)
    const leaderIdx = sortKeys.indexOf('__leader__')
    const otherIdx = sortKeys.indexOf('__other__')
    const unassignedIdx = sortKeys.indexOf('未分配部门')

    const normalKeys = sortKeys.filter(k => !['__leader__', '__other__', '未分配部门'].includes(k))
    normalKeys.sort((a, b) => {
      const ai = departmentOptions.indexOf(a)
      const bi = departmentOptions.indexOf(b)
      return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999)
    })

    let ordered = []
    if (leaderIdx >= 0) ordered.push('__leader__')
    ordered = ordered.concat(normalKeys)
    if (unassignedIdx >= 0) ordered.push('未分配部门')
    if (otherIdx >= 0) ordered.push('__other__')

    return ordered.map(key => ({
      groupName: displayName(key),
      // 组内排序：部门负责人排第一，其次按姓名
      users: [...deptMap[key]].sort((a, b) => {
        const ha = a.isDepartmentHead ? 0 : 1
        const hb = b.isDepartmentHead ? 0 : 1
        if (ha !== hb) return ha - hb
        return (a.name || '').localeCompare(b.name || '', 'zh')
      })
    }))
  },

  /**
   * 排序规则：馆员+部门空(领导) → 各部门 → 其他
   */
  sortUsers(users) {
    const { departmentOptions } = this.data
    return [...users].sort((a, b) => {
      const oa = this.getSortOrder(a, departmentOptions)
      const ob = this.getSortOrder(b, departmentOptions)
      if (oa !== ob) return oa - ob
      return (a.name || '').localeCompare(b.name || '', 'zh')
    })
  },

  getSortOrder(user, deptOpts) {
    if (user.role === '馆员' && user.department === '无') return 0
    if (user.role === '其他') return 998
    const idx = (deptOpts || []).indexOf(user.department)
    return idx >= 0 ? idx + 1 : 500
  },

  /**
   * 标签：领导 > 负责人+片长 > 负责人 > 片长 > 馆员 > 其他
   */
  getUserLabel(user) {
    if (user.role === '馆员' && user.department === '无') return { text: '领导', cls: 'leader' }
    const isHead = !!user.isDepartmentHead
    const isManager = !!user.isAreaManager
    if (isHead && isManager) return { text: '负责人、片长', cls: 'head-manager' }
    if (isHead) return { text: '负责人', cls: 'head' }
    if (isManager) return { text: '片长', cls: 'manager' }
    if (user.role === '馆员') return { text: '馆员', cls: 'curator' }
    return { text: '其他', cls: 'other' }
  },

  // ==================== 搜索 ====================
  handleSearchInput(e) {
    const keyword = e.detail.value.trim()
    const filtered = keyword
      ? this.data.allUsers.filter(u => u.name.indexOf(keyword) > -1)
      : this.data.allUsers
    const personnelGroups = this.buildPersonnelGroups(filtered)
    this.setData({ searchKeyword: keyword, filteredUsers: filtered, personnelGroups })
  },

  // ==================== 打开弹窗 ====================
  handleUserTap(e) {
    // 利用 tap 手势静默积累订阅额度（所有可查看页面的用户均可累积）
    const current = this.data.currentUser || app.globalData.userProfile
    if (current) app.subscribeOnTap(app.getSubscribeTypesForUser(current))

    const openid = e.currentTarget.dataset.openid
    const user = this.data.allUsers.find(u => u.openid === openid)
    if (!user) return

    const departmentOptions = this.data.departmentOptions
    const allUsers = this.data.allUsers

    // 当前编辑用户的身份信息（用于自动匹配）
    const currentIsAreaManager = !!user.isAreaManager
    const currentLivingArea = user.livingArea || ''
    const currentIsDeptHead = !!user.isDepartmentHead
    const currentDepartment = user.department || ''

    // 当前编辑用户的角色简称（用于 disabled 提示）
    // 当前用户身份信息已提取（currentIsDeptHead, currentDepartment, currentIsAreaManager, currentLivingArea）

    // 获取现有 reportTo
    const reportTo = Array.isArray(user.reportTo) ? user.reportTo : []

    // 计算自动匹配的 openids（片长管辖同区人员 / 部门负责人管辖同部门人员）
    const autoOpenids = new Set()
    allUsers.forEach(u => {
      if (u.openid === openid) return
      if ((currentIsAreaManager && currentLivingArea && u.livingArea === currentLivingArea) ||
          (currentIsDeptHead && currentDepartment && u.department === currentDepartment)) {
        autoOpenids.add(u.openid)
      }
    })

    // 手动配置（反向查询：谁的 reportTo 含当前用户，排除自动匹配）
    const checkedOpenids = new Set()
    allUsers.forEach(u => {
      if (u.openid === openid) return
      const uReportTo = Array.isArray(u.reportTo) ? u.reportTo : []
      if (uReportTo.includes(openid) && !autoOpenids.has(u.openid)) {
        checkedOpenids.add(u.openid)
      }
    })
    this._initialCheckedSet = new Set(checkedOpenids)

    // 合并 checked = auto + manual
    const allCheckedOpenids = new Set([...autoOpenids, ...checkedOpenids])

    // 构建 subscriberGroups：按部门分组 + 按居住区分组
    const subscriberGroups = this.buildSubscriberGroups(allUsers, openid, allCheckedOpenids, autoOpenids, departmentOptions, user.name, currentIsDeptHead, currentDepartment, currentIsAreaManager, currentLivingArea)
    const subscriberAreaGroups = this.buildSubscriberAreaGroups(allUsers, openid, allCheckedOpenids, autoOpenids, user.name, currentIsDeptHead, currentDepartment, currentIsAreaManager, currentLivingArea)

    // 构建 reportTo 选项（排除自己）
    const reportToOptions = allUsers
      .filter(u => u.openid !== openid)
      .map(u => {
        // 自动匹配：候选人是当前用户的片长或部门负责人
        const isAutoManager = !!u.isAreaManager && u.livingArea === currentLivingArea && currentLivingArea
        const isAutoDeptHead = !!u.isDepartmentHead && u.department === currentDepartment && currentDepartment
        const isAuto = isAutoManager || isAutoDeptHead
        let disabledReason = ''
        if (isAutoManager) disabledReason = `${u.name}是${user.name}所在居住区的片长，无法取消勾选`
        else if (isAutoDeptHead) disabledReason = `${u.name}是${user.name}的部门负责人，无法取消勾选`
        return {
          openid: u.openid,
          name: u.name,
          label: (this.getUserLabel(u)).text,
          department: u.department,
          checked: reportTo.includes(u.openid) || isAuto,
          disabled: isAuto,
          disabledReason
        }
      })
      // 不再按部门顺序展示，全部按姓名（拼音）排序
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'))

    // 岗位预计算 checked（与订阅列表一致，避免 WXML 中调用 indexOf）
    const userPositions = Array.isArray(user.position) ? user.position : []
    const formPositions = this.data.positionOptions.map(p => ({
      ...p,
      checked: userPositions.includes(p.value)
    }))

    this.setData({
      showEditModal: true,
      editUser: { ...user },
      formRole: user.role || '',
      formDepartment: user.department || '',
      formIsDeptHead: !!user.isDepartmentHead,
      formPositions,
      formLivingArea: user.livingArea || '',
      formIsAreaManager: !!user.isAreaManager,
      subscriberGroups,
      subscriberAreaGroups,
      subscriberGroupBy: 'department',
      reportToOptions,
      formReportTo: [...reportTo],
      deptAllSelected: {}
    })
  },

  /**
   * 构建按部门分组的订阅候选人列表
   */
  buildSubscriberGroups(allUsers, selfOpenid, checkedOpenids, autoOpenids, deptOpts, selfName, selfIsDeptHead, selfDepartment, selfIsAreaManager, selfLivingArea) {
    const groups = []
    const deptMap = {}
    const selfUser = allUsers.find(u => u.openid === selfOpenid)

    allUsers.forEach(u => {
      if (u.openid === selfOpenid) return
      let dept = u.department || ''
      if (u.role === '其他') dept = '其他人员'
      if (!dept) dept = '未分配部门'
      if (u.role === '馆员' && u.department === '无') dept = '__leader__'

      if (!deptMap[dept]) {
        deptMap[dept] = { name: dept, users: [] }
      }
      const isDisabled = autoOpenids.has(u.openid)
      deptMap[dept].users.push({
        openid: u.openid,
        name: u.name,
        label: (this.getUserLabel(u)).text || '',
        department: u.department,
        livingArea: u.livingArea || '',
        subText: u.livingArea || '',   // 按部门分组时右侧显示居住区域
        checked: checkedOpenids.has(u.openid),
        disabled: isDisabled,
        disabledReason: isDisabled ? buildDisabledReason(u.name, selfName, selfIsDeptHead, selfDepartment, u.department, selfIsAreaManager, selfLivingArea, u.livingArea) : ''
      })
    })

    // 排序：__leader__ → departments → 其他人员 → 未分配部门
    const sortKeys = (keys) => {
      const leaderIdx = keys.indexOf('__leader__')
      const othersIdx = keys.indexOf('其他人员')
      const unassignedIdx = keys.indexOf('未分配部门')

      const normalDepts = keys.filter(k =>
        k !== '__leader__' && k !== '其他人员' && k !== '未分配部门'
      )
      normalDepts.sort((a, b) => {
        const ai = deptOpts.indexOf(a)
        const bi = deptOpts.indexOf(b)
        return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999)
      })

      let result = []
      if (leaderIdx >= 0) result.push('__leader__')
      result = result.concat(normalDepts)
      if (unassignedIdx >= 0) result.push('未分配部门')
      if (othersIdx >= 0) result.push('其他人员')
      return result
    }

    const allKeys = Object.keys(deptMap)
    const sortedKeys = sortKeys(allKeys)
    return sortedKeys.map(key => ({
      ...deptMap[key],
      name: key === '__leader__' ? '领导' : key,
      allChecked: deptMap[key].users.every(u => u.checked),
      collapsed: false
    }))
  },

  /**
   * 构建按居住区分组的订阅候选人列表
   */
  buildSubscriberAreaGroups(allUsers, selfOpenid, checkedOpenids, autoOpenids, selfName, selfIsDeptHead, selfDepartment, selfIsAreaManager, selfLivingArea) {
    const areaMap = {}
    allUsers.forEach(u => {
      if (u.openid === selfOpenid) return
      const area = u.livingArea || '未分配区域'
      if (!areaMap[area]) areaMap[area] = { name: area, users: [] }
      const isDisabled = autoOpenids.has(u.openid)
      areaMap[area].users.push({
        openid: u.openid,
        name: u.name,
        label: (this.getUserLabel(u)).text || '',
        department: u.department,
        livingArea: u.livingArea || '',
        subText: u.department || '无',  // 按居住区分组时右侧显示部门
        checked: checkedOpenids.has(u.openid),
        disabled: isDisabled,
        disabledReason: isDisabled ? buildDisabledReason(u.name, selfName, selfIsDeptHead, selfDepartment, u.department, selfIsAreaManager, selfLivingArea, u.livingArea) : ''
      })
    })
    const sortedKeys = Object.keys(areaMap).sort((a, b) => {
      if (a === '未分配区域') return 1
      if (b === '未分配区域') return -1
      return a.localeCompare(b, 'zh')
    })
    return sortedKeys.map(key => ({
      name: key,
      users: areaMap[key].users,
      allChecked: areaMap[key].users.length > 0 && areaMap[key].users.every(u => u.checked),
      collapsed: false
    }))
  },

  // ==================== 表单变更 ====================
  handleRoleChange(e) {
    if (!this.data.canEdit) return
    const idx = Number(e.detail.value)
    this.setData({ formRole: idx === 1 ? '其他' : '馆员' })
  },

  handleDeptChange(e) {
    if (!this.data.canEdit) return
    const idx = e.detail.value
    const dept = this.data.departmentOptions[idx] || ''
    this.setData({ formDepartment: dept })
  },

  handleDeptHeadChange(e) {
    if (!this.data.canEdit) return
    this.setData({ formIsDeptHead: e.detail.value })
  },

  handleAreaManagerChange(e) {
    if (!this.data.canEdit) return
    this.setData({ formIsAreaManager: e.detail.value })
  },

  handleAreaChange(e) {
    if (!this.data.canEdit) return
    const areas = this.data.livingAreas
    this.setData({ formLivingArea: areas[e.detail.value] || '' })
  },

  handleTogglePosition(e) {
    if (!this.data.canEdit) return
    const pos = String(e.currentTarget.dataset.value || '')
    if (!pos) return
    const positions = this.data.formPositions.map(p => ({
      ...p,
      checked: p.value === pos ? !p.checked : p.checked
    }))
    this.setData({ formPositions: positions })
  },

  handleToggleSubGroupBy(e) {
    this.setData({ subscriberGroupBy: e.currentTarget.dataset.by || 'department' })
  },

  handleToggleAreaGroup(e) {
    if (!this.data.canEdit) return
    const { group } = e.currentTarget.dataset
    const groups = this.data.subscriberGroups
    const areaGroups = this.data.subscriberAreaGroups
    const target = areaGroups.find(g => g.name === group)
    if (!target) return

    const affectedOpenids = new Set(target.users.map(u => u.openid))
    const newState = !target.allChecked

    // 同步：更新居住区分组（跳过 disabled）
    target.users.forEach(u => { if (!u.disabled) u.checked = newState })
    target.allChecked = target.users.every(u => u.checked || u.disabled)
    // 同步：更新部门分组中相同的用户（跳过 disabled）
    groups.forEach(g => {
      g.users.forEach(u => {
        if (affectedOpenids.has(u.openid) && !u.disabled) u.checked = newState
      })
      g.allChecked = g.users.length > 0 && g.users.every(u => u.checked || u.disabled)
    })

    this.setData({ subscriberGroups: groups, subscriberAreaGroups: areaGroups })
  },

  // ==================== 订阅分组操作 ====================
  handleToggleSubscriber(e) {
    if (!this.data.canEdit) return
    const { openid } = e.currentTarget.dataset
    const groups = this.data.subscriberGroups
    const areaGroups = this.data.subscriberAreaGroups

    // 跳过 disabled 项，弹出提示
    for (const g of groups) {
      for (const u of g.users) {
        if (u.openid === openid && u.disabled) {
          this._showCustomToast(u.disabledReason || '无法取消自动匹配', { duration: 2500, fadeOutMs: 500 })
          return
        }
      }
    }

    const toggleInGroup = (grpList) => {
      for (const g of grpList) {
        for (const u of g.users) {
          if (u.openid === openid && !u.disabled) { u.checked = !u.checked; break }
        }
        g.allChecked = g.users.length > 0 && g.users.every(u => u.checked || u.disabled)
      }
    }
    toggleInGroup(groups)
    toggleInGroup(areaGroups)

    this.setData({ subscriberGroups: groups, subscriberAreaGroups: areaGroups })
  },

  handleToggleGroup(e) {
    if (!this.data.canEdit) return
    const { group } = e.currentTarget.dataset
    const groups = this.data.subscriberGroups
    const areaGroups = this.data.subscriberAreaGroups
    const target = groups.find(g => g.name === group)
    if (!target) return

    const affectedOpenids = new Set(target.users.map(u => u.openid))
    const newState = !target.allChecked

    // 同步：更新部门分组（跳过 disabled）
    target.users.forEach(u => { if (!u.disabled) u.checked = newState })
    target.allChecked = target.users.every(u => u.checked || u.disabled)
    // 同步：更新居住区分组中相同的用户（跳过 disabled）
    areaGroups.forEach(g => {
      g.users.forEach(u => {
        if (affectedOpenids.has(u.openid) && !u.disabled) u.checked = newState
      })
      g.allChecked = g.users.length > 0 && g.users.every(u => u.checked || u.disabled)
    })

    this.setData({ subscriberGroups: groups, subscriberAreaGroups: areaGroups })
  },

  // ==================== reportTo 操作 ====================
  handleToggleReportTo(e) {
    if (!this.data.canEdit) return
    const { openid } = e.currentTarget.dataset
    const reportToOptions = this.data.reportToOptions
    const target = reportToOptions.find(u => u.openid === openid)
    if (!target) return
    if (target.disabled) {
      this._showCustomToast(target.disabledReason || '无法取消自动匹配', { duration: 2500, fadeOutMs: 500 })
      return
    }
    target.checked = !target.checked
    this.setData({ reportToOptions })
  },

  // ==================== 关闭弹窗 ====================
  handleCloseModal() {
    this._closeModal('showEditModal', () => {
      this.setData({ editUser: null })
    })
  },

  stopPropagation() {},

  // ==================== 保存 ====================
  async handleSavePersonnel() {
    if (!this.data.canEdit) {
      utils.showToast({ title: '只读模式，如需修改请联系管理员', icon: 'none' })
      return
    }
    if (!this.data.editUser) return

    wx.showLoading({ title: '保存中...', mask: true })
    try {
      // 计算"谁向该用户报备"变更（排除 disabled 的自动匹配项）
      const currentChecked = new Set()
      this.data.subscriberGroups.forEach(group => {
        group.users.forEach(u => {
          if (u.checked && !u.disabled) currentChecked.add(u.openid)
        })
      })
      const initialSet = this._initialCheckedSet || new Set()
      const additions = [...currentChecked].filter(o => !initialSet.has(o))
      const removals = [...initialSet].filter(o => !currentChecked.has(o))
      this._initialCheckedSet = null

      // 收集 reportTo（排除 disabled 的自动匹配项）
      const reportTo = this.data.reportToOptions
        .filter(u => u.checked && !u.disabled)
        .map(u => u.openid)

      // 1. 更新当前用户的基础信息
      const res = await wx.cloud.callFunction({
        name: 'personnelManager',
        data: {
          action: 'updatePersonnel',
          params: {
            targetOpenid: this.data.editUser.openid,
            updates: {
              role: this.data.formRole,
              department: this.data.formDepartment,
              isDepartmentHead: this.data.formIsDeptHead,
              position: this.data.formPositions.filter(p => p.checked).map(p => p.value),
              livingArea: this.data.formLivingArea,
              isAreaManager: this.data.formIsAreaManager,
              reportTo
            }
          }
        }
      })

      wx.hideLoading()
      if (res.result.code !== 0) throw new Error(res.result.message)

      // 2. 批量更新其他用户的 reportTo（"谁向该用户报备"）
      if (additions.length > 0 || removals.length > 0) {
        const batchRes = await wx.cloud.callFunction({
          name: 'personnelManager',
          data: {
            action: 'updateBatchReportTo',
            params: { currentOpenid: this.data.editUser.openid, additions, removals }
          }
        })
        if (batchRes.result.code !== 0) throw new Error(batchRes.result.message)
      }

      utils.showToast({ title: '保存成功', icon: 'success' })
      this.setData({ showEditModal: false, editUser: null })
      await this.loadUsers()
    } catch (err) {
      wx.hideLoading()
      utils.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  }
})
