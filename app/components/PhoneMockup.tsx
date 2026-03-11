import { useState } from "react";
import { HomePage } from "./HomePage";
import { ApprovalPage } from "./ApprovalPage";
import { WorkPage } from "./WorkPage";
import { ContactsPage } from "./ContactsPage";
import { MinePage } from "./MinePage";
import { useTheme } from "../context/ThemeContext";

interface PhoneMockupProps {
  onLogout?: () => void;
}

export function PhoneMockup({ onLogout }: PhoneMockupProps) {
  const [activeTab, setActiveTab] = useState("home");
  const { theme } = useTheme();

  const navItems = [
    {
      key: "home",
      label: "首页",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9 21 9 15 12 15C15 15 15 21 15 21M9 21H15" stroke={active ? theme.primary : theme.hint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      key: "approval",
      label: "审批",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3" width="14" height="18" rx="2" stroke={active ? theme.primary : theme.hint} strokeWidth="2" />
          <path d="M8 8H14M8 12H14M8 16H11" stroke={active ? theme.primary : theme.hint} strokeWidth="2" strokeLinecap="round" />
          <circle cx="19" cy="5" r="3" fill={active ? theme.primary : theme.hint} />
        </svg>
      ),
    },
    {
      key: "work",
      label: "工作台",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.5" stroke={active ? theme.primary : theme.hint} strokeWidth="2" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" stroke={active ? theme.primary : theme.hint} strokeWidth="2" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" stroke={active ? theme.primary : theme.hint} strokeWidth="2" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" stroke={active ? theme.primary : theme.hint} strokeWidth="2" />
        </svg>
      ),
    },
    {
      key: "contacts",
      label: "通讯录",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="3" stroke={active ? theme.primary : theme.hint} strokeWidth="2" />
          <circle cx="17" cy="9" r="2.5" stroke={active ? theme.primary : theme.hint} strokeWidth="1.8" />
          <path d="M3 19C3 16.2386 5.68629 14 9 14C12.3137 14 15 16.2386 15 19" stroke={active ? theme.primary : theme.hint} strokeWidth="2" strokeLinecap="round" />
          <path d="M17 14C18.3261 14 19.5979 14.5268 20.5355 15.4645C21.4732 16.4021 22 17.6739 22 19" stroke={active ? theme.primary : theme.hint} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: "mine",
      label: "我的",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke={active ? theme.primary : theme.hint} strokeWidth="2" />
          <path d="M4 20C4 17.2386 7.58172 15 12 15C16.4183 15 20 17.2386 20 20" stroke={active ? theme.primary : theme.hint} strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  const renderPage = () => {
    switch (activeTab) {
      case "home": return <HomePage onNavigate={setActiveTab} />;
      case "approval": return <ApprovalPage />;
      case "work": return <WorkPage />;
      case "contacts": return <ContactsPage />;
      case "mine": return <MinePage onLogout={onLogout} />;
      default: return <HomePage onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="relative" style={{ width: 375, height: 812 }}>
      {/* Phone Shell */}
      <div
        className="absolute inset-0 rounded-[44px]"
        style={{
          background: theme.isDark ? "#111" : "#1a1a1a",
          boxShadow: `0 30px 80px rgba(0,0,0,0.4), inset 0 0 0 2px ${theme.isDark ? "#333" : "#2a2a2a"}`,
        }}
      />

      {/* Screen */}
      <div
        className="absolute rounded-[38px] overflow-hidden flex flex-col"
        style={{ top: 10, left: 10, right: 10, bottom: 10, background: theme.bg }}
      >
        {/* Status Bar */}
        <div
          className="flex items-center justify-between px-6 shrink-0"
          style={{ paddingTop: "14px", paddingBottom: "6px", background: theme.gradFrom }}
        >
          <span className="text-white" style={{ fontSize: "12px", fontWeight: 600 }}>9:41</span>
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-7 bg-[#1a1a1a] rounded-b-2xl" />
          <div className="flex items-center gap-1.5">
            <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
              <rect x="0" y="5" width="3" height="6" rx="0.5" fill="white" opacity="0.9" />
              <rect x="4" y="3" width="3" height="8" rx="0.5" fill="white" opacity="0.9" />
              <rect x="8" y="1" width="3" height="10" rx="0.5" fill="white" opacity="0.9" />
              <rect x="12" y="0" width="3" height="11" rx="0.5" fill="white" opacity="0.4" />
            </svg>
            <svg width="15" height="11" viewBox="0 0 16 12" fill="none">
              <path d="M8 2.5C10.2 2.5 12.2 3.4 13.6 4.9L15 3.5C13.2 1.7 10.7 0.5 8 0.5C5.3 0.5 2.8 1.7 1 3.5L2.4 4.9C3.8 3.4 5.8 2.5 8 2.5Z" fill="white" opacity="0.9" />
              <path d="M8 5.5C9.5 5.5 10.8 6.1 11.8 7.1L13.2 5.7C11.8 4.3 10 3.5 8 3.5C6 3.5 4.2 4.3 2.8 5.7L4.2 7.1C5.2 6.1 6.5 5.5 8 5.5Z" fill="white" opacity="0.9" />
              <circle cx="8" cy="10" r="1.5" fill="white" />
            </svg>
            <div className="flex items-center gap-0.5">
              <div className="w-6 h-3 rounded-sm border border-white/60 p-0.5 flex items-center">
                <div className="h-full rounded-xs bg-white" style={{ width: "80%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-hidden">
          {renderPage()}
        </div>

        {/* Tab Bar */}
        <div
          className="flex items-center shrink-0"
          style={{
            height: 58,
            background: theme.nav,
            borderTop: `1px solid ${theme.divider}`,
            paddingBottom: 4,
          }}
        >
          {navItems.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2"
              >
                {item.icon(active)}
                <span
                  style={{
                    fontSize: "9px",
                    color: active ? theme.primary : theme.hint,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {item.label}
                </span>
                {active && (
                  <div className="w-1 h-1 rounded-full" style={{ background: theme.primary }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
