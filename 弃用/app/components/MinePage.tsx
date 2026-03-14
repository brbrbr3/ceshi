import { ChevronRight, LogOut, Star, Award, TrendingUp, Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

interface MinePageProps {
  onLogout?: () => void;
}

export function MinePage({ onLogout }: MinePageProps) {
  const { theme, toggleDark } = useTheme();

  const menuGroups = [
    {
      title: "工作记录",
      items: [
        { icon: "📅", label: "考勤记录", badge: null, subColor: null },
        { icon: "📊", label: "工作报告", badge: "3条未读", badgeColor: theme.primary },
        { icon: "💰", label: "薪酬明细", badge: null, subColor: null },
        { icon: "🎯", label: "绩效评估", badge: null, subColor: null },
      ],
    },
    {
      title: "个人设置",
      items: [
        { icon: "🔔", label: "消息通知", badge: null, subColor: null },
        { icon: "🔒", label: "账号安全", badge: null, subColor: null },
        { icon: "❓", label: "帮助中心", badge: null, subColor: null },
        { icon: "⭐", label: "意见反馈", badge: null, subColor: null },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: theme.bg }}>
      {/* Profile Header */}
      <div
        className="px-4 pt-4 pb-6"
        style={{ background: `linear-gradient(135deg, ${theme.gradFrom}, ${theme.gradTo})` }}
      >
        {/* Dark Mode Toggle */}
        <div className="flex justify-end mb-2">
          <button
            onClick={toggleDark}
            className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full"
          >
            {theme.isDark
              ? <Sun size={13} className="text-white" />
              : <Moon size={13} className="text-white" />}
            <span className="text-white" style={{ fontSize: "11px" }}>{theme.isDark ? "浅色" : "深色"}</span>
          </button>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-white/25 flex items-center justify-center shadow-lg">
              <span className="text-white" style={{ fontSize: "24px", fontWeight: 700 }}>陈</span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-400 rounded-full border-2 border-white flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="text-white mb-0.5" style={{ fontSize: "16px", fontWeight: 600 }}>陈志远</div>
            <div className="text-white/70" style={{ fontSize: "12px" }}>产品经理 · 产品部</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="bg-white/20 text-white px-2 py-0.5 rounded-full" style={{ fontSize: "10px" }}>P6</div>
              <div className="bg-white/10 text-white/70 px-2 py-0.5 rounded-full" style={{ fontSize: "10px" }}>工号: 20240128</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-white/50" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "本月出勤", value: "7天", icon: "📅" },
            { label: "年假余额", value: "8天", icon: "🏖️" },
            { label: "绩效得分", value: "92分", icon: "⭐" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-lg mb-0.5">{stat.icon}</div>
              <div className="text-white" style={{ fontSize: "13px", fontWeight: 600 }}>{stat.value}</div>
              <div className="text-white/60" style={{ fontSize: "10px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Achievement Banner */}
      <div className="px-4 -mt-2 mb-3">
        <div
          className="rounded-2xl p-3 flex items-center gap-3 shadow-sm"
          style={{ background: `linear-gradient(135deg, #FF9800, #FF5722)`, boxShadow: "0 4px 16px rgba(255,152,0,0.25)" }}
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Award size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="text-white" style={{ fontSize: "12px", fontWeight: 500 }}>本月全勤奖励</div>
            <div className="text-white/80" style={{ fontSize: "11px" }}>坚持打卡已获得 100积分</div>
          </div>
          <div className="bg-white/20 text-white px-3 py-1 rounded-full" style={{ fontSize: "11px" }}>领取</div>
        </div>
      </div>

      {/* Quick Info Cards */}
      <div className="px-4 mb-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl shadow-sm p-3" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} style={{ color: theme.primary }} />
              <span style={{ color: theme.text, fontSize: "12px", fontWeight: 500 }}>今日工作时长</span>
            </div>
            <div style={{ color: theme.primary, fontSize: "18px", fontWeight: 600 }}>7h 32m</div>
            <div style={{ color: theme.hint, fontSize: "10px" }}>08:52 上班 · 在岗中</div>
          </div>
          <div className="rounded-2xl shadow-sm p-3" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
            <div className="flex items-center gap-2 mb-2">
              <Star size={14} className="text-[#FF9800]" />
              <span style={{ color: theme.text, fontSize: "12px", fontWeight: 500 }}>积分余额</span>
            </div>
            <div className="text-[#FF9800]" style={{ fontSize: "18px", fontWeight: 600 }}>1,280</div>
            <div style={{ color: theme.hint, fontSize: "10px" }}>本月获得 +100</div>
          </div>
        </div>
      </div>

      {/* Menu Groups */}
      {menuGroups.map((group) => (
        <div key={group.title} className="px-4 mb-3">
          <div style={{ color: theme.hint, fontSize: "12px" }} className="mb-2">{group.title}</div>
          <div className="rounded-2xl shadow-sm overflow-hidden" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
            {group.items.map((item, index) => (
              <div
                key={item.label}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                style={{ borderBottom: index < group.items.length - 1 ? `1px solid ${theme.divider}` : "none" }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: theme.primaryLight }}
                >
                  <span style={{ fontSize: "18px" }}>{item.icon}</span>
                </div>
                <span className="flex-1" style={{ color: theme.text, fontSize: "13px" }}>{item.label}</span>
                {item.badge && (
                  <span style={{ color: item.badgeColor || theme.primary, fontSize: "11px" }}>{item.badge}</span>
                )}
                <ChevronRight size={14} style={{ color: theme.hint }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Company Info */}
      <div className="px-4 mb-3">
        <div className="rounded-2xl shadow-sm p-4" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
          <div className="flex items-center gap-3 mb-3 pb-3" style={{ borderBottom: `1px solid ${theme.divider}` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: theme.primaryLight }}>
              <span style={{ fontSize: "18px" }}>🏢</span>
            </div>
            <div>
              <div style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }}>智汇科技有限公司</div>
              <div style={{ color: theme.hint, fontSize: "11px" }}>上海市浦东新区张江高科技园区</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "入职时间", value: "2024-01-28" },
              { label: "所在部门", value: "产品部" },
              { label: "直属上级", value: "刘总监" },
            ].map((info) => (
              <div key={info.label}>
                <div style={{ color: theme.hint, fontSize: "10px" }}>{info.label}</div>
                <div style={{ color: theme.text, fontSize: "11px" }}>{info.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="px-4 mb-6">
        <button
          onClick={onLogout}
          className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 shadow-sm"
          style={{ background: theme.card, color: "#EF4444", fontSize: "13px", boxShadow: `0 2px 12px ${theme.shadow}` }}
        >
          <LogOut size={15} />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  );
}
