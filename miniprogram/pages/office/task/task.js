const tasks = [
  {
    id: 1,
    title: '完成 Q1 季度产品需求文档',
    project: '产品规划',
    priority: '高优先',
    priorityColor: '#F44336',
    priorityBg: '#FFEBEE',
    due: '今天',
    progress: 75,
    done: false,
    assignees: [
      { name: '陈', color: '#2563EB' },
      { name: '李', color: '#7C3AED' }
    ]
  },
  {
    id: 2,
    title: 'UI 设计稿评审会准备',
    project: '设计协作',
    priority: '中优先',
    priorityColor: '#FF9800',
    priorityBg: '#FFF3E0',
    due: '明天',
    progress: 30,
    done: false,
    assignees: [{ name: '张', color: '#0891B2' }]
  },
  {
    id: 3,
    title: '后端接口文档整理',
    project: '技术开发',
    priority: '低优先',
    priorityColor: '#4CAF50',
    priorityBg: '#E8F5E9',
    due: '03-15',
    progress: 10,
    done: false,
    assignees: [
      { name: '王', color: '#4CAF50' },
      { name: '赵', color: '#7C3AED' },
      { name: '刘', color: '#F59E0B' }
    ]
  },
  {
    id: 4,
    title: '竞品分析报告',
    project: '市场调研',
    priority: '中优先',
    priorityColor: '#FF9800',
    priorityBg: '#FFF3E0',
    due: '已完成',
    progress: 100,
    done: true,
    assignees: [{ name: '陈', color: '#2563EB' }]
  }
];

const scheduleGroups = [
  {
    date: '今天',
    events: [
      { time: '09:00-10:30', title: '产品周会', location: '3 楼会议室', type: '会议', color: '#7C3AED', bg: '#F3E8FF' },
      { time: '14:00-15:30', title: 'Q1 季度汇报', location: '大会议室', type: '汇报', color: '#0891B2', bg: '#E0F2FE' },
      { time: '16:30-17:00', title: '1v1 绩效谈话', location: 'CEO 办公室', type: '面谈', color: '#059669', bg: '#D1FAE5' }
    ]
  },
  {
    date: '明天',
    events: [
      { time: '10:00-11:00', title: 'UI 评审会', location: '4 楼工作室', type: '评审', color: '#D97706', bg: '#FEF3C7' },
      { time: '15:00-16:00', title: '技术架构讨论', location: '线上会议', type: '会议', color: '#7C3AED', bg: '#F3E8FF' }
    ]
  }
];

const projects = [
  { name: '智汇 APP 3.0', progress: 68, members: 8, color: '#2563EB', deadline: '04-30', membersPreview: ['陈', '张', '王', '李'] },
  { name: '官网改版', progress: 42, members: 4, color: '#FF9800', deadline: '03-25', membersPreview: ['李', '林', '吴', '黄'] },
  { name: '数据中台建设', progress: 25, members: 12, color: '#9C27B0', deadline: '06-01', membersPreview: ['赵', '孙', '周', '方'] }
];

const calendarDays = Array.from({ length: 31 }, (_, index) => {
  const day = index + 1;
  return {
    day,
    current: day === 10,
    weekend: [2, 9, 16, 23, 30].indexOf(day) > -1
  };
});

Page({
  data: {
    primaryTabs: [
      { key: 'task', label: '我的任务' },
      { key: 'schedule', label: '日程' },
      { key: 'project', label: '项目' }
    ],
    activePrimaryTab: 'task',
    taskFilters: ['全部', '今日到期', '高优先级', '已完成'],
    activeTaskFilter: '全部',
    tasks,
    filteredTasks: tasks,
    scheduleGroups,
    projects,
    weekDays: ['一', '二', '三', '四', '五', '六', '日'],
    calendarDays
  },

  switchPrimaryTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activePrimaryTab: tab });
  },

  switchTaskFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    let filteredTasks = this.data.tasks;

    if (filter === '今日到期') {
      filteredTasks = this.data.tasks.filter((item) => item.due === '今天');
    }
    if (filter === '高优先级') {
      filteredTasks = this.data.tasks.filter((item) => item.priority === '高优先');
    }
    if (filter === '已完成') {
      filteredTasks = this.data.tasks.filter((item) => item.done);
    }

    this.setData({
      activeTaskFilter: filter,
      filteredTasks
    });
  }
});