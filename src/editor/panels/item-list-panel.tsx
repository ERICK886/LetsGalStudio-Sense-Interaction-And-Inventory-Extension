/**
 * item-list-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 编辑器左栏：物品列表 CRUD（搜索 / 新建 / 删除 / 选中）。
 * 删除时若场景仍引用该物品，在面板顶部显示黄色软警告条（仍允许删除）。
 */

import { chakra } from "@chakra-ui/react";
import React, { useCallback, useMemo, useState } from "react";
import { createId } from "../../domain/id";
import { scenesReferencingItem } from "../../domain/item-refs";
import type {
  ItemDefinition,
  ItemsLibraryFile,
  SceneDefinition,
} from "../../domain/types";
import { IconLabel } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * ItemListPanel 组件属性。
 */
export interface ItemListPanelProps {
  /** 当前物品库 */
  library: ItemsLibraryFile;

  /** 当前选中物品 ID；无选中时为 null */
  selectedItemId: string | null;

  /**
   * 选中物品。
   *
   * @param itemId - 物品 id；取消选中传 null
   */
  onSelectItem: (itemId: string | null) => void;

  /**
   * 物品库变更（由父级负责 history.push + 持久化）。
   *
   * @param next - 新物品库
   */
  onLibraryChange: (next: ItemsLibraryFile) => void;

  /**
   * 场景列表，用于删除前扫描 `scenesReferencingItem` 软警告。
   */
  scenes: readonly SceneDefinition[];
}

/**
 * 创建空白默认物品定义。
 *
 * @returns 带新 id 的 ItemDefinition（可堆叠，maxStack=99）
 *
 * @example
 * ```ts
 * const item = createDefaultItem();
 * // { id: "item_…", name: "未命名物品", stackable: true, maxStack: 99, ... }
 * ```
 */
export function createDefaultItem(): ItemDefinition {
  return {
    id: createId("item"),
    name: "未命名物品",
    description: "",
    icon: "",
    detailImage: "",
    stackable: true,
    maxStack: 99,
  };
}

/**
 * 工具栏小按钮样式。
 *
 * @param tokens - 主题 token
 * @param options.danger - 危险操作（删除）
 * @returns CSSProperties
 */
function toolButtonStyle(
  tokens: ThemeTokens,
  options: { danger?: boolean } = {},
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${options.danger ? "#C45C5C" : tokens.borderStrong}`,
    background: tokens.bgSunken,
    color: options.danger ? "#E8A0A0" : tokens.textPrimary,
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

/**
 * 物品列表行样式。
 *
 * @param tokens - 主题 token
 * @param selected - 是否选中
 * @returns CSSProperties
 */
function rowStyle(
  tokens: ThemeTokens,
  selected: boolean,
): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${selected ? tokens.accent : "transparent"}`,
    background: selected ? `${tokens.accent}18` : "transparent",
    color: tokens.textPrimary,
    cursor: "pointer",
    fontSize: FONT_SIZE_DEFAULT,
    textAlign: "left",
    width: "100%",
    boxSizing: "border-box",
  };
}

/**
 * 物品列表面板：搜索 / 新建 / 删除 / 选中。
 *
 * 删除被场景 `giveItem` 引用的物品时，顶部显示黄条软警告，不阻断删除。
 *
 * @param props - ItemListPanelProps
 * @returns 左栏物品列表 UI
 *
 * @example
 * ```tsx
 * <ItemListPanel
 *   library={itemsLibrary}
 *   selectedItemId={itemId}
 *   onSelectItem={setItemId}
 *   onLibraryChange={commitItems}
 *   scenes={scenesLibrary.scenes}
 * />
 * ```
 */
