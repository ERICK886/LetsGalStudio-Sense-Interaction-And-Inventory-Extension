/**
 * scene-inline-cards.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * Studio 编辑器内联卡片（非 SDK 正式接口；hack 自 ext-7a9373 phone-inline-cards）。
 *
 * 通过受限 DOM / Fiber 探测，把本包方法块显示为摘要卡片；不写入编辑器数据，
 * Inspector 仍是参数编辑的唯一入口。宿主 DOM 变更或探测失败时静默保留原生块。
 */

import {
  BACKPACK_HUD_MODULE_ID,
  BACKPACK_MODULE_ID,
  EDITOR_MODULE_ID,
  EXTENSION_PACKAGE_ID,
  SCENE_INTERACTION_MODULE_ID,
} from "../shared/module-ids";

const CARD_ATTRIBUTE = "data-si-inline-card";
const HOST_ATTRIBUTE = "data-si-inline-card-host";
const ORIGINAL_DISPLAY_ATTRIBUTE = "data-si-inline-original-display";
const STYLE_ATTRIBUTE = "data-si-inline-card-style";
const BLOCK_SELECTOR =
  '.bn-block-content[data-content-type="callExtensionFunction"]';
const RUNTIME_KEY = "__ext27b96bSceneInlineCards";

/** 本包所有会在剧本中出现的 method id */
type SceneMethodId =
  | "open-scene"
  | "open-scene-interaction"
  | "close-scene-interaction"
  | "set-edit-mode"
  | "get-current-scene-id"
  | "set-hotspot-visible"
  | "give-item"
  | "has-item"
  | "get-item-count"
  | "craft-recipe"
  | "open-backpack-hud"
  | "close-backpack-hud"
  | "open-backpack"
  | "close-backpack";

interface ExtensionBlock {
  id?: unknown;
  type?: unknown;
  props?: { target?: unknown; paramsJson?: unknown };
}

interface ReactFiber {
  memoizedProps?: { block?: ExtensionBlock };
  pendingProps?: { block?: ExtensionBlock };
  alternate?: ReactFiber | null;
  return?: ReactFiber | null;
}

interface InlineCardRuntime {
  observer?: MutationObserver;
  themeObserver?: MutationObserver;
  inspectorRefresh?: (event: Event) => void;
  frame?: number;
  dispose(): void;
}

const METHOD_META: Record<
  SceneMethodId,
  { label: string; icon: string }
> = {
  "open-scene": { label: "打开场景", icon: "▣" },
  "open-scene-interaction": { label: "打开场景交互（阻塞）", icon: "◉" },
  "close-scene-interaction": { label: "关闭场景交互", icon: "×" },
  "set-edit-mode": { label: "设置编辑模式", icon: "✎" },
  "get-current-scene-id": { label: "获取当前场景 ID", icon: "?" },
  "set-hotspot-visible": { label: "设置交互点可见性", icon: "◎" },
  "give-item": { label: "给予物品", icon: "+" },
  "has-item": { label: "是否持有物品", icon: "✓" },
  "get-item-count": { label: "获取物品数量", icon: "#" },
  "craft-recipe": { label: "合成配方", icon: "✦" },
  "open-backpack-hud": { label: "打开背包HUD", icon: "≡" },
  "close-backpack-hud": { label: "关闭背包HUD", icon: "≡" },
  "open-backpack": { label: "打开全屏背包", icon: "▣" },
  "close-backpack": { label: "关闭全屏背包", icon: "▣" },
};

/** target 路径中出现任一标记即视为本包方法 */
const PACKAGE_MARKERS = [
  EXTENSION_PACKAGE_ID,
  SCENE_INTERACTION_MODULE_ID,
  BACKPACK_HUD_MODULE_ID,
  BACKPACK_MODULE_ID,
  EDITOR_MODULE_ID,
] as const;

/**
 * @param value - 未知值
 * @returns 是否为普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param value - 原始 method id
 * @returns 合法 SceneMethodId 或 undefined
 */
function asSceneMethodId(value: string): SceneMethodId | undefined {
  return Object.prototype.hasOwnProperty.call(METHOD_META, value)
    ? (value as SceneMethodId)
    : undefined;
}

/**
 * 判断 target 是否属于本扩展包。
 *
 * @param target - 块 props.target
 * @returns 是否命中包 / 模块标记
 */
function targetBelongsToPackage(target: string): boolean {
  return PACKAGE_MARKERS.some((marker) => target.includes(marker));
}

