/**
 * node-list.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.4.0
 *
 * 自由布局编辑器节点侧栏：
 * - 单击替换选中；Shift+单击切换多选
 * - 使用 @dnd-kit 拖拽排序（固定节点与图层均可拖）
 */

import { Button, chakra } from "@chakra-ui/react";
import React, { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaIcon } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * 节点列表单项。
 */
export interface NodeListItem {
  /** 节点 id（如 quickbarRoot、overlay:xxx） */
  id: string;

  /** 侧栏展示文案 */
  label: string;

  /** 可选 Font Awesome 图标名（不含 fa-） */
  icon?: string;
}

/**
 * 选中事件修饰键。
 */
export interface NodeSelectModifiers {
  /** 是否按住 Shift（切换多选） */
  shiftKey: boolean;
}

/**
 * NodeList 组件属性。
 */
export interface NodeListProps {
  /** 可编辑节点条目 */
  items: readonly NodeListItem[];

  /**
   * 当前选中节点 id 列表（多选）。
   */
  selectedIds: readonly string[];

  /**
   * 选中节点。
   *
   * @param id - 节点 id
   * @param modifiers - 修饰键（Shift = 切换）
   */
  onSelect: (id: string, modifiers: NodeSelectModifiers) => void;

  /**
   * 拖拽排序完成：传入重排后的完整 id 列表。
   * 未传则不启用拖拽。
   *
   * @param orderedIds - 新顺序
   */
  onReorder?: (orderedIds: readonly string[]) => void;
}

/**
 * @param tokens - 主题
 * @param selected - 是否选中
 * @param dragging - 是否正在拖
 */
function rowStyle(
  tokens: ThemeTokens,
  selected: boolean,
  dragging: boolean,
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
    cursor: "grab",
    fontSize: FONT_SIZE_DEFAULT,
    textAlign: "left",
    width: "100%",
    boxSizing: "border-box",
    opacity: dragging ? 0.55 : 1,
    userSelect: "none",
    touchAction: "none",
  };
}

/**
 * 可排序行。
 */
function SortableRow({
  item,
  selected,
  canReorder,
  onSelect,
}: {
  item: NodeListItem;
  selected: boolean;
  canReorder: boolean;
  onSelect: (id: string, modifiers: NodeSelectModifiers) => void;
}): React.ReactElement {
  const { tokens } = useTheme();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canReorder });

  const style: React.CSSProperties = {
    ...rowStyle(tokens, selected, isDragging),
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
    position: "relative",
  };

  return (
    <Button size="xs" variant="plain"
      ref={setNodeRef}
      type="button"
      data-testid={`node-list-item-${item.id}`}
      aria-selected={selected}
      style={style}
      onClick={(event) => {
        if (isDragging) {
          return;
        }

        onSelect(item.id, { shiftKey: event.shiftKey });
      }}
      {...(canReorder ? { ...attributes, ...listeners } : {})}
    >
      {canReorder ? (
        <FaIcon
          name="grip-vertical"
          css={{
            fontSize: 11,
            width: 12,
            color: tokens.textMuted,
            flexShrink: 0,
            opacity: 0.75,
          }}
        />
      ) : (
        <chakra.span style={{ width: 12, flexShrink: 0, display: "inline-block" }} />
      )}
      {item.icon ? (
        <FaIcon
          name={item.icon}
          css={{
            fontSize: 12,
            width: 14,
            color: selected ? tokens.accent : tokens.textMuted,
            flexShrink: 0,
          }}
        />
      ) : null}
      <chakra.span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
      </chakra.span>
    </Button>
  );
}

/**
 * 节点列表侧栏（@dnd-kit 排序）。
 *
 * @param props - NodeListProps
 * @returns 节点列表 UI
 */
export function NodeList({
  items,
  selectedIds,
  onSelect,
  onReorder,
}: NodeListProps): React.ReactElement {
  const { tokens } = useTheme();
  const selectedSet = new Set(selectedIds);
  const canReorder = typeof onReorder === "function";
  const [activeId, setActiveId] = useState<string | null>(null);

  const ids = useMemo(() => items.map((item) => item.id), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveId(null);

    if (!onReorder) {
      return;
    }

    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));

    if (from < 0 || to < 0) {
      return;
    }

    onReorder(arrayMove(ids, from, to));
  };

  const handleDragCancel = (): void => {
    setActiveId(null);
  };

  const listBody =
    items.length === 0 ? (
      <chakra.div
        data-testid="node-list-empty"
        style={{
          padding: 16,
          color: tokens.textMuted,
          fontSize: FONT_SIZE_DEFAULT,
          textAlign: "center",
        }}
      >
        暂无节点
      </chakra.div>
    ) : (
      items.map((item) => (
        <SortableRow
          key={item.id}
          item={item}
          selected={selectedSet.has(item.id)}
          canReorder={canReorder}
          onSelect={onSelect}
        />
      ))
    );

  return (
    <chakra.div
      data-testid="node-list"
      data-dragging={activeId ? "true" : "false"}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        background: tokens.bgElevated,
        color: tokens.textPrimary,
        borderRight: `1px solid ${tokens.border}`,
      }}
    >
      <chakra.div
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
          fontSize: FONT_SIZE_TITLE,
          fontWeight: 650,
        }}
      >
        节点
      </chakra.div>

      <chakra.div
        style={{
          padding: "4px 12px 8px",
          fontSize: 11,
          color: tokens.textMuted,
          flexShrink: 0,
          lineHeight: 1.4,
        }}
      >
        {canReorder ? "拖拽排序叠放；Shift+单击多选" : "Shift+单击多选"}
      </chakra.div>

      <chakra.div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "0 8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {canReorder ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {listBody}
            </SortableContext>
          </DndContext>
        ) : (
          listBody
        )}
      </chakra.div>
    </chakra.div>
  );
}
