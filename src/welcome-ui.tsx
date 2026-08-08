import React from "react";
import { useExtensionContext, type ExtensionProps } from "@avg-studio/sdk";

/**
 * 这个组件的 props 必须 extends ExtensionProps,因为父类 Extension<P> 的
 * 泛型约束要求 P 至少包含 ExtensionProps 上的字段(目前是可选的 id)。
 */
export interface WelcomeUIProps extends ExtensionProps {
  /** 标题里的扩展名,默认从 op-show-ui 的 props 注入或用 manifest 名兜底。 */
  title?: string;
}

// ─── 设计 tokens (写死,作者要改主题就改这里) ───────────────────────────────
const tokens = {
  // 中性骨架
  bgStage:    "#E8EAED", // 卡片外的舞台底色
  bgCard:     "#FAFAF7", // 卡片背景 — 暖白(略偏黄)
  bgCardSub:  "#F4F4EF", // 卡片内 section 区分背景
  borderCard: "#E2E2DC",
  borderHair: "#ECEBE5",
  fgPrimary:  "#1A1A1A",
  fgSecondary:"#57564F",
  fgMuted:    "#8B8A83",
  fgAccent:   "#2A2A2A",

  // 6 个点缀色 —— 饱和度统一(70-75%),亮度统一(60-65%)
  // 角色头像和 next-step 编号按顺序循环使用
  palette: [
    "#E5675A", // coral
    "#D89A3B", // amber
    "#7E9650", // olive
    "#4A9C8C", // teal
    "#5A7DAF", // blue
    "#9560A1", // plum
  ] as const,

  // 字体 —— 全部系统栈,零外部依赖
  fontDisplay: '"Georgia", "Songti SC", "Times New Roman", serif',
  fontBody:
    '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  fontMono: '"SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace',
};

/** 取角色名首字符 — 中文取第一字,英文取首字母大写。 */
function firstGlyph(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  // [...str] 走 code point,正确处理 emoji / 复合字符
  return [...trimmed][0]!.toUpperCase();
}

export const WelcomeUI: React.FC<WelcomeUIProps> = ({ title }) => {
  const ctx = useExtensionContext();

  // ctx.character.useAll() 是 React hook,角色列表变化时会自动重渲染。
  // 玩家壳里角色列表是 build 产物不变,Studio 里实时跟随角色模块。
  const characters = ctx.character.useAll();

  const safeTitle = title ?? "我的扩展";

  return (
    <div
      style={{
        // 把组件撑满 1920x1080 舞台,UI 自身居中
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: tokens.bgStage,
        fontFamily: tokens.fontBody,
        color: tokens.fgPrimary,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <article
        style={{
          width: 1200,
          minHeight: 800,
          background: tokens.bgCard,
          border: `1px solid ${tokens.borderCard}`,
          borderRadius: 18,
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.9) inset, 0 32px 64px -20px rgba(20,20,20,0.20), 0 10px 20px -6px rgba(20,20,20,0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* 卡片顶部 6 段纯色 hairline — 唯一的装饰元素 */}
        <RainbowStripe />

        {/* ─── Header ─── */}
        <header
          style={{
            padding: "52px 56px 32px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 32,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow>扩展运行中 · Extension</Eyebrow>
            <h1
              style={{
                fontFamily: tokens.fontDisplay,
                fontWeight: 400,
                fontSize: 56,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                margin: 0,
                color: tokens.fgPrimary,
              }}
            >
              你好,
              <em
                style={{
                  fontStyle: "italic",
                  fontWeight: 300,
                  color: tokens.palette[0],
                }}
              >
                「{safeTitle}」
              </em>
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.55,
                color: tokens.fgSecondary,
                margin: "16px 0 0",
                maxWidth: 720,
              }}
            >
              这是从模板生成的扩展,正在你这个项目的舞台上运行。下面是它从宿主读到的角色数据 ——
              改动 <InlineCode>src/welcome-ui.tsx</InlineCode> 试试。
            </p>
          </div>
          <MetaCard />
        </header>

        {/* ─── 角色列表 ─── */}
        <section style={{ padding: "12px 56px 32px" }}>
          <SectionLabel
            label="项目中的角色"
            badge={characters.length > 0 ? String(characters.length) : undefined}
          />
          {characters.length > 0 ? (
            <CharactersList characters={characters} />
          ) : (
            <CharactersEmpty />
          )}
        </section>

        {/* ─── 下一步引导 ─── */}
        <footer style={{ padding: "12px 56px 44px", marginTop: "auto" }}>
          <SectionLabel label="下一步" />
          <NextSteps />
        </footer>
      </article>
    </div>
  );
};

// ─── 子组件 ─────────────────────────────────────────────────────────────────

function RainbowStripe() {
  // 6 段等宽纯色,不是渐变。卡片放大后 stripe 从 3px 加粗到 4px,视觉权重保持。
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        display: "flex",
      }}
    >
      {tokens.palette.map((c) => (
        <div key={c} style={{ flex: 1, background: c }} />
      ))}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: tokens.fontMono,
        fontSize: 13,
        fontWeight: 500,
        color: tokens.fgMuted,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: 18,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tokens.palette[2],
          boxShadow: `0 0 0 4px ${tokens.palette[2]}2E`,
        }}
      />
      {children}
    </div>
  );
}

