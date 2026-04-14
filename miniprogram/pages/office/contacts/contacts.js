const app = getApp()
const departments = ['全部', '政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', 'DW办'];
const employees = [
  { id: 1, name: '刘总监', role: '产品总监', dept: '产品部', initial: '刘', color: '#7C3AED', status: 'online', phone: '138****0001' },
  { id: 2, name: '陈志远', role: '产品经理', dept: '产品部', initial: '陈', color: '#2563EB', status: 'online', phone: '138****0002', isSelf: true },
  { id: 3, name: '林小雨', role: 'UI 设计师', dept: '产品部', initial: '林', color: '#D03878', status: 'busy', phone: '138****0003' },
  { id: 4, name: '张伟', role: '前端工程师', dept: '技术部', initial: '张', color: '#059669', status: 'online', phone: '138****0004' },
  { id: 5, name: '王建国', role: '后端工程师', dept: '技术部', initial: '王', color: '#0891B2', status: 'offline', phone: '138****0005' },
  { id: 6, name: '赵磊', role: '架构师', dept: '技术部', initial: '赵', color: '#7C3AED', status: 'online', phone: '138****0006' },
  { id: 7, name: '孙燕', role: '测试工程师', dept: '技术部', initial: '孙', color: '#D97706', status: 'busy', phone: '138****0007' },
  { id: 8, name: '李婷婷', role: '市场专员', dept: '市场部', initial: '李', color: '#EC4899', status: 'online', phone: '138****0008' },
  { id: 9, name: '吴晓峰', role: '销售总监', dept: '销售部', initial: '吴', color: '#EF4444', status: 'online', phone: '138****0010' },
  { id: 10, name: '黄建华', role: '行政主管', dept: '行政部', initial: '黄', color: '#84CC16', status: 'online', phone: '138****0012' },
  { id: 11, name: '陈财务', role: '财务主管', dept: '财务部', initial: '陈', color: '#8B5CF6', status: 'online', phone: '138****0014' }
];

const statusMap = {
  online: { label: '在线', color: '#22C55E', bg: '#F0FFF4' },
  busy: { label: '忙碌', color: '#F59E0B', bg: '#FFFBEB' },
  offline: { label: '离线', color: '#94A3B8', bg: '#F8FAFC' }
};

Page({
  data: {
    departments,
    selectedDept: '全部',
    search: '',
    employees,
    groupedContacts: [],
    expandedId: null,
    onlineCount: employees.filter((item) => item.status === 'online').length,
    totalCount: employees.length
  },

  onLoad() {
    this.applyContactsFilter();
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
  },
  
  onSearchInput(e) {
    this.setData({ search: e.detail.value || '', expandedId: null }, () => {
      this.applyContactsFilter();
    });
  },

  switchDept(e) {
    this.setData({ selectedDept: e.currentTarget.dataset.dept, expandedId: null }, () => {
      this.applyContactsFilter();
    });
  },

  toggleContact(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? null : id });
  },

  applyContactsFilter() {
    const keyword = this.data.search.trim();
    const filtered = this.data.employees.filter((item) => {
      const matchDept = this.data.selectedDept === '全部' || item.dept === this.data.selectedDept;
      const matchKeyword = !keyword || item.name.indexOf(keyword) > -1 || item.role.indexOf(keyword) > -1 || item.dept.indexOf(keyword) > -1;
      return matchDept && matchKeyword;
    }).map((item) => {
      const statusInfo = statusMap[item.status];
      return Object.assign({}, item, {
        statusLabel: statusInfo.label,
        statusColor: statusInfo.color,
        statusBg: statusInfo.bg
      });
    });

    const groupedMap = {};
    filtered.forEach((item) => {
      if (!groupedMap[item.dept]) {
        groupedMap[item.dept] = [];
      }
      groupedMap[item.dept].push(item);
    });

    const groupedContacts = Object.keys(groupedMap).map((dept) => ({
      dept,
      members: groupedMap[dept]
    }));

    this.setData({ groupedContacts });
  },

  showComingSoon() {
    wx.showToast({
      title: '功能开发中，敬请期待',
      icon: 'none'
    })
  }
});