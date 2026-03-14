import { createContext, useContext } from "react";

export type Gender = "male" | "female";

export interface AppTheme {
  gender: Gender;
  isDark: boolean;
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryMid: string;
  gradFrom: string;
  gradTo: string;
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  sub: string;
  hint: string;
  divider: string;
  nav: string;
  inputBg: string;
  skeleton: string;
  shadow: string;
  tagBg: string;
}

export function buildTheme(gender: Gender, isDark: boolean): AppTheme {
  if (gender === "male" && !isDark) {
    return {
      gender, isDark,
      primary: "#2563EB",
      primaryHover: "#1D4ED8",
      primaryLight: "#EFF6FF",
      primaryMid: "#BFDBFE",
      gradFrom: "#1D4ED8",
      gradTo: "#3B82F6",
      bg: "#EEF2FF",
      card: "#FFFFFF",
      cardAlt: "#F5F8FF",
      text: "#1E293B",
      sub: "#4B6080",
      hint: "#94A3B8",
      divider: "rgba(37,99,235,0.1)",
      nav: "#FFFFFF",
      inputBg: "#F0F4FF",
      skeleton: "#E2E8F0",
      shadow: "rgba(37,99,235,0.08)",
      tagBg: "#EFF6FF",
    };
  }
  if (gender === "female" && !isDark) {
    return {
      gender, isDark,
      primary: "#D03878",
      primaryHover: "#B02060",
      primaryLight: "#FFF0F6",
      primaryMid: "#FBCFE8",
      gradFrom: "#B02060",
      gradTo: "#E0508A",
      bg: "#FFF0F6",
      card: "#FFFFFF",
      cardAlt: "#FFF8FB",
      text: "#2D0A1A",
      sub: "#7A3A55",
      hint: "#C4889E",
      divider: "rgba(208,56,120,0.1)",
      nav: "#FFFFFF",
      inputBg: "#FFF5F9",
      skeleton: "#FDDDE8",
      shadow: "rgba(208,56,120,0.08)",
      tagBg: "#FFF0F6",
    };
  }
  if (gender === "male" && isDark) {
    return {
      gender, isDark,
      primary: "#60A5FA",
      primaryHover: "#3B82F6",
      primaryLight: "rgba(96,165,250,0.15)",
      primaryMid: "rgba(96,165,250,0.25)",
      gradFrom: "#0D2348",
      gradTo: "#1D4ED8",
      bg: "#0F172A",
      card: "#1E293B",
      cardAlt: "#263347",
      text: "#F1F5F9",
      sub: "#94A3B8",
      hint: "#475569",
      divider: "rgba(255,255,255,0.08)",
      nav: "#1E293B",
      inputBg: "#0F172A",
      skeleton: "#334155",
      shadow: "rgba(0,0,0,0.4)",
      tagBg: "rgba(96,165,250,0.15)",
    };
  }
  // female dark
  return {
    gender, isDark,
    primary: "#F472B6",
    primaryHover: "#EC4899",
    primaryLight: "rgba(244,114,182,0.15)",
    primaryMid: "rgba(244,114,182,0.25)",
    gradFrom: "#4A0A26",
    gradTo: "#9D174D",
    bg: "#1A0910",
    card: "#2E1220",
    cardAlt: "#3A1828",
    text: "#FDF0F5",
    sub: "#D4849C",
    hint: "#7A4060",
    divider: "rgba(255,255,255,0.08)",
    nav: "#2E1220",
    inputBg: "#1A0910",
    skeleton: "#4A2030",
    shadow: "rgba(0,0,0,0.5)",
    tagBg: "rgba(244,114,182,0.15)",
  };
}

interface ThemeContextType {
  theme: AppTheme;
  toggleDark: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: buildTheme("male", false),
  toggleDark: () => {},
});

export const useTheme = () => useContext(ThemeContext);