/**
 * 从块 props 解析本包 method id。
 *
 * @param block - Fiber 上的块
 * @returns method id 或 undefined
 */
function sceneMethodId(
  block: ExtensionBlock | undefined,
): SceneMethodId | undefined {
  if (block?.type !== "callExtensionFunction") {
    return undefined;
  }

  const target = block.props?.target;

  if (typeof target !== "string" || !targetBelongsToPackage(target)) {
    return undefined;
  }

  // 兼容 `package/method` 与 `package/module/method`
  const segments = target.split("/");

  return asSceneMethodId(segments[segments.length - 1] ?? "");
}

/**
 * Fiber 失败时用块文本兜底（仅当前块，不上溯编辑器根）。
 *
 * @param content - 块内容根
 * @param block - 可选 Fiber 块
 * @returns method id 或 undefined
 */
function sceneMethodIdFromContent(
  content: HTMLElement,
  block: ExtensionBlock | undefined,
): SceneMethodId | undefined {
  const fromBlock = sceneMethodId(block);

  if (fromBlock) {
    return fromBlock;
  }

  // Fiber 私有字段可能随 Studio 版本变动；兜底只检查当前 BlockNote 块文本。
  // 绝不能向上读到编辑器根，否则相邻块标题会导致误判。
  const blockRoot = content.closest<HTMLElement>("[data-id]") ?? content;
  const text = blockRoot.textContent ?? "";

  return (
    (
      Object.entries(METHOD_META) as Array<
        [SceneMethodId, { label: string; icon: string }]
      >
    ).find(([, meta]) => text.includes(meta.label))?.[0] ?? undefined
  );
}

/**
 * 解包 Studio paramsJson（lit / literal / value 封装）。
 *
 * @param paramsJson - 原始 JSON 字符串
 * @returns 扁平参数表
 */
function literalParams(paramsJson: unknown): Record<string, unknown> {
  if (typeof paramsJson !== "string") {
    return {};
  }

  try {
    const raw: unknown = JSON.parse(paramsJson);

    if (!isRecord(raw)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(raw).map(([key, value]) => {
        if (!isRecord(value) || !("value" in value)) {
          return [key, value];
        }

        return [key, value.value];
      }),
    );
  } catch {
    return {};
  }
}

/**
 * @param value - 任意值
 * @param limit - 最大长度
 * @returns 截断后的字符串
 */
function truncate(value: unknown, limit = 72): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > limit
    ? `${normalized.slice(0, limit - 1)}…`
    : normalized;
}

/**
 * @param value - 任意值
 * @param fallback - 缺省
 * @returns 有限数字或 fallback
 */
function asFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);

    if (Number.isFinite(n)) {
      return n;
    }
  }

  return fallback;
}

/**
 * 沿 DOM 向上 / 向下找带 block 的 React Fiber。
 *
 * @param content - 块内容根
 * @returns ExtensionBlock 或 undefined
 */
function findBlock(content: HTMLElement): ExtensionBlock | undefined {
  const blockRoot = content.closest<HTMLElement>("[data-id]");
  const expectedBlockId = blockRoot?.dataset.id;
  const candidates: Element[] = [];

  for (
    let node: HTMLElement | null = content;
    node;
    node = node.parentElement
  ) {
    candidates.push(node);

    if (node === blockRoot) {
      break;
    }
  }

  candidates.push(...content.querySelectorAll("*"));

  let packageBlockFallback: ExtensionBlock | undefined;

  for (const candidate of candidates) {
    const fiberKey = Object.keys(candidate).find((key) =>
      key.startsWith("__reactFiber$"),
    );
    let fiber = fiberKey
      ? (candidate as unknown as Record<string, ReactFiber | undefined>)[
          fiberKey
        ]
      : undefined;

    while (fiber) {
      const blocks = [
        fiber.pendingProps?.block,
        fiber.memoizedProps?.block,
        fiber.alternate?.pendingProps?.block,
        fiber.alternate?.memoizedProps?.block,
      ];

      for (const block of blocks) {
        if (!block?.id) {
          continue;
        }

        if (expectedBlockId && String(block.id) === expectedBlockId) {
          return block;
        }

        if (!packageBlockFallback && sceneMethodId(block)) {
          packageBlockFallback = block;
        }
      }

      fiber = fiber.return ?? undefined;
    }
  }

  return packageBlockFallback;
}

