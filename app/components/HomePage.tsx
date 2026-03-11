import { Bell, Search, MapPin, ChevronRight, Clock, CheckCircle } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

interface HomePageProps {
  onNavigate?: (tab: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { theme } = useTheme();

  const quickActions = [
    { icon: "📅", label: "打卡签到", color: "#4CAF50", bg: "#E8F5E9" },
    { icon: "📋", label: "发起审批", color: "#FF9800", bg: "#FFF3E0" },
    { icon: "📢", label: "公告通知", color: "#9C27B0", bg: "#F3E5F5" },
    { icon: "📊", label: "工作报告", color: "#00BCD4", bg: "#E0F7FA" },
    { icon: "💬", label: "企业通讯", color: "#F44336", bg: "#FFEBEE" },
    { icon: "📁", label: "云端文档", color: "#FF5722", bg: "#FBE9E7" },
    { icon: "🗓️", label: "日程安排", color: "#3F51B5", bg: "#E8EAF6" },
    { icon: "🎯", label: "任务中心", color: "#795548", bg: "#EFEBE9" },
  ];

  const announcements = [
    { tag: "重要", tagColor: "#F44336", tagBg: "#FFEBEE", title: "关于2026年Q1绩效考核通知", time: "今天 09:30", read: false },
    { tag: "通知", tagColor: "#FF9800", tagBg: "#FFF3E0", title: "3月份团建活动报名截止时间提醒", time: "昨天 14:20", read: false },
    { tag: "公告", tagColor: "#9C27B0", tagBg: "#F3E5F5", title: "办公系统升级维护公告（3月15日）", time: "03-08", read: true },
  ];

  const pendingApprovals = [
    { type: "请假申请", name: "张晓明", dept: "技术部", time: "30分钟前", avatar: "张", color: "#4CAF50" },
    { type: "费用报销", name: "李婷婷", dept: "市场部", time: "1小时前", avatar: "李", color: "#FF9800" },
    { type: "出差申请", name: "王建国", dept: "销售部", time: "2小时前", avatar: "王", color: "#9C27B0" },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: theme.bg }}>
      {/* Header */}
      <div
        className="px-4 pt-3 pb-6"
        style={{ background: `linear-gradient(135deg, ${theme.gradFrom}, ${theme.gradTo})` }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white" style={{ fontSize: "12px" }}>智</span>
            </div>
            <div>
              <div className="text-white/80" style={{ fontSize: "11px" }}>智汇科技有限公司</div>
              <div className="flex items-center gap-1">
                <MapPin size={10} className="text-white/70" />
                <span className="text-white/70" style={{ fontSize: "10px" }}>上海总部</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell size={20} className="text-white" />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white" style={{ fontSize: "9px" }}>3</span>
              </div>
            </div>
            <Search size={20} className="text-white" />
          </div>
        </div>
        <div className="text-white mb-1" style={{ fontSize: "15px" }}>早上好，陈经理 👋</div>
        <div className="text-white/70" style={{ fontSize: "12px" }}>今天是 2026年3月10日 星期二</div>

        {/* Attendance Status */}
        <div className="mt-3 bg-white/15 rounded-xl p-3 flex items-center justify-between backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Clock size={16} className="text-white" />
            </div>
            <div>
              <div className="text-white" style={{ fontSize: "13px" }}>今日已打卡</div>
              <div className="text-white/70" style={{ fontSize: "11px" }}>上班 08:52 · 在岗中</div>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-white/20 px-3 py-1.5 rounded-full">
            <CheckCircle size={12} className="text-white" />
            <span className="text-white" style={{ fontSize: "11px" }}>正常</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 -mt-3 mb-3">
        <div className="rounded-2xl p-3 shadow-sm grid grid-cols-4 gap-2" style={{ background: theme.card, boxShadow: `0 4px 16px ${theme.shadow}` }}>
          {[
            { label: "待审批", value: "5", color: "#F44336", bg: "#FFEBEE" },
            { label: "待办事项", value: "12", color: "#FF9800", bg: "#FFF3E0" },
            { label: "本月出勤", value: "7天", color: "#4CAF50", bg: "#E8F5E9" },
            { label: "绩效得分", value: "92", color: theme.primary, bg: theme.primaryLight },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-1" style={{ background: stat.bg }}>
                <span style={{ color: stat.color, fontSize: "12px", fontWeight: 600 }}>{stat.value}</span>
              </div>
              <span className="text-center" style={{ color: theme.hint, fontSize: "10px" }}>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: theme.text, fontSize: "14px", fontWeight: 600 }}>常用功能</span>
          <div className="flex items-center gap-1" style={{ color: theme.primary, fontSize: "12px" }}>
            <span>全部</span>
            <ChevronRight size={12} />
          </div>
        </div>
        <div className="rounded-2xl p-3 shadow-sm" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
          <div className="grid grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <div key={action.label} className="flex flex-col items-center gap-1.5 cursor-pointer">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: action.bg }}>
                  <span style={{ fontSize: "22px" }}>{action.icon}</span>
                </div>
                <span style={{ color: theme.sub, fontSize: "10px" }}>{action.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pending Approvals */}
      <div className="px-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span style={{ color: theme.text, fontSize: "14px", fontWeight: 600 }}>待我审批</span>
            <div className="bg-red-500 text-white rounded-full px-1.5" style={{ fontSize: "10px" }}>3</div>
          </div>
          <div className="flex items-center gap-1 cursor-pointer" style={{ color: theme.primary, fontSize: "12px" }}>
            <span>查看全部</span>
            <ChevronRight size={12} />
          </div>
        </div>
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
          {pendingApprovals.map((item, index) => (
            <div
              key={item.name}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: index < pendingApprovals.length - 1 ? `1px solid ${theme.divider}` : "none" }}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: item.color, fontSize: "13px" }}>
                {item.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span style={{ color: theme.text, fontSize: "13px" }}>{item.name}</span>
                  <span style={{ color: theme.hint, fontSize: "11px" }}>·</span>
                  <span style={{ color: theme.hint, fontSize: "11px" }}>{item.dept}</span>
                </div>
                <div style={{ color: theme.sub, fontSize: "12px" }}>{item.type}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span style={{ color: theme.hint, fontSize: "10px" }}>{item.time}</span>
                <div className="text-white px-2 py-0.5 rounded-full" style={{ background: theme.primary, fontSize: "10px" }}>审批</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Announcements */}
      <div className="px-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: theme.text, fontSize: "14px", fontWeight: 600 }}>公司公告</span>
          <div className="flex items-center gap-1 cursor-pointer" style={{ color: theme.primary, fontSize: "12px" }}>
            <span>更多</span>
            <ChevronRight size={12} />
          </div>
        </div>
        <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
          {announcements.map((item, index) => (
            <div
              key={item.title}
              className="px-4 py-3"
              style={{ borderBottom: index < announcements.length - 1 ? `1px solid ${theme.divider}` : "none" }}
            >
              <div className="flex items-start gap-2">
                <div className="px-1.5 py-0.5 rounded mt-0.5 shrink-0" style={{ background: item.tagBg, fontSize: "10px", color: item.tagColor }}>
                  {item.tag}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 truncate" style={{ color: item.read ? theme.hint : theme.text, fontSize: "13px" }}>
                    {item.title}
                  </div>
                  <div style={{ color: theme.hint, fontSize: "11px" }}>{item.time}</div>
                </div>
                {!item.read && <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Today Schedule */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: theme.text, fontSize: "14px", fontWeight: 600 }}>今日日程</span>
          <div className="flex items-center gap-1 cursor-pointer" style={{ color: theme.primary, fontSize: "12px" }}>
            <span>日历</span>
            <ChevronRight size={12} />
          </div>
        </div>
        <div className="rounded-2xl shadow-sm p-3 space-y-2" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
          {[
            { time: "10:00", title: "产品周会", type: "会议", color: "#7C3AED", bg: "#F3E8FF" },
            { time: "14:00", title: "Q1季度总结汇报", type: "汇报", color: "#0891B2", bg: "#E0F2FE" },
            { time: "16:30", title: "新项目启动会", type: "会议", color: "#059669", bg: "#D1FAE5" },
          ].map((event) => (
            <div key={event.title} className="flex items-center gap-3">
              <div className="w-10 shrink-0 text-right" style={{ color: theme.hint, fontSize: "11px" }}>{event.time}</div>
              <div className="w-0.5 h-8 rounded-full" style={{ background: event.color }} />
              <div className="flex-1 flex items-center justify-between">
                <span style={{ color: theme.text, fontSize: "12px" }}>{event.title}</span>
                <div className="px-2 py-0.5 rounded-full" style={{ background: event.bg, color: event.color, fontSize: "10px" }}>
                  {event.type}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