function MetaCard() {
  // manifest 信息,扩展运行时拿不到完整 manifest,这里只放展示性占位。
  // 作者真要做"读 manifest 的 UI"可以走 ctx.system.slots 或 extension.json 自己 fetch。
  const rows: Array<[string, string]> = [
    ["id", "ext-27b96b"],
    ["version", "0.1.0"],
    ["sdk", "^1.9.2-beta"],
  ];
  return (
    <aside
      style={{
        flexShrink: 0,
        background: tokens.bgCardSub,
        border: `1px solid ${tokens.borderHair}`,
        borderRadius: 10,
        padding: "14px 18px",
        fontFamily: tokens.fontMono,
        fontSize: 13,
        lineHeight: 1.7,
        color: tokens.fgSecondary,
        minWidth: 200,
      }}
    >
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: tokens.fgMuted }}>{k}</span>
          <span style={{ color: tokens.fgAccent, fontWeight: 500 }}>{v}</span>
        </div>
      ))}
    </aside>
  );
}

function SectionLabel({ label, badge }: { label: string; badge?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: tokens.fontMono,
        fontSize: 13,
        fontWeight: 500,
        color: tokens.fgMuted,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: 18,
      }}
    >
      <span>{label}</span>
      <span style={{ flex: 1, height: 1, background: tokens.borderHair }} />
      {badge !== undefined && (
        <span
          style={{
            background: tokens.bgCardSub,
            border: `1px solid ${tokens.borderHair}`,
            borderRadius: 999,
            padding: "3px 10px",
            fontSize: 12,
            color: tokens.fgAccent,
            fontWeight: 500,
            letterSpacing: 0,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

interface CharacterLike {
  id: string;
  name: string;
  avatarUri?: string;
}

function CharactersList({ characters }: { characters: CharacterLike[] }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        overflowX: "auto",
        paddingBottom: 6,
      }}
    >
      {characters.map((c, i) => (
        <CharacterCard key={c.id} character={c} colorIndex={i} />
      ))}
    </div>
  );
}

function CharacterCard({ character, colorIndex }: { character: CharacterLike; colorIndex: number }) {
  const color = tokens.palette[colorIndex % tokens.palette.length];
  const hasAvatar = !!character.avatarUri;
  return (
    <div
      style={{
        flexShrink: 0,
        width: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: tokens.fontDisplay,
          fontWeight: 500,
          fontSize: 32,
          color: "#FFFFFF",
          background: color,
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.3) inset, 0 3px 6px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      >
        {hasAvatar ? (
          <img
            src={character.avatarUri}
            alt={character.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              // 头像 URI 失效时降级到首字符渲染 — 不让破图打断 onboarding 体验
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          firstGlyph(character.name)
        )}
      </div>
      <div
        style={{
          fontSize: 15,
          color: tokens.fgSecondary,
          maxWidth: "100%",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          textAlign: "center",
          fontWeight: 500,
        }}
        title={character.name}
      >
        {character.name}
      </div>
    </div>
  );
}

function CharactersEmpty() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "24px 28px",
        background: tokens.bgCardSub,
        border: `1px dashed ${tokens.borderCard}`,
        borderRadius: 14,
        color: tokens.fgSecondary,
        fontSize: 16,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: tokens.bgCard,
          border: `1px solid ${tokens.borderCard}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tokens.fgMuted,
          flexShrink: 0,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 21c0-3.866 3.134-7 7-7s7 3.134 7 7" />
        </svg>
      </div>
      <div>
        <div style={{ fontWeight: 500, color: tokens.fgPrimary, marginBottom: 4, fontSize: 17 }}>
          还没有角色
        </div>
        <div>
          在 Studio 的"角色"模块创建一个角色,它就会出现在这里 —— 这正是扩展读取宿主数据的方式。
        </div>
      </div>
    </div>
  );
}

function NextSteps() {
  const items: Array<{ title: React.ReactNode; hint: string }> = [
    {
      title: (
        <>
          修改 <InlineCode>src/welcome-ui.tsx</InlineCode>,保存后这个画面会自动热更新
        </>
      ),
      hint: "需要先跑 npm run watch · 修改保存后约 200ms 内生效",
    },
    {
      title: (
        <>
          用 <InlineCode>ctx.dialogue</InlineCode> 接入对话系统,或 <InlineCode>ctx.variables</InlineCode> 读写剧本变量
        </>
      ),
      hint: "完整 SDK 文档见 Studio 帮助菜单 · SDK 手册",
    },
    {
      title: (
        <>
          改 <InlineCode>@extension</InlineCode> 里的 id / label 为你的扩展名,完成你的第一个扩展
        </>
      ),
      hint: "id 是剧本里引用的稳定标识 · 别忘了更新 README.md",
    },
  ];
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => (
        <NextStepItem key={i} index={i + 1} colorIndex={i + 3} title={it.title} hint={it.hint} />
      ))}
    </ol>
  );
}

function NextStepItem({
  index,
  colorIndex,
  title,
  hint,
}: {
  index: number;
  colorIndex: number;
  title: React.ReactNode;
  hint: string;
}) {
  const color = tokens.palette[colorIndex % tokens.palette.length];
  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 18,
        padding: "14px 18px",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: tokens.fontMono,
          fontSize: 14,
          fontWeight: 500,
          color: "#FFFFFF",
          background: color,
        }}
      >
        {index}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, color: tokens.fgPrimary, lineHeight: 1.5, fontWeight: 500 }}>
          {title}
        </div>
        <div style={{ fontSize: 13.5, color: tokens.fgMuted, marginTop: 4 }}>{hint}</div>
      </div>
    </li>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: tokens.fontMono,
        fontSize: 14.5,
        background: tokens.bgCardSub,
        padding: "2px 8px",
        borderRadius: 5,
        color: tokens.fgAccent,
        fontWeight: 500,
      }}
    >
      {children}
    </code>
  );
}