/**
 * 注入本插件卡片主题色（探索 / 库存青绿）。
 *
 * @param card - 卡片根
 */
function applyTheme(card: HTMLElement): void {
  card.style.setProperty("--si-inline-accent", "#22c55e");
  card.style.setProperty("--si-inline-accent-text", "#ffffff");
}

/**
 * 注入卡片 CSS（幂等）。
 */
function addStyles(): void {
  if (document.querySelector(`style[${STYLE_ATTRIBUTE}]`)) {
    return;
  }

  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = `
[${HOST_ATTRIBUTE}] { align-self: stretch; flex: 0 0 100% !important; min-width: 0; width: 100% !important; box-sizing: border-box; }
[${CARD_ATTRIBUTE}] { align-self: stretch; flex: 0 0 100%; min-width: 0; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 7px; min-height: 42px; padding: 8px 11px; border: 1px solid var(--border-subtle, #383440); border-left: 3px solid var(--si-inline-accent); border-radius: 5px; background: var(--bg-canvas, #1b1920); color: var(--fg-primary, #f4f0ff); font: 13px/1.4 var(--font-sans, sans-serif); user-select: none; }
[${CARD_ATTRIBUTE}] .si-inline-card__header { display: inline-flex; align-items: center; align-self: flex-start; min-width: 0; padding: 3px 6px; border-radius: 3px; background: var(--si-inline-accent); color: var(--si-inline-accent-text, #ffffff); }
[${CARD_ATTRIBUTE}] .si-inline-card__badge { display: inline-flex; align-items: center; gap: 4px; min-width: 0; min-height: 22px; color: inherit; font-size: 13px; font-weight: 700; line-height: 1.25; }
[${CARD_ATTRIBUTE}] .si-inline-card__icon { font-size: 14px; line-height: 1; }
[${CARD_ATTRIBUTE}] .si-inline-card__title { overflow: hidden; color: inherit; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
[${CARD_ATTRIBUTE}] .si-inline-card__summary { overflow: hidden; color: var(--fg-secondary, #c2bdcc); text-overflow: ellipsis; white-space: nowrap; }
[${CARD_ATTRIBUTE}] .si-inline-card__chips { display: flex; flex-wrap: wrap; gap: 4px; }
[${CARD_ATTRIBUTE}] .si-inline-card__chip { padding: 2px 5px; border: 1px solid var(--si-inline-accent); border-radius: 3px; color: var(--fg-secondary, #c2bdcc); font-size: 11px; line-height: 1.35; }
`;
  document.head.append(style);
}

/**
 * @param parent - 父节点
 * @param className - class
 * @param value - 文本
 */
function appendText(
  parent: HTMLElement,
  className: string,
  value: string,
): void {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = value;
  parent.append(element);
}

/**
 * @param parent - chips 行
 * @param value - chip 文案
 */
function appendChip(parent: HTMLElement, value: string): void {
  const chip = document.createElement("span");
  chip.className = "si-inline-card__chip";
  chip.textContent = value;
  parent.append(chip);
}

/**
 * 按 method 生成摘要与 chips。
 *
 * @param methodId - 方法 id
 * @param params - 解包后的参数
 * @returns summary + chips
 */
