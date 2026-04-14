const app = getApp()

// 用户状态映射
const userStatusMap = {
  online: { label: '在线', color: '#22C55E', bg: '#F0FFF4' },
  busy: { label: '忙碌', color: '#F59E0B', bg: '#FFFBEB' },
  out: { label: '外出中', color: '#D97706', bg: '#FEF3C7' },
  offline: { label: '离线', color: '#94A3B8', bg: '#F8FAFC' }
}

// 角色图标配色
const roleIcons = {
  '馆领导': { icon: '👔', color: '#7C3AED' },
  '部门负责人': { icon: '🏛️', color: '#0891B2' },
  '馆员': { icon: '📚', color: '#059669' },
  '工勤': { icon: '🧰', color: '#EA580C' },
  '物业': { icon: '🏘️', color: '#DB2777' },
  '配偶': { icon: '💞', color: '#DC2626' }
}

// 可展示在部门分组中的角色
const DEPARTMENT_GROUP_ROLES = ['部门负责人', '馆员', '工勤']

Page({
  data: {
    departments: ['全部'],
    selectedDept: '全部',
    search: '',
    allContacts: [],
    groupedContacts: [],
    expandedId: null,
    totalCount: 0,
    onlineCount: 0
  },

  onLoad() {
    this.loadContacts()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
    // 每次显示时刷新数据（状态可能变化）
    this.loadContacts()
  },

  /**
   * 从云函数加载通讯录数据
   */
  loadContacts() {
    wx.cloud.callFunction({
      name: 'officeAuth',
      data: { action: 'getContactsList' }
    }).then(res => {
      if (res.result.code !== 0) {
        throw new Error(res.result.message || '获取通讯录失败')
      }

      const contacts = res.result.data.contacts || []

      // 获取部门选项
      const deptOptions = app.getConstantSync('DEPARTMENT_OPTIONS') || ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', 'DW办']

      // 统计在线人数
      const onlineCount = contacts.filter(c => (c.userStatus || 'offline') === 'online').length

      // 为每个联系人添加显示信息
      const processed = contacts.map(c => {
        const statusInfo = userStatusMap[c.userStatus || 'offline'] || userStatusMap.offline
        const roleInfo = roleIcons[c.role] || { icon: '👤', color: '#6B7280' }
        return {
          ...c,
          statusLabel: statusInfo.label,
          statusColor: statusInfo.color,
          statusBg: statusInfo.bg,
          roleIcon: roleInfo.icon,
          roleColor: roleInfo.color
        }
      })

      this.setData({
        allContacts: processed,
        departments: ['全部', ...deptOptions],
        totalCount: contacts.length,
        onlineCount
      })

      this.applyContactsFilter()
    }).catch(err => {
      console.error('加载通讯录失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  onSearchInput(e) {
    this.setData({ search: e.detail.value || '', expandedId: null }, () => {
      this.applyContactsFilter()
    })
  },

  switchDept(e) {
    this.setData({ selectedDept: e.currentTarget.dataset.dept, expandedId: null }, () => {
      this.applyContactsFilter()
    })
  },

  toggleContact(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedId: this.data.expandedId === id ? null : id })
  },

  /**
   * 按分组规则筛选和排序联系人
   */
  applyContactsFilter() {
    const keyword = this.data.search.trim()
    const selectedDept = this.data.selectedDept
    const deptOptions = this.data.departments.slice(1) // 去掉"全部"

    // 第一步：按搜索条件过滤
    let filtered = this.data.allContacts.filter(item => {
      // 部门筛选
      const matchDept = selectedDept === '全部' || item.department === selectedDept
      // 关键词搜索：匹配姓名、角色、部门、岗位
      const matchKeyword = !keyword ||
        (item.name || '').indexOf(keyword) > -1 ||
        (item.role || '').indexOf(keyword) > -1 ||
        (item.department || '').indexOf(keyword) > -1 ||
        (item.position || '').indexOf(keyword) > -1
      return matchDept && matchKeyword
    })

    // 第二步：按分组规则分类
    const leaderGroup = [] // 馆领导组
    const deptGroups = {}  // 部门分组
    const propertyGroup = [] // 物业组
    const spouseGroup = [] // 配偶有岗位组

    filtered.forEach(item => {
      if (item.role === '馆领导') {
        leaderGroup.push(item)
      } else if (DEPARTMENT_GROUP_ROLES.includes(item.role) && item.department) {
        if (!deptGroups[item.department]) {
          deptGroups[item.department] = []
        }
        deptGroups[item.department].push(item)
      } else if (item.role === '物业') {
        propertyGroup.push(item)
      } else if (item.role === '配偶' && item.position && item.position !== '无') {
        spouseGroup.push(item)
      }
      // 其他角色不展示（家属和待赴任馆员已在云函数排除）
    })

    // 第三步：组内排序
    // 馆领导：isAdmin 优先，再按姓名
    leaderGroup.sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return b.isAdmin ? 1 : -1
      return (a.name || '').localeCompare(b.name || '', 'zh')
    })

    // 部门内：部门负责人排首位，其余按姓名
    Object.keys(deptGroups).forEach(dept => {
      deptGroups[dept].sort((a, b) => {
        if (a.role === '部门负责人' && b.role !== '部门负责人') return -1
        if (b.role === '部门负责人' && a.role !== '部门负责人') return 1
        return (a.name || '').localeCompare(b.name || '', 'zh')
      })
    })

    // 物业：按姓名
    propertyGroup.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'))

    // 配偶有岗位：按姓名
    spouseGroup.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'))

    // 第四步：组装最终分组列表
    const groupedContacts = []

    if (leaderGroup.length > 0) {
      groupedContacts.push({
        groupKey: 'leaders',
        groupTitle: '馆领导',
        members: leaderGroup
      })
    }

    // 部门分组，按 DEPARTMENT_OPTIONS 的顺序排列
    deptOptions.forEach(dept => {
      if (deptGroups[dept] && deptGroups[dept].length > 0) {
        groupedContacts.push({
          groupKey: 'dept_' + dept,
          groupTitle: dept,
          members: deptGroups[dept]
        })
      }
    })

    if (propertyGroup.length > 0) {
      groupedContacts.push({
        groupKey: 'property',
        groupTitle: '物业',
        members: propertyGroup
      })
    }

    if (spouseGroup.length > 0) {
      groupedContacts.push({
        groupKey: 'spouse',
        groupTitle: '配偶',
        members: spouseGroup
      })
    }

    this.setData({ groupedContacts })
  }
})
