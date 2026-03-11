import { Plus, ChevronRight, MoreHorizontal, Flag, Circle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTheme } from "../context/ThemeContext";

export function WorkPage() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"task" | "schedule" | "report">("task");

  const tasks = [
    { id: 1, title: "完成Q1季度产品需求文档", project: "产品规划", priority: "高", priorityColor: "#F44336", priorityBg: "#FFEBEE", due: "今天", progress: 75, assignees: ["陈", "李"], done: false },
    { id: 2, title: "UI设计稿评审会准备", project: "设计协作", priority: "中", priorityColor: "#FF9800", priorityBg: "#FFF3E0", due: "明天", progress: 30, assignees: ["张"], done: false },
    { id: 3, title: "后端接口文档整理", project: "技术开发", priority: "低", priorityColor: "#4CAF50", priorityBg: "#E8F5E9", due: "03-15", progress: 10, assignees: ["王", "赵", "刘"], done: false },
    { id: 4, title: "竞品分析报告", project: "市场调研", priority: "中", priorityColor: "#FF9800", priorityBg: "#FFF3E0", due: "已完成", progress: 100, assignees: ["陈"], done: true },
    { id: 5, title: "客户演示PPT制作", project: "销售支持", priority: "高", priorityColor: "#F44336", priorityBg: "#FFEBEE", due: "03-12", progress: 60, assignees: ["李", "张"], done: false },
  ];

  const schedule = [
    {
      date: "今天", events: [
        { time: "09:00-10:30", title: "产品周会", location: "3楼会议室", type: "会议", color: "#7C3AED", bg: "#F3E8FF" },
        { time: "14:00-15:30", title: "Q1季度汇报", location: "大会议室", type: "汇报", color: "#0891B2", bg: "#E0F2FE" },
        { time: "16:30-17:00", title: "1v1 绩效谈话", location: "CEO办公室", type: "面谈", color: "#059669", bg: "#D1FAE5" },
      ],
    },
    {
      date: "明天", events: [
        { time: "10:00-11:00", title: "UI评审会", location: "4楼工作室", type: "评审", color: "#D97706", bg: "#FEF3C7" },
        { time: "15:00-16:00", title: "技术架构讨论", location: "线上会议", type: "会议", color: "#7C3AED", bg: "#F3E8FF" },
      ],
    },
  ];

  const projects = [
    { name: "智汇APP 3.0", progress: 68, members: 8, color: theme.primary, deadline: "04-30" },
    { name: "官网改版", progress: 42, members: 4, color: "#FF9800", deadline: "03-25" },
    { name: "数据中台建设", progress: 25, members: 12, color: "#9C27B0", deadline: "06-01" },
  ];

  const avatarColors = [theme.primary, "#FF9800", "#9C27B0", "#4CAF50"];
  const avatarLabels = ["陈", "张", "王", "李"];

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg }}>
      {/* Header */}
      <div
        className="px-4 pt-3 pb-4"
        style={{ background: `linear-gradient(135deg, ${theme.gradFrom}, ${theme.gradTo})` }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-white" style={{ fontSize: "16px", fontWeight: 600 }}>工作台</span>
          <button className="flex items-center gap-1 bg-white/20 text-white px-3 py-1.5 rounded-full">
            <Plus size={14} />
            <span style={{ fontSize: "12px" }}>新建</span>
          </button>
        </div>
        <div className="flex gap-0 bg-white/15 rounded-xl p-0.5">
          {[
            { key: "task", label: "我的任务" },
            { key: "schedule", label: "日程" },
            { key: "report", label: "项目" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className="flex-1 py-1.5 rounded-xl transition-all"
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
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "task" && (
          <div className="px-4 pt-3 pb-4 space-y-2">
            <div className="flex gap-2 mb-1 overflow-x-auto pb-1">
              {["全部", "今日到期", "高优先级", "已完成"].map((filter, i) => (
                <div
                  key={filter}
                  className="px-3 py-1 rounded-full whitespace-nowrap shrink-0"
                  style={{
                    background: i === 0 ? theme.primary : theme.card,
                    color: i === 0 ? "#FFFFFF" : theme.sub,
                    fontSize: "11px",
                    boxShadow: `0 1px 4px ${theme.shadow}`,
                  }}
                >
                  {filter}
                </div>
              ))}
            </div>

            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-2xl shadow-sm p-4"
                style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {task.done
                      ? <CheckCircle2 size={18} style={{ color: theme.primary }} />
                      : <Circle size={18} style={{ color: theme.divider }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span style={{ color: task.done ? theme.hint : theme.text, fontSize: "13px", fontWeight: 500, textDecoration: task.done ? "line-through" : "none" }}>
                        {task.title}
                      </span>
                      <MoreHorizontal size={16} style={{ color: theme.hint }} className="shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="px-2 py-0.5 rounded-full" style={{ background: theme.primaryLight, color: theme.primary, fontSize: "10px" }}>{task.project}</div>
                      <div className="px-2 py-0.5 rounded-full" style={{ background: task.priorityBg, color: task.priorityColor, fontSize: "10px" }}>
                        <div className="flex items-center gap-0.5">
                          <Flag size={8} />
                          <span>{task.priority}优先</span>
                        </div>
                      </div>
                    </div>
                    {!task.done && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ color: theme.hint, fontSize: "10px" }}>进度</span>
                          <span style={{ color: theme.sub, fontSize: "10px" }}>{task.progress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: theme.primaryLight }}>
                          <div className="h-full rounded-full" style={{ width: `${task.progress}%`, background: theme.primary }} />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-1">
                        {task.assignees.map((a, i) => (
                          <div key={i} className="w-5 h-5 rounded-full flex items-center justify-center text-white border-2" style={{ background: theme.primary, borderColor: theme.card, fontSize: "9px" }}>
                            {a}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: "10px", color: task.due === "今天" ? "#F44336" : task.due === "已完成" ? theme.primary : theme.hint }}>
                        {task.due === "已完成" ? "✓ 已完成" : `⏰ ${task.due}`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="px-4 pt-3 pb-4 space-y-3">
            <div className="rounded-2xl shadow-sm p-3" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }}>2026年3月</span>
                <ChevronRight size={14} style={{ color: theme.hint }} />
              </div>
              <div className="grid grid-cols-7 gap-1">
                {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                  <div key={d} className="text-center" style={{ color: theme.hint, fontSize: "10px" }}>{d}</div>
                ))}
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <div
                    key={day}
                    className="h-7 flex items-center justify-center rounded-lg cursor-pointer"
                    style={{
                      background: day === 10 ? theme.primary : "transparent",
                      color: day === 10 ? "#FFFFFF" : [14, 21, 28].includes(day) ? "#EF4444" : theme.text,
                      fontSize: "11px",
                    }}
                  >
                    {day}
                  </div>
                ))}
              </div>
            </div>
            {schedule.map((group) => (
              <div key={group.date}>
                <div style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }} className="mb-2">{group.date}</div>
                <div className="space-y-2">
                  {group.events.map((event) => (
                    <div key={event.title} className="rounded-2xl shadow-sm p-4 flex items-start gap-3" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
                      <div className="w-1 h-14 rounded-full shrink-0 mt-1" style={{ background: event.color }} />
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }} className="mb-1">{event.title}</div>
                            <div style={{ color: theme.hint, fontSize: "11px" }} className="mb-1.5">{event.time}</div>
                            <div className="flex items-center gap-1" style={{ color: theme.hint, fontSize: "11px" }}>
                              <span>📍</span>
                              <span>{event.location}</span>
                            </div>
                          </div>
                          <div className="px-2 py-0.5 rounded-full" style={{ background: event.bg, color: event.color, fontSize: "10px" }}>{event.type}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "report" && (
          <div className="px-4 pt-3 pb-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }}>参与项目 (3)</span>
              <div className="flex items-center gap-1" style={{ color: theme.primary, fontSize: "12px" }}>
                <span>查看全部</span>
                <ChevronRight size={12} />
              </div>
            </div>
            {projects.map((proj) => (
              <div key={proj.name} className="rounded-2xl shadow-sm p-4" style={{ background: theme.card, boxShadow: `0 2px 12px ${theme.shadow}` }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div style={{ color: theme.text, fontSize: "13px", fontWeight: 500 }} className="mb-1">{proj.name}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1">
                        {Array.from({ length: Math.min(proj.members, 4) }).map((_, i) => (
                          <div key={i} className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-white" style={{ background: avatarColors[i], borderColor: theme.card, fontSize: "9px" }}>
                            {avatarLabels[i]}
                          </div>
                        ))}
                        {proj.members > 4 && (
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ background: theme.cardAlt, borderColor: theme.card, color: theme.hint, fontSize: "8px" }}>
                            +{proj.members - 4}
                          </div>
                        )}
                      </div>
                      <span style={{ color: theme.hint, fontSize: "10px" }}>{proj.members}人参与</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div style={{ color: theme.hint, fontSize: "10px" }}>截止</div>
                    <div style={{ color: theme.text, fontSize: "11px" }}>{proj.deadline}</div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ color: theme.hint, fontSize: "10px" }}>项目进度</span>
                    <span style={{ color: proj.color, fontSize: "11px", fontWeight: 500 }}>{proj.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: theme.primaryLight }}>
                    <div className="h-full rounded-full" style={{ width: `${proj.progress}%`, background: proj.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