export function ItemListPanel({
  library,
  selectedItemId,
  onSelectItem,
  onLibraryChange,
  scenes,
}: ItemListPanelProps): React.ReactElement {
  const { tokens } = useTheme();
  const [query, setQuery] = useState("");

  /**
   * 最近一次删除触发的软警告文案；空字符串表示不展示。
   * 软警告：仅提示，不阻止删除。
   */
  const [deleteWarning, setDeleteWarning] = useState<string>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return library.items;
    }

    return library.items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    );
  }, [library.items, query]);

  /**
   * 新建物品并选中；清除删除警告。
   */
  const handleAdd = useCallback(() => {
    const item = createDefaultItem();
    const next: ItemsLibraryFile = {
      version: 1,
      items: [...library.items, item],
    };

    setDeleteWarning("");
    onLibraryChange(next);
    onSelectItem(item.id);
  }, [library.items, onLibraryChange, onSelectItem]);

  /**
   * 删除指定物品。
   *
   * 若 `scenesReferencingItem` 非空，写入黄条软警告后仍执行删除。
   *
   * @param itemId - 待删物品 id
   * @param event - 鼠标事件（阻止冒泡选中）
   */
  const handleDelete = useCallback(
    (itemId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      const refs = scenesReferencingItem(scenes, itemId);

      if (refs.length > 0) {
        setDeleteWarning(
          `警告：仍有 ${refs.length} 个场景通过 giveItem 引用「${itemId}」（${refs.join("、")}）。已删除物品，场景动作未自动清理。`,
        );
      } else {
        setDeleteWarning("");
      }

      const nextItems = library.items.filter((item) => item.id !== itemId);
      const next: ItemsLibraryFile = { version: 1, items: nextItems };

      onLibraryChange(next);

      if (selectedItemId === itemId) {
        onSelectItem(nextItems[0]?.id ?? null);
      }
    },
    [
      library.items,
      onLibraryChange,
      onSelectItem,
      scenes,
      selectedItemId,
    ],
  );

  return (
    <chakra.div
      data-testid="item-list-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        background: tokens.bgElevated,
        color: tokens.textPrimary,
      }}
    >
      <chakra.div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <chakra.span
          style={{
            flex: 1,
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
          }}
        >
          物品
        </chakra.span>
        <chakra.button
          type="button"
          data-testid="item-list-add"
          onClick={handleAdd}
          style={toolButtonStyle(tokens)}
        >
          <IconLabel icon="plus">新建</IconLabel>
        </chakra.button>
      </chakra.div>

      {deleteWarning ? (
        <chakra.div
          data-testid="item-list-delete-warning"
          role="status"
          style={{
            flexShrink: 0,
            margin: "8px 12px 0",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #C9A227",
            background: "rgba(201, 162, 39, 0.18)",
            color: "#E8D48B",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {deleteWarning}
        </chakra.div>
      ) : null}

      <chakra.div style={{ padding: "8px 12px", flexShrink: 0 }}>
        <chakra.input
          data-testid="item-list-search"
          type="search"
          placeholder="搜索物品…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            background: tokens.bgSunken,
            color: tokens.textPrimary,
            fontSize: FONT_SIZE_DEFAULT,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </chakra.div>

      <chakra.div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "4px 8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {filtered.length === 0 ? (
          <chakra.div
            style={{
              padding: 16,
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            {library.items.length === 0
              ? "暂无物品，点击「新建」"
              : "无匹配物品"}
          </chakra.div>
        ) : (
          filtered.map((item) => {
            const selected = item.id === selectedItemId;

            return (
              <chakra.div
                key={item.id}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <chakra.button
                  type="button"
                  data-testid={`item-list-item-${item.id}`}
                  aria-selected={selected}
                  onClick={() => onSelectItem(item.id)}
                  style={rowStyle(tokens, selected)}
                >
                  <IconLabel
                    icon={item.stackable ? "layer-group" : "cube"}
                    iconSize={11}
                  />
                  <chakra.span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.name || "（未命名）"}
                  </chakra.span>
                  <chakra.span
                    style={{
                      color: tokens.textMuted,
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {item.stackable ? "堆叠" : "唯一"}
                  </chakra.span>
                </chakra.button>
                <chakra.button
                  type="button"
                  data-testid={`item-list-delete-${item.id}`}
                  aria-label={`删除物品 ${item.name}`}
                  onClick={(e) => handleDelete(item.id, e)}
                  style={{
                    ...toolButtonStyle(tokens, { danger: true }),
                    padding: "6px 8px",
                    flexShrink: 0,
                  }}
                >
                  <IconLabel icon="trash" />
                </chakra.button>
              </chakra.div>
            );
          })
        )}
      </chakra.div>
    </chakra.div>
  );
}