function renderDetails(
  methodId: SceneMethodId,
  params: Record<string, unknown>,
): { summary: string; chips: string[] } {
  switch (methodId) {
    case "open-scene": {
      const scene = truncate(params.sceneIdOrName, 48);
      const pushReturn = params.pushReturn !== false;
      const returnTarget = truncate(params.returnTarget, 32);
      const chips = [
        pushReturn ? "压入返回栈" : "不压栈",
        ...(returnTarget ? [`返回：${returnTarget}`] : ["返回：来源场景"]),
      ];
      const resultVar = truncate(params.resultVariable, 24);

      if (resultVar) {
        chips.push(`结果→${resultVar}`);
      }

      return {
        summary: scene
          ? `打开场景「${scene}」（不阻塞剧情）`
          : "请在 Inspector 填写场景 ID/名称",
        chips,
      };
    }

    case "open-scene-interaction": {
      const scene = truncate(params.sceneIdOrName, 48);
      const pushReturn = params.pushReturn !== false;
      const chips = ["阻塞至退出", pushReturn ? "压入返回栈" : "不压栈"];

      return {
        summary: scene
          ? `打开「${scene}」并等待玩家退出`
          : "打开本次/编辑器主场景并阻塞剧情，直到退出",
        chips,
      };
    }

    case "close-scene-interaction": {
      const resultVar = truncate(params.resultVariable, 24);

      return {
        summary: "关闭场景交互叠层并解除阻塞，剧情继续",
        chips: resultVar ? [`结果→${resultVar}`] : ["解除会话门闩"],
      };
    }

    case "set-edit-mode": {
      const enabled = params.enabled === true;

      return {
        summary: enabled ? "显示作者编辑器界面" : "隐藏作者编辑器界面",
        chips: [enabled ? "启用编辑" : "关闭编辑"],
      };
    }

    case "get-current-scene-id": {
      const target = truncate(params.targetVariable, 32);

      return {
        summary: target
          ? `将当前场景 ID 写入变量「${target}」`
          : "请在 Inspector 填写写入变量",
        chips: target ? [`→ ${target}`] : ["需变量名"],
      };
    }

    case "set-hotspot-visible": {
      const hotspotId = truncate(params.hotspotId, 40);
      const visible = params.visible !== false;

      return {
        summary: hotspotId
          ? `${visible ? "显示" : "隐藏"}交互点「${hotspotId}」`
          : "请在 Inspector 填写交互点 ID",
        chips: [visible ? "可见" : "隐藏", ...(hotspotId ? [hotspotId] : [])],
      };
    }

    case "give-item": {
      const itemId = truncate(params.itemId, 40);
      const amount = Math.max(1, Math.floor(asFiniteNumber(params.amount, 1)));

      return {
        summary: itemId
          ? `给予「${itemId}」×${amount}`
          : "请在 Inspector 填写物品 ID",
        chips: [`×${amount}`, ...(itemId ? [itemId] : [])],
      };
    }

    case "has-item": {
      const itemId = truncate(params.itemId, 40);
      const resultVar = truncate(params.resultVariable, 24);

      return {
        summary: itemId
          ? `查询是否持有「${itemId}」`
          : "请在 Inspector 填写物品 ID",
        chips: [
          ...(itemId ? [itemId] : []),
          ...(resultVar ? [`结果→${resultVar}`] : []),
        ],
      };
    }

    case "get-item-count": {
      const itemId = truncate(params.itemId, 40);
      const target = truncate(params.targetVariable, 24);

      return {
        summary: itemId
          ? `读取「${itemId}」数量${target ? ` → ${target}` : ""}`
          : "请在 Inspector 填写物品 ID 与写入变量",
        chips: [
          ...(itemId ? [itemId] : []),
          ...(target ? [`→ ${target}`] : ["需变量名"]),
        ],
      };
    }

    case "craft-recipe": {
      const recipe = truncate(params.recipeIdOrName, 40);

      return {
        summary: recipe
          ? `按配方「${recipe}」合成一次`
          : "请在 Inspector 填写配方 ID/名称",
        chips: recipe ? [recipe, "扣原料+发产物"] : ["需配方"],
      };
    }

    case "open-backpack-hud":
      return {
        summary: "显示快捷栏 HUD（设计包围盒区域）",
        chips: ["快捷栏"],
      };

    case "close-backpack-hud":
      return {
        summary: "隐藏快捷栏 HUD",
        chips: ["快捷栏"],
      };

    case "open-backpack":
      return {
        summary: "打开全屏背包界面",
        chips: ["全屏背包"],
      };

    case "close-backpack":
      return {
        summary: "关闭全屏背包界面",
        chips: ["全屏背包"],
      };
  }
}

/**
 * 渲染或更新单块卡片。
 *
 * @param content - 块内容根
 * @param block - Fiber 块
 * @param methodId - 方法 id
 */
