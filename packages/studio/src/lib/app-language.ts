// 全局应用语言：非 React 模块（store slice、parts-builder、error-copy 等）无法用
// useI18n hook，从这里读取。App.tsx 在项目配置加载/切换语言时调用 setAppLanguage 同步。
export type AppLanguage = "zh" | "en" | "vi";

let current: AppLanguage = "vi";

export function setAppLanguage(lang: AppLanguage): void {
  current = lang;
}

export function getAppLanguage(): AppLanguage {
  return current;
}

/**
 * 内联三语：tr("中文", "English", "Tiếng Việt")。
 * 越南语参数可选：未提供时回退到英文，绝不回退到中文，
 * 这样未翻译的界面在越南语模式下显示英文而不是中文。
 */
export function tr(zh: string, en: string, vi?: string): string {
  if (current === "vi") return vi ?? en;
  return current === "en" ? en : zh;
}
