import { useState } from "react";
import { Search, Phone, MessageCircle, ChevronRight, Users } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const departments = ["全部", "产品部", "技术部", "市场部", "销售部", "行政部", "财务部"];

const employees = [
  { id: 1, name: "刘总监", role: "产品总监", dept: "产品部", initial: "刘", color: "#7C3AED", status: "online", phone: "138****0001" },
  { id: 2, name: "陈志远", role: "产品经理", dept: "产品部", initial: "陈", color: "#2563EB", status: "online", phone: "138****0002", isSelf: true },
  { id: 3, name: "林小雨", role: "UI设计师", dept: "产品部", initial: "林", color: "#D03878", status: "busy", phone: "138****0003" },
  { id: 4, name: "张伟", role: "前端工程师", dept: "技术部", initial: "张", color: "#059669", status: "online", phone: "138****0004" },
  { id: 5, name: "王建国", role: "后端工程师", dept: "技术部", initial: "王", color: "#0891B2", status: "offline", phone: "138****0005" },
  { id: 6, name: "赵磊", role: "架构师", dept: "技术部", initial: "赵", color: "#7C3AED", status: "online", phone: "138****0006" },
  { id: 7, name: "孙燕", role: "测试工程师", dept: "技术部", initial: "孙", color: "#D97706", status: "busy", phone: "138****0007" },
  { id: 8, name: "李婷婷", role: "市场专员", dept: "市场部", initial: "李", color: "#EC4899", status: "online", phone: "138****0008" },
  { id: 9, name: "周浩", role: "品牌经理", dept: "市场部", initial: "周", color: "#F59E0B", status: "offline", phone: "138****0009" },
  { id: 10, name: "吴晓峰", role: "销售总监", dept: "销售部", initial: "吴", color: "#EF4444", status: "online", phone: "138****0010" },
  { id: 11, name: "郑美丽", role: "销售经理", dept: "销售部", initial: "郑", color: "#F472B6", status: "busy", phone: "138****0011" },
  { id: 12, name: "黄建华", role: "行政主管", dept: "行政部", initial: "黄", color: "#84CC16", status: "online", phone: "138****0012" },
  { id: 13, name: "谢思思", role: "行政专员", dept: "行政部", initial: "谢", color: "#14B8A6", status: "offline", phone: "138****0013" },
  { id: 14, name: "陈财务", role: "财务主管", dept: "财务部", initial: "陈", color: "#8B5CF6", status: "online", phone: "138****0014" },
  { id: 15, name: "方小丽", role: "财务专员", dept: "财务部", initial: "方", color: "#F97316", status: "offline", phone: "138****0015" },
];

const statusConfig = {
  online: { label: "在线", color: "#22C55E", bg: "#F0FFF4" },
  busy: { label: "忙碌", color: "#F59E0B", bg: "#FFFBEB" },
  offline: { label: "离线", color: "#94A3B8", bg: "#F8FAFC" },
};

