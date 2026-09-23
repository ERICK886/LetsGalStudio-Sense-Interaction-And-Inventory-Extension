import { EditorSelect, EditorSelectOption } from "../editor/ui/editor-select";
/**
 * fragment-select-field.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 交互点动作「跳转片段」用的片段选择器：
 * 从 ctx.story 拉取章节与片段，下拉显示「章节名 / 片段名」，
 * 选中时回写 fragmentId + chapterId。
 */

import { chakra } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import type { ThemeTokens } from "../theme/tokens";

/**
 * 下拉选项：稳定 id + 展示名。
 */
export interface FragmentSelectOption {
  /** 片段 id（写入动作） */
  fragmentId: string;

  /** 所属章节 id（写入动作 chapterId） */
  chapterId: string;

  /** 下拉展示：「章节 / 片段」 */
  label: string;
}

/**
 * FragmentSelectField 属性。
 */
export interface FragmentSelectFieldProps {
  /** 当前片段 id */
  fragmentId: string;

  /**
   * 选中变更。
   *
   * @param fragmentId - 片段 id；空串表示未选
   * @param chapterId - 所属章节；未选时为 undefined
   */
  onChange: (fragmentId: string, chapterId: string | undefined) => void;

  /** 主题 token（与动作列表控件一致） */
  tokens: ThemeTokens;

  /** aria / test id 后缀 */
  index: number;

  /** 控件样式 */
  controlStyle: React.CSSProperties;
}

/**
 * 从 StoryAPI 加载全部章节下的片段选项。
 *
 * @param story - ExtensionContext.story
 * @returns 选项列表（章节顺序 × 片段顺序）
 *
 * @remarks
 * 章节加载失败时跳过该章，不抛到 UI。
 */
async function loadFragmentOptions(
  story: {
    listChapters: () => ReadonlyArray<{ id: string; name?: string }>;
    getChapter: (
      id: string,
    ) => Promise<{
      id: string;
      name?: string;
      fragments: ReadonlyArray<{ id: string; name?: string }>;
    } | null>;
  },
): Promise<FragmentSelectOption[]> {
  const metas = story.listChapters();
  const options: FragmentSelectOption[] = [];

  for (const meta of metas) {
    try {
      const chapter = await story.getChapter(meta.id);

      if (chapter === null) {
        continue;
      }

      const chapterLabel = (chapter.name || meta.name || chapter.id).trim();

      for (const fragment of chapter.fragments) {
        const fragmentLabel = (fragment.name || fragment.id).trim();

        options.push({
          fragmentId: fragment.id,
          chapterId: chapter.id,
          label: `${chapterLabel} / ${fragmentLabel}`,
        });
      }
    } catch {
      // 单章失败不影响其余章节
    }
  }

  return options;
}

/**
 * 片段选择下拉（显示片段名称）。
 *
 * @param props - FragmentSelectFieldProps
 * @returns select 节点
 *
 * @example
 * ```tsx
 * <FragmentSelectField
 *   fragmentId={action.fragmentId}
 *   index={0}
 *   tokens={tokens}
 *   controlStyle={controlStyle(tokens)}
 *   onChange={(fragmentId, chapterId) =>
 *     onReplace({ ...action, fragmentId, chapterId })
 *   }
 * />
 * ```
 */
export function FragmentSelectField(
  props: FragmentSelectFieldProps,
): React.ReactElement {
  const { fragmentId, onChange, tokens, index, controlStyle } = props;
  const ctx = useExtensionContext();
  const [options, setOptions] = useState<FragmentSelectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    void loadFragmentOptions(ctx.story)
      .then((list) => {
        if (!cancelled) {
          setOptions(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ctx]);

  const missingSelected =
    fragmentId.trim() !== "" &&
    !options.some((opt) => opt.fragmentId === fragmentId);

  return (
    <chakra.label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <chakra.span style={{ fontSize: 11, color: tokens.textMuted }}>目标片段</chakra.span>
      <EditorSelect
        aria-label={`动作 ${index + 1} 目标片段`}
        data-testid={`action-fragment-${index}`}
        value={fragmentId}
        disabled={loading && options.length === 0}
        style={controlStyle}
        onChange={(e) => {
          const nextId = e.target.value;
          const hit = options.find((opt) => opt.fragmentId === nextId);

          onChange(
            nextId,
            hit !== undefined ? hit.chapterId : undefined,
          );
        }}
      >
        <EditorSelectOption value="">
          {loading ? "（加载片段列表…）" : "（请选择片段）"}
        </EditorSelectOption>
        {missingSelected ? (
          <EditorSelectOption value={fragmentId}>
            {fragmentId}（未在工程中找到）
          </EditorSelectOption>
        ) : null}
        {options.map((opt) => (
          <EditorSelectOption key={`${opt.chapterId}:${opt.fragmentId}`} value={opt.fragmentId}>
            {opt.label}
          </EditorSelectOption>
        ))}
      </EditorSelect>
    </chakra.label>
  );
}
