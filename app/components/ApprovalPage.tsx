import { Plus, Filter } from "lucide-react";
import { useState } from "react";
import { useTheme } from "../context/ThemeContext";

export function ApprovalPage() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"pending" | "mine" | "done">("pending");

  const tabs = [
    { key: "pending", label: "待审批", count: 5 },
    { key: "mine", label: "我发起的", count: 8 },
    { key: "done", label: "已处理", count: 24 },
  ] as const;

  const approvalTypes = [
    { icon: "🏖️", label: "请假申请", color: "#4CAF50", bg: "#E8F5E9" },
    { icon: "💰", label: "费用报销", color: "#FF9800", bg: "#FFF3E0" },
    { icon: "✈️", label: "出差申请", color: "#9C27B0", bg: "#F3E5F5" },
    { icon: "🏢", label: "用章申请", color: "#00BCD4", bg: "#E0F7FA" },
    { icon: "🚗", label: "用车申请", color: "#F44336", bg: "#FFEBEE" },
    { icon: "📦", label: "物资采购", color: "#FF5722", bg: "#FBE9E7" },
    { icon: "⏰", label: "加班申请", color: "#3F51B5", bg: "#E8EAF6" },
    { icon: "➕", label: "更多", color: "#999", bg: "#F5F5F5" },
  ];

  const pendingList = [
    { id: 1, type: "请假申请", name: "张晓明", dept: "技术部", status: "待审批", statusColor: "#FF9800", statusBg: "#FFF3E0", detail: "事假 · 3月11日 1天", avatar: "张", avatarColor: "#4CAF50", time: "30分钟前", urgent: true },
    { id: 2, type: "费用报销", name: "李婷婷", dept: "市场部", status: "待审批", statusColor: "#FF9800", statusBg: "#FFF3E0", detail: "差旅费 · ¥2,580.00", avatar: "李", avatarColor: "#FF9800", time: "1小时前", urgent: false },
    { id: 3, type: "出差申请", name: "王建国", dept: "销售部", status: "待审批", statusColor: "#FF9800", statusBg: "#FFF3E0", detail: "北京出差 · 3月12日-14日", avatar: "王", avatarColor: "#9C27B0", time: "2小时前", urgent: false },
    { id: 4, type: "用章申请", name: "赵美丽", dept: "行政部", status: "待审批", statusColor: "#FF9800", statusBg: "#FFF3E0", detail: "合同章 · 合作协议盖章", avatar: "赵", avatarColor: "#00BCD4", time: "3小时前", urgent: true },
    { id: 5, type: "加班申请", name: "陈志远", dept: "研发部", status: "待审批", statusColor: "#FF9800", statusBg: "#FFF3E0", detail: "加班 · 3月10日 2小时", avatar: "陈", avatarColor: "#F44336", time: "4小时前", urgent: false },
  ];

  const mineList = [
    { id: 6, type: "请假申请", name: "我", dept: "", status: "审批中", statusColor: theme.primary, statusBg: theme.primaryLight, detail: "年假 · 3月15日-16日 2天", avatar: "我", avatarColor: theme.primary, time: "今天 09:00", urgent: false },
    { id: 7, type: "费用报销", name: "我", dept: "", status: "已通过", statusColor: "#4CAF50", statusBg: "#E8F5E9", detail: "交通费 · ¥320.00", avatar: "我", avatarColor: theme.primary, time: "昨天", urgent: false },
    { id: 8, type: "出差申请", name: "我", dept: "", status: "已驳回", statusColor: "#F44336", statusBg: "#FFEBEE", detail: "深圳出差 · 3月8日-9日", avatar: "我", avatarColor: theme.primary, time: "03-08", urgent: false },
  ];

  const currentList = activeTab === "pending" ? pendingList : activeTab === "mine" ? mineList : [];

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg }}>
      {/* Header */}
      <div
        className="px-4 pt-3 pb-4"
        style={{ background: `linear-gradient(135deg, ${theme.gradFrom}, ${theme.gradTo})` }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-white" style={{ fontSize: "16px", fontWeight: 600 }}>审批中心</span>
          <button className="flex items-center gap-1 bg-white/20 text-white px-3 py-1.5 rounded-full">
            <Plus size={14} />
            <span style={{ fontSize: "12px" }}>发起</span>
          </button>
        </div>
        {/* Tabs in header */}
        <div className="flex gap-0 bg-white/15 rounded-xl p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-1.5 rounded-xl flex items-center justify-center gap-1 transition-all"
              style={{ background: activeTab === tab.key ? "rgba(255,255,255,0.9)" : "transparent" }}
            >
              <span
                style={{
                  fontSize: "12px",
                  color: activeTab === tab.key ? theme.primary : "rgba(255,255,255,0.8)",
                  fontWeight: activeTab === tab.key ? 600 : 400,
                }}
              >
                {tab.label}
              </span>
              {tab.count > 0 && (
                <div
                  className="rounded-full px-1.5"
                  style={{
                    background: activeTab === tab.key ? theme.primary : "rgba(255,255,255,0.3)",
                    color: activeTab === tab.key ? "#FFFFFF" : "rgba(255,255,255,0.9)",
                    fontSize: "9px",
                  }}
                >
                  {tab.count}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Approval Type Grid */}
        {activeTab === "pending" && (
          <div className="px-4 pt-3 mb-3">
            <div className="rounded-2xl p-3 shadow-sm" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
              <div className="grid grid-cols-4 gap-3">
                {approvalTypes.map((type) => (
                  <div key={type.label} className="flex flex-col items-center gap-1.5 cursor-pointer">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: type.bg }}>
                      <span style={{ fontSize: "22px" }}>{type.icon}</span>
                    </div>
                    <span style={{ color: theme.sub, fontSize: "10px" }}>{type.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="px-4 mb-2 flex items-center justify-between">
          <span style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }}>
            {activeTab === "pending" ? `待处理 (${pendingList.length})` : activeTab === "mine" ? `我的申请 (${mineList.length})` : "历史记录"}
          </span>
          <div className="flex items-center gap-1" style={{ color: theme.sub }}>
            <Filter size={12} />
            <span style={{ fontSize: "12px" }}>筛选</span>
          </div>
        </div>

        {/* List */}
        <div className="px-4 space-y-2 pb-4">
          {currentList.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl shadow-sm overflow-hidden"
              style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}
            >
              <div className="px-4 pt-3 pb-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: item.avatarColor, fontSize: "14px" }}>
                    {item.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }}>{item.type}</span>
                        {item.urgent && (
                          <div className="bg-red-100 text-red-500 px-1.5 rounded" style={{ fontSize: "9px" }}>紧急</div>
                        )}
                      </div>
                      <div className="px-2 py-0.5 rounded-full" style={{ background: item.statusBg, color: item.statusColor, fontSize: "10px" }}>
                        {item.status}
                      </div>
                    </div>
                    {item.dept && (
                      <div style={{ color: theme.hint, fontSize: "11px" }} className="mb-1">{item.name} · {item.dept}</div>
                    )}
                    <div style={{ color: theme.sub, fontSize: "12px" }}>{item.detail}</div>
                    <div style={{ color: theme.hint, fontSize: "10px" }} className="mt-1">{item.time}</div>
                  </div>
                </div>

                {activeTab === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      className="flex-1 py-2 rounded-xl border"
                      style={{ borderColor: theme.divider, color: theme.sub, fontSize: "12px" }}
                    >
                      驳回
                    </button>
                    <button
                      className="flex-1 py-2 rounded-xl text-white"
                      style={{ background: theme.primary, fontSize: "12px" }}
                    >
                      同意
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {activeTab === "done" && (
            <div className="flex flex-col items-center py-10" style={{ color: theme.hint }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ background: theme.primaryLight }}>
                <span style={{ fontSize: "24px" }}>✓</span>
              </div>
              <span style={{ fontSize: "13px" }}>暂无历史记录</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