function renderCard(
  content: HTMLElement,
  block: ExtensionBlock | undefined,
  methodId: SceneMethodId,
): void {
  addStyles();
  content.setAttribute(HOST_ATTRIBUTE, "");

  const original = [...content.children].find(
    (child) =>
      !(child instanceof HTMLElement && child.hasAttribute(CARD_ATTRIBUTE)),
  );

  if (
    original instanceof HTMLElement &&
    !original.hasAttribute(ORIGINAL_DISPLAY_ATTRIBUTE)
  ) {
    original.setAttribute(
      ORIGINAL_DISPLAY_ATTRIBUTE,
      original.style.getPropertyValue("display"),
    );
    original.style.setProperty("display", "none", "important");
  }

  let card = content.querySelector<HTMLElement>(`:scope > [${CARD_ATTRIBUTE}]`);

  if (!card) {
    card = document.createElement("div");
    card.setAttribute(CARD_ATTRIBUTE, methodId);
    card.title = "点击此方法块后在 Inspector 编辑参数";
    content.append(card);
  }

  applyTheme(card);

  const params = literalParams(block?.props?.paramsJson);
  const { summary, chips } = renderDetails(methodId, params);
  const signature = `${methodId}\0${summary}\0${chips.join("\0")}`;

  if (card.dataset.signature === signature) {
    return;
  }

  card.dataset.signature = signature;
  card.replaceChildren();

  const header = document.createElement("div");
  header.className = "si-inline-card__header";
  const badge = document.createElement("span");
  badge.className = "si-inline-card__badge";
  appendText(badge, "si-inline-card__icon", METHOD_META[methodId].icon);
  appendText(badge, "si-inline-card__title", METHOD_META[methodId].label);
  header.append(badge);
  card.append(header);
  appendText(card, "si-inline-card__summary", summary);

  if (chips.length > 0) {
    const chipRow = document.createElement("div");
    chipRow.className = "si-inline-card__chips";
    chips.forEach((chip) => appendChip(chipRow, chip));
    card.append(chipRow);
  }
}

/**
 * 还原原生块外观。
 *
 * @param content - 块内容根
 */
function restoreNativeBlock(content: HTMLElement): void {
  const card = content.querySelector(`:scope > [${CARD_ATTRIBUTE}]`);

  if (!card) {
    return;
  }

  card.remove();
  content.removeAttribute(HOST_ATTRIBUTE);

  const original = content.querySelector<HTMLElement>(
    `:scope > [${ORIGINAL_DISPLAY_ATTRIBUTE}]`,
  );

  if (!original) {
    return;
  }

  const display = original.getAttribute(ORIGINAL_DISPLAY_ATTRIBUTE);

  if (display) {
    original.style.setProperty("display", display);
  } else {
    original.style.removeProperty("display");
  }

  original.removeAttribute(ORIGINAL_DISPLAY_ATTRIBUTE);
}

/**
 * 扫描并刷新根下所有扩展方法块。
 *
 * @param root - 扫描根（通常 document）
 */
function refresh(root: ParentNode): void {
  for (const content of root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
    const block = findBlock(content);
    const methodId = sceneMethodIdFromContent(content, block);

    if (methodId) {
      renderCard(content, block, methodId);
    } else if (content.querySelector(`:scope > [${CARD_ATTRIBUTE}]`)) {
      restoreNativeBlock(content);
    }
  }
}

/**
 * 安装 MutationObserver 与 Inspector 刷新钩子（幂等）。
 */
function installInlineCards(): void {
  if (typeof document === "undefined") {
    return;
  }

  const globals = globalThis as typeof globalThis & {
    [RUNTIME_KEY]?: InlineCardRuntime;
  };

  globals[RUNTIME_KEY]?.dispose();

  const start = (): void => {
    const root = document;
    const runtime: InlineCardRuntime = {
      dispose() {
        if (runtime.frame !== undefined) {
          cancelAnimationFrame(runtime.frame);
        }

        runtime.observer?.disconnect();
        runtime.themeObserver?.disconnect();

        if (runtime.inspectorRefresh) {
          document.removeEventListener(
            "input",
            runtime.inspectorRefresh,
            true,
          );
          document.removeEventListener(
            "change",
            runtime.inspectorRefresh,
            true,
          );
        }

        document
          .querySelectorAll<HTMLElement>(BLOCK_SELECTOR)
          .forEach(restoreNativeBlock);
      },
    };

    const schedule = (): void => {
      if (runtime.frame !== undefined) {
        return;
      }

      runtime.frame = requestAnimationFrame(() => {
        runtime.frame = undefined;
        refresh(root);
      });
    };

    runtime.inspectorRefresh = () => schedule();
    document.addEventListener("input", runtime.inspectorRefresh, true);
    document.addEventListener("change", runtime.inspectorRefresh, true);
    runtime.observer = new MutationObserver(schedule);
    runtime.observer.observe(root, { childList: true, subtree: true });
    runtime.themeObserver = new MutationObserver(schedule);
    runtime.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    if (document.body) {
      runtime.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }

    window.addEventListener("pagehide", () => runtime.dispose(), {
      once: true,
    });
    globals[RUNTIME_KEY] = runtime;
    schedule();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

installInlineCards();
