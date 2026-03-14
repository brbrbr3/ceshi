import { useState, useCallback } from "react";
import { PhoneMockup } from "./components/PhoneMockup";
import { LoginPage } from "./components/LoginPage";
import { HomePage } from "./components/HomePage";
import { ApprovalPage } from "./components/ApprovalPage";
import { WorkPage } from "./components/WorkPage";
import { ContactsPage } from "./components/ContactsPage";
import { MinePage } from "./components/MinePage";
import { ThemeContext, buildTheme, Gender } from "./context/ThemeContext";
import { Moon, Sun, Monitor } from "lucide-react";

type ViewMode = "preview" | "showcase";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [gender, setGender] = useState<Gender>("male");
  const [isDark, setIsDark] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

  const theme = buildTheme(gender, isDark);
  const toggleDark = useCallback(() => setIsDark((d) => !d), []);

  const handleLogin = (g: Gender) => {
    setGender(g);
    setLoggedIn(true);
  };

  const handleLogout = () => {
    setLoggedIn(false);
  };

  // ─── Login Screen ──────────────────────────────────────────────────────────��
  if (!loggedIn) {
    // Show login inside a phone mockup on a nice background
    const loginGradFrom = "#2563EB";
    const loginGradTo = "#7C3AED";

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: `linear-gradient(145deg, ${loginGradFrom} 0%, ${loginGradTo} 100%)` }}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20" style={{ background: "rgba(255,255,255,0.15)", filter: "blur(60px)" }} />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full opacity-20" style={{ background: "rgba(255,255,255,0.15)", filter: "blur(60px)" }} />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* Branding */}
          <div className="text-center mb-2">
            <div className="text-white/90 mb-1" style={{ fontSize: "13px" }}>智汇科技有限公司</div>
            <div className="text-white/60" style={{ fontSize: "11px" }}>微信小程序 · 企业办公平台</div>
          </div>

          {/* Phone Mockup */}
          <div className="relative" style={{ width: 375, height: 812 }}>
            <div
              className="absolute inset-0 rounded-[44px]"
              style={{ background: "#1a1a1a", boxShadow: "0 40px 100px rgba(0,0,0,0.5), inset 0 0 0 2px #333" }}
            />
            <div
              className="absolute rounded-[38px] overflow-hidden"
              style={{ top: 10, left: 10, right: 10, bottom: 10, background: "#EEF2FF" }}
            >
              {/* Status Bar */}
              <div
                className="flex items-center justify-between px-6 shrink-0"
                style={{ paddingTop: "14px", paddingBottom: "6px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)" }}
              >
                <span className="text-white" style={{ fontSize: "12px", fontWeight: 600 }}>9:41</span>
                <div className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-7 bg-[#1a1a1a] rounded-b-2xl" />
                <div className="flex items-center gap-0.5">
                  <div className="w-6 h-3 rounded-sm border border-white/60 p-0.5 flex items-center">
                    <div className="h-full rounded-xs bg-white" style={{ width: "80%" }} />
                  </div>
                </div>
              </div>
              {/* Login Page */}
              <div style={{ height: "calc(100% - 36px)" }}>
                <LoginPage onLogin={handleLogin} />
              </div>
            </div>
          </div>

          <div className="text-white/40" style={{ fontSize: "11px" }}>选择用户类型并登录以进入办公系统</div>
        </div>
      </div>
    );
  }

  // ─── Main App ───────────────────────────────────────────────────────────────
  return (
    <ThemeContext.Provider value={{ theme, toggleDark }}>
      <div
        className="min-h-screen flex flex-col"
        style={{ background: isDark ? "#0A0F1E" : "#E8EEFF" }}
      >
        {/* Design Studio Header */}
        <div
          className="flex items-center justify-between px-8 py-3 shrink-0"
          style={{
            background: isDark ? "#1E293B" : "#FFFFFF",
            borderBottom: `1px solid ${theme.divider}`,
            boxShadow: `0 2px 12px ${theme.shadow}`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${theme.gradFrom}, ${theme.gradTo})` }}
            >
              <span className="text-white" style={{ fontSize: "13px", fontWeight: 700 }}>智</span>
            </div>
            <div>
              <div style={{ color: theme.text, fontSize: "15px", fontWeight: 600 }}>智汇办公 · 微信小程序</div>
              <div style={{ color: theme.hint, fontSize: "11px" }}>
                UI 设计稿 v2.2.0 · {gender === "male" ? "🔵 蓝色主题" : "🌸 粉色主题"} · {isDark ? "🌙 深色模式" : "☀️ 浅色模式"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode */}
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: isDark ? "#0F172A" : "#F5F8FF" }}>
              <button
                onClick={() => setViewMode("preview")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all"
                style={{
                  background: viewMode === "preview" ? theme.card : "transparent",
                  color: viewMode === "preview" ? theme.primary : theme.hint,
                  fontSize: "12px",
                  boxShadow: viewMode === "preview" ? `0 1px 4px ${theme.shadow}` : "none",
                }}
              >
                <Monitor size={13} />
                <span>单屏预览</span>
              </button>
              <button
                onClick={() => setViewMode("showcase")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all"
                style={{
                  background: viewMode === "showcase" ? theme.card : "transparent",
                  color: viewMode === "showcase" ? theme.primary : theme.hint,
                  fontSize: "12px",
                  boxShadow: viewMode === "showcase" ? `0 1px 4px ${theme.shadow}` : "none",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.7" />
                  <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.7" />
                  <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.7" />
                  <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.7" />
                </svg>
                <span>多屏展示</span>
              </button>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDark}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all"
              style={{
                background: isDark ? "#334155" : theme.primaryLight,
                color: theme.primary,
                fontSize: "12px",
              }}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
              <span>{isDark ? "浅色" : "深色"}</span>
            </button>

            {/* Gender Toggle */}
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: isDark ? "#0F172A" : "#F5F8FF" }}>
              <button
                onClick={() => setGender("male")}
                className="px-3 py-1.5 rounded-md transition-all"
                style={{
                  background: gender === "male" ? "#2563EB" : "transparent",
                  color: gender === "male" ? "#FFFFFF" : theme.hint,
                  fontSize: "12px",
                }}
              >👨‍💼 男</button>
              <button
                onClick={() => setGender("female")}
                className="px-3 py-1.5 rounded-md transition-all"
                style={{
                  background: gender === "female" ? "#D03878" : "transparent",
                  color: gender === "female" ? "#FFFFFF" : theme.hint,
                  fontSize: "12px",
                }}
              >👩‍💼 女</button>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg"
              style={{ background: isDark ? "#2D1220" : "#FFF0F6", color: "#D03878", fontSize: "12px" }}
            >
              退出登录
            </button>
          </div>
        </div>

        {/* Content */}
        {viewMode === "preview" ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-5">
              <div className="text-center">
                <div style={{ color: theme.text, fontSize: "18px", fontWeight: 600 }} className="mb-1">交互式预览</div>
                <div style={{ color: theme.hint, fontSize: "12px" }}>点击底部导航栏切换页面 · 在「我的」页面可切换深色模式</div>
              </div>
              <PhoneMockup onLogout={handleLogout} />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-8">
            <div className="text-center mb-8">
              <div style={{ color: theme.text, fontSize: "18px", fontWeight: 600 }} className="mb-1">页面总览</div>
              <div style={{ color: theme.hint, fontSize: "12px" }}>共 5 个核心页面 · {gender === "male" ? "蓝色主题" : "粉色主题"} · {isDark ? "深色模式" : "浅色模式"}</div>
            </div>
            <ShowcaseView isDark={isDark} gender={gender} />
          </div>
        )}
      </div>
    </ThemeContext.Provider>
  );
}

// ─── Showcase ──────────────────────────────────────────────────────────────────
function ShowcaseView({ isDark, gender }: { isDark: boolean; gender: Gender }) {
  const theme = buildTheme(gender, isDark);

  const pageDefs = [
    { label: "首页", desc: "打卡、快捷功能、公告、待办", color: theme.primary, node: <HomePage /> },
    { label: "审批中心", desc: "发起、待审批、流程跟踪", color: "#FF9800", node: <ApprovalPage /> },
    { label: "工作台", desc: "任务、日程、项目进度", color: "#9C27B0", node: <WorkPage /> },
    { label: "通讯录", desc: "成员列表、部门筛选", color: "#059669", node: <ContactsPage /> },
    { label: "个人中心", desc: "档案、考勤、设置", color: "#F44336", node: <MinePage /> },
  ];

  const navLabels = ["首页", "审批", "工作台", "通讯录", "我的"];

  return (
    <ThemeContext.Provider value={{ theme, toggleDark: () => {} }}>
      <div className="flex flex-wrap gap-8 justify-center">
        {pageDefs.map((page, i) => (
          <div key={page.label} className="flex flex-col items-center gap-4">
            <MiniPhone
              pageNode={page.node}
              activeIndex={i}
              navLabels={navLabels}
              theme={theme}
            />
            <div className="text-center">
              <div
                className="inline-block px-3 py-1 rounded-full text-white mb-1"
                style={{ background: page.color, fontSize: "12px" }}
              >
                {page.label}
              </div>
              <div style={{ color: theme.hint, fontSize: "11px" }}>{page.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </ThemeContext.Provider>
  );
}

function MiniPhone({
  pageNode,
  activeIndex,
  navLabels,
  theme,
}: {
  pageNode: React.ReactNode;
  activeIndex: number;
  navLabels: string[];
  theme: ReturnType<typeof buildTheme>;
}) {
  return (
    <div className="relative" style={{ width: 240, height: 520 }}>
      <div
        className="absolute inset-0 rounded-[36px]"
        style={{
          background: theme.isDark ? "#111" : "#1a1a1a",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3), inset 0 0 0 1.5px #333",
        }}
      />
      <div
        className="absolute rounded-[30px] overflow-hidden flex flex-col"
        style={{ top: 8, left: 8, right: 8, bottom: 8, background: theme.bg }}
      >
        {/* Status */}
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ paddingTop: "10px", paddingBottom: "6px", background: theme.gradFrom }}
        >
          <span className="text-white" style={{ fontSize: "9px", fontWeight: 600 }}>9:41</span>
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-16 h-5 bg-[#1a1a1a] rounded-b-xl" />
          <div className="w-4 h-2 rounded-sm border border-white/60 p-0.5 flex items-center">
            <div className="h-full bg-white rounded-xs" style={{ width: "80%" }} />
          </div>
        </div>

        {/* Page */}
        <div className="flex-1 overflow-hidden" style={{ position: "relative" }}>
          <div
            style={{
              transform: "scale(0.64)",
              transformOrigin: "top left",
              width: "156.25%",
              height: "156.25%",
              pointerEvents: "none",
              overflow: "hidden",
            }}
          >
            {pageNode}
          </div>
        </div>

        {/* Nav */}
        <div
          className="flex items-center shrink-0"
          style={{ height: 36, background: theme.nav, borderTop: `1px solid ${theme.divider}` }}
        >
          {navLabels.map((label, j) => (
            <div key={label} className="flex-1 flex flex-col items-center justify-center py-1 gap-0.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: j === activeIndex ? theme.primary : theme.divider }}
              />
              <span style={{ fontSize: "7px", color: j === activeIndex ? theme.primary : theme.hint }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
