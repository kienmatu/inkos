import { ExternalLink } from "lucide-react";
import { tr } from "../lib/app-language";

interface ServiceQuickLink {
  readonly label: string;
  readonly href: string;
}

// 标签在调用时通过 tr() 解析语言，所以这里存 zh/en/vi 对而不是最终字符串。
const SERVICE_QUICK_LINKS: Record<string, ReadonlyArray<{ zh: string; en: string; vi: string; href: string }>> = {
  kimicode: [
    { zh: "官网", en: "Website", vi: "Trang chủ", href: "https://www.kimi.com?aff=inkos" },
  ],
  kimiCodingPlan: [
    { zh: "官网", en: "Website", vi: "Trang chủ", href: "https://www.kimi.com?aff=inkos" },
  ],
  kkaiapi: [
    { zh: "官网", en: "Website", vi: "Trang chủ", href: "https://kkaiapi.com/" },
    { zh: "API 文档", en: "API docs", vi: "Tài liệu API", href: "https://kkaiapi.com/docs" },
    { zh: "模型/价格", en: "Models & pricing", vi: "Model & giá", href: "https://kkaiapi.com/models" },
  ],
  moonshot: [
    { zh: "开放平台", en: "Developer platform", vi: "Nền tảng nhà phát triển", href: "https://platform.kimi.com?aff=inkos" },
  ],
  openrouter: [
    { zh: "API Keys", en: "API Keys", vi: "API Keys", href: "https://openrouter.ai/keys" },
    { zh: "模型", en: "Models", vi: "Model", href: "https://openrouter.ai/models" },
    { zh: "文档", en: "Docs", vi: "Tài liệu", href: "https://openrouter.ai/docs/api-reference/overview" },
  ],
};

export function getServiceQuickLinks(serviceId: string): ReadonlyArray<ServiceQuickLink> {
  return (SERVICE_QUICK_LINKS[serviceId] ?? []).map((link) => ({
    label: tr(link.zh, link.en, link.vi),
    href: link.href,
  }));
}

export function ServiceQuickLinks({
  serviceId,
  variant = "detail",
  className = "",
}: {
  readonly serviceId: string;
  readonly variant?: "card" | "detail";
  readonly className?: string;
}) {
  const links = getServiceQuickLinks(serviceId);
  if (links.length === 0) return null;

  const compact = variant === "card";
  return (
    <div
      className={[
        "flex flex-wrap items-center gap-1.5 text-muted-foreground/70",
        compact ? "text-[11px]" : "text-xs",
        className,
      ].filter(Boolean).join(" ")}
    >
      {!compact && <span className="mr-0.5">{tr("配置入口", "Quick links", "Liên kết nhanh")}</span>}
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={[
            "inline-flex items-center gap-1 rounded-md border border-border/40 bg-card/50 font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground",
            compact ? "px-1.5 py-0.5" : "px-2 py-1",
          ].join(" ")}
        >
          {link.label}
          <ExternalLink size={compact ? 10 : 11} />
        </a>
      ))}
    </div>
  );
}
