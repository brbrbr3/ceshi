import { useState } from "react";
import { Eye, EyeOff, ChevronRight, Phone, Lock } from "lucide-react";
import { Gender } from "../context/ThemeContext";

interface LoginPageProps {
  onLogin: (gender: Gender) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [gender, setGender] = useState<Gender>("male");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  const isMale = gender === "male";
  const primary = isMale ? "#2563EB" : "#D03878";
  const gradFrom = isMale ? "#1D4ED8" : "#B02060";
  const gradTo = isMale ? "#3B82F6" : "#E0508A";
  const lightBg = isMale ? "#EFF6FF" : "#FFF0F6";
  const midColor = isMale ? "#BFDBFE" : "#FBCFE8";

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin(gender);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: lightBg }}>
      {/* Top Gradient */}
      <div
        className="px-5 pt-8 pb-10 flex flex-col items-start"
        style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
      >
        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4 shadow-lg">
          <span className="text-white" style={{ fontSize: "26px", fontWeight: 800 }}>智</span>
        </div>
        <h1 className="text-white mb-1" style={{ fontSize: "22px", fontWeight: 700 }}>智汇办公</h1>
        <p className="text-white/70" style={{ fontSize: "13px" }}>企业一站式智能办公平台</p>
      </div>

      {/* White Card Form */}
      <div
        className="flex-1 overflow-y-auto rounded-t-3xl -mt-5 px-5 pt-6"
        style={{ background: "#FFFFFF" }}
      >
        {/* Gender Selection */}
        <div className="mb-5">
          <div className="text-[#555] mb-2" style={{ fontSize: "12px" }}>选择账号类型</div>
          <div className="flex gap-2 p-1 rounded-2xl" style={{ background: lightBg }}>
            <button
              onClick={() => setGender("male")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all"
              style={{
                background: gender === "male" ? "#2563EB" : "transparent",
                color: gender === "male" ? "#FFFFFF" : "#94A3B8",
              }}
            >
              <span style={{ fontSize: "16px" }}>👨‍💼</span>
              <span style={{ fontSize: "13px" }}>男性用户</span>
            </button>
            <button
              onClick={() => setGender("female")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all"
              style={{
                background: gender === "female" ? "#D03878" : "transparent",
                color: gender === "female" ? "#FFFFFF" : "#94A3B8",
              }}
            >
              <span style={{ fontSize: "16px" }}>👩‍💼</span>
              <span style={{ fontSize: "13px" }}>女性用户</span>
            </button>
          </div>
          <div className="mt-1.5 text-center" style={{ color: primary, fontSize: "11px" }}>
            {isMale ? "🔵 蓝色主题已选择" : "🌸 粉色主题已选择"}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 mb-5">
          <div className="flex-1 h-px" style={{ background: midColor }} />
          <span style={{ fontSize: "12px", color: "#999" }}>账号登录</span>
          <div className="flex-1 h-px" style={{ background: midColor }} />
        </div>

        {/* Phone Input */}
        <div className="mb-3">
          <div className="text-[#555] mb-1.5" style={{ fontSize: "12px" }}>手机号 / 邮箱</div>
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: lightBg, border: `1.5px solid ${phone ? primary : "transparent"}` }}
          >
            <Phone size={16} style={{ color: phone ? primary : "#94A3B8" }} />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号或邮箱"
              className="flex-1 outline-none bg-transparent"
              style={{ fontSize: "13px", color: "#1E293B" }}
            />
          </div>
        </div>

        {/* Password Input */}
        <div className="mb-4">
          <div className="text-[#555] mb-1.5" style={{ fontSize: "12px" }}>登录密码</div>
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: lightBg, border: `1.5px solid ${password ? primary : "transparent"}` }}
          >
            <Lock size={16} style={{ color: password ? primary : "#94A3B8" }} />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入登录密码"
              className="flex-1 outline-none bg-transparent"
              style={{ fontSize: "13px", color: "#1E293B" }}
            />
            <button onClick={() => setShowPassword(!showPassword)}>
              {showPassword
                ? <EyeOff size={15} className="text-[#94A3B8]" />
                : <Eye size={15} className="text-[#94A3B8]" />}
            </button>
          </div>
        </div>

        {/* Remember & Forgot */}
        <div className="flex items-center justify-between mb-5">
          <button
            className="flex items-center gap-1.5"
            onClick={() => setRemember(!remember)}
          >
            <div
              className="w-4 h-4 rounded flex items-center justify-center border transition-all"
              style={{
                background: remember ? primary : "transparent",
                borderColor: remember ? primary : "#CBD5E1",
              }}
            >
              {remember && <span className="text-white" style={{ fontSize: "10px" }}>✓</span>}
            </div>
            <span className="text-[#94A3B8]" style={{ fontSize: "12px" }}>记住登录状态</span>
          </button>
          <span style={{ color: primary, fontSize: "12px" }}>忘记密码？</span>
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 mb-4 transition-opacity"
          style={{
            background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})`,
            opacity: loading ? 0.8 : 1,
            boxShadow: `0 8px 20px ${primary}40`,
          }}
        >
          {loading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <span className="text-white" style={{ fontSize: "14px", fontWeight: 600 }}>登 录</span>
              <ChevronRight size={16} className="text-white" />
            </>
          )}
        </button>

        {/* Quick Login Tip */}
        <div
          className="rounded-2xl p-3 mb-4 flex items-start gap-2"
          style={{ background: lightBg }}
        >
          <span style={{ fontSize: "14px" }}>💡</span>
          <div>
            <div style={{ color: primary, fontSize: "12px", fontWeight: 500 }}>演示提示</div>
            <div className="text-[#94A3B8]" style={{ fontSize: "11px" }}>任意输入账号密码即可体验，无需真实账号</div>
          </div>
        </div>

        {/* Register Link */}
        <div className="text-center pb-4">
          <span className="text-[#94A3B8]" style={{ fontSize: "12px" }}>还没有账号？</span>
          <span style={{ color: primary, fontSize: "12px" }}> 联系管理员注册</span>
        </div>
      </div>
    </div>
  );
}