export function ContactsPage() {
  const { theme } = useTheme();
  const [selectedDept, setSelectedDept] = useState("全部");
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<typeof employees[0] | null>(null);

  const filtered = employees.filter((e) => {
    const matchDept = selectedDept === "全部" || e.dept === selectedDept;
    const matchSearch = search === "" || e.name.includes(search) || e.role.includes(search) || e.dept.includes(search);
    return matchDept && matchSearch;
  });

  // Group by department
  const grouped: Record<string, typeof employees> = {};
  filtered.forEach((e) => {
    if (!grouped[e.dept]) grouped[e.dept] = [];
    grouped[e.dept].push(e);
  });

  const onlineCount = employees.filter((e) => e.status === "online").length;

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg }}>
      {/* Header */}
      <div
        className="px-4 pt-3 pb-4"
        style={{ background: `linear-gradient(135deg, ${theme.gradFrom}, ${theme.gradTo})` }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-white" style={{ fontSize: "16px", fontWeight: 600 }}>通讯录</span>
          <div className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-white" style={{ fontSize: "11px" }}>{onlineCount}人在线</span>
          </div>
        </div>
        {/* Search Bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/20 backdrop-blur-sm">
          <Search size={14} className="text-white/70" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名、职位、部门..."
            className="flex-1 outline-none bg-transparent text-white placeholder-white/60"
            style={{ fontSize: "13px" }}
          />
        </div>
      </div>

      {/* Team Overview */}
      {!search && selectedDept === "全部" && (
        <div className="px-4 py-3">
          <div className="rounded-2xl p-3 flex items-center gap-3 shadow-sm" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: theme.primaryLight }}>
              <Users size={20} style={{ color: theme.primary }} />
            </div>
            <div className="flex-1">
              <div style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }}>智汇科技 · 全员</div>
              <div style={{ color: theme.sub, fontSize: "11px" }}>共 {employees.length} 名成员 · {onlineCount} 人在线</div>
            </div>
            <ChevronRight size={14} style={{ color: theme.hint }} />
          </div>
        </div>
      )}

      {/* Department Filter */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className="px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 transition-all"
              style={{
                background: selectedDept === dept ? theme.primary : theme.card,
                color: selectedDept === dept ? "#FFFFFF" : theme.sub,
                fontSize: "11px",
                boxShadow: selectedDept === dept ? `0 4px 12px ${theme.primary}40` : `0 1px 4px ${theme.shadow}`,
              }}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {Object.entries(grouped).map(([dept, members]) => (
          <div key={dept} className="mb-3">
            {(selectedDept === "全部") && (
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: theme.sub, fontSize: "12px", fontWeight: 500 }}>{dept}</span>
                <div className="h-px flex-1" style={{ background: theme.divider }} />
                <span style={{ color: theme.hint, fontSize: "11px" }}>{members.length}人</span>
              </div>
            )}
            <div
              className="rounded-2xl overflow-hidden shadow-sm"
              style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}
            >
              {members.map((emp, index) => {
                const status = statusConfig[emp.status as keyof typeof statusConfig];
                return (
                  <div key={emp.id}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer active:opacity-70 transition-opacity"
                      onClick={() => setSelectedContact(selectedContact?.id === emp.id ? null : emp)}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                          style={{ background: emp.color, fontSize: "14px", fontWeight: 600 }}
                        >
                          {emp.initial}
                        </div>
                        <div
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                          style={{
                            background: status.color,
                            borderColor: theme.card,
                          }}
                        />
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }}>{emp.name}</span>
                          {emp.isSelf && (
                            <div className="px-1.5 py-0.5 rounded" style={{ background: theme.primaryLight, color: theme.primary, fontSize: "9px" }}>我</div>
                          )}
                          <div
                            className="px-1.5 py-0.5 rounded-full"
                            style={{ background: status.bg, color: status.color, fontSize: "9px" }}
                          >
                            {status.label}
                          </div>
                        </div>
                        <div style={{ color: theme.sub, fontSize: "11px" }}>{emp.role}</div>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: theme.primaryLight }}
                        >
                          <Phone size={12} style={{ color: theme.primary }} />
                        </div>
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: theme.primaryLight }}
                        >
                          <MessageCircle size={12} style={{ color: theme.primary }} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {selectedContact?.id === emp.id && (
                      <div
                        className="mx-4 mb-3 rounded-2xl p-3"
                        style={{ background: theme.cardAlt }}
                      >
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {[
                            { label: "部门", value: emp.dept },
                            { label: "职位", value: emp.role },
                            { label: "手机", value: emp.phone },
                            { label: "状态", value: status.label },
                          ].map((info) => (
                            <div key={info.label}>
                              <div style={{ color: theme.hint, fontSize: "10px" }}>{info.label}</div>
                              <div style={{ color: theme.text, fontSize: "12px" }}>{info.value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl"
                            style={{ background: theme.primary, color: "#FFFFFF" }}
                          >
                            <Phone size={13} />
                            <span style={{ fontSize: "12px" }}>拨打电话</span>
                          </button>
                          <button
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl"
                            style={{ background: theme.primaryLight, color: theme.primary }}
                          >
                            <MessageCircle size={13} />
                            <span style={{ fontSize: "12px" }}>发送消息</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {index < members.length - 1 && (
                      <div className="mx-4 h-px" style={{ background: theme.divider }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-12" style={{ color: theme.hint }}>
            <Search size={36} className="mb-2 opacity-40" />
            <span style={{ fontSize: "13px" }}>未找到相关联系人</span>
          </div>
        )}
      </div>
    </div>
  );
}
