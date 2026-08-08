/**
 * scene-return-stack.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景返回栈的 JSON 解析/序列化、入栈/出栈与 openScene 统一入栈入口。
 * 栈顶（数组末元素）为最近一次可返回的目标场景 id。
 */

import { findScene } from "./scene-registry";
import type { SceneDefinition } from "./types";

/**
 * 从存档 JSON 字符串解析返回栈。
 *
 * - `undefined` / `null` / 空串 → `[]`
 * - 非法 JSON / 非数组 → `[]`
 * - 元素须为非空字符串；trim 后写入
 *
 * @param raw - 玩家存档或预览沙箱中的 `sceneReturnStackJson`
 * @returns 场景 id 数组（栈底在前，栈顶在后）
 *
 * @example
 * ```ts
 * parseSceneReturnStackJson('["A","B"]'); // ["A", "B"]
 * parseSceneReturnStackJson("");          // []
 * parseSceneReturnStackJson("{}");        // []
 * ```
 */
export function parseSceneReturnStackJson(
  raw: string | undefined | null,
): string[] {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
      .map((x) => x.trim());
  } catch {
    return [];
  }
}

/**
 * 将返回栈序列化为 JSON 字符串（写入存档前调用）。
 *
 * @param stack - 场景 id 数组
 * @returns `JSON.stringify(stack)` 的结果
 *
 * @example
 * ```ts
 * stringifySceneReturnStack(["A", "B"]); // '["A","B"]'
 * ```
 */
export function stringifySceneReturnStack(stack: string[]): string {
  return JSON.stringify(stack);
}

/**
 * 向返回栈压入一层（若栈顶已是同一 id 则不重复压入）。
 *
 * @param stack - 当前栈（不会被原地修改）
 * @param sceneId - 待压入的场景 id
 * @returns 新栈副本
 *
 * @example
 * ```ts
 * pushSceneReturn(["A"], "A"); // ["A"] — 栈顶相同，不重复
 * pushSceneReturn(["A"], "B"); // ["A", "B"]
 * pushSceneReturn(["A"], "  "); // ["A"] — 空 id 忽略
 * ```
 */
export function pushSceneReturn(stack: string[], sceneId: string): string[] {
  const id = sceneId.trim();

  if (!id) {
    return stack.slice();
  }

  if (stack.length > 0 && stack[stack.length - 1] === id) {
    return stack.slice();
  }

  return [...stack, id];
}

/**
 * 预览栈顶最近一个仍存在于场景库中的 id（不修改栈）。
 *
 * 与 {@link popValidSceneReturn} 对应的「只读」版本：自栈顶向栈底扫描，
 * 返回第一个能被 {@link findScene} 解析的 id；栈空或全部失效时返回 null。
 *
 * 用于运行时返回按钮判断「是否存在可返回目标」而不实际出栈，
 * 避免点击前误改存档栈。
 *
 * @param stack - 当前返回栈
 * @param scenes - 场景定义列表（用于校验 id 是否仍有效）
 * @returns 栈顶最近一个有效场景 id；无有效目标时 null
 *
 * @example
 * ```ts
 * const scenes = [{ id: "A", ... }, { id: "B", ... }];
 * peekValidSceneReturn(["A", "B"], scenes); // "B"
 * peekValidSceneReturn(["X"], scenes);      // null — X 不在库中
 * peekValidSceneReturn([], scenes);         // null
 * ```
 */
export function peekValidSceneReturn(
  stack: string[],
  scenes: SceneDefinition[],
): string | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const id = stack[i];

    if (id !== undefined && findScene(scenes, id) !== undefined) {
      return id;
    }
  }

  return null;
}

/**
 * 从栈顶弹出第一个仍存在于场景库中的 id。
 *
 * 若栈顶 id 在 `scenes` 中已不存在，则继续弹出直至找到有效 id 或栈空。
 *
 * @param stack - 当前返回栈
 * @param scenes - 场景定义列表（用于校验 id 是否仍有效）
 * @returns `nextStack` 为弹出后的剩余栈；`targetId` 为可跳转目标，栈空时为 null
 *
 * @example
 * ```ts
 * const scenes = [{ id: "A", ... }, { id: "B", ... }];
 * popValidSceneReturn(["A", "B"], scenes);
 * // { nextStack: ["A"], targetId: "B" }
 * ```
 */
export function popValidSceneReturn(
  stack: string[],
  scenes: SceneDefinition[],
): { nextStack: string[]; targetId: string | null } {
  let next = stack.slice();

  while (next.length > 0) {
    const id = next.pop()!;

    if (findScene(scenes, id) !== undefined) {
      return { nextStack: next, targetId: id };
    }
  }

  return { nextStack: [], targetId: null };
}

/**
 * 打开场景并可选压入返回栈（动作 / 剧本 method 的统一领域入口）。
 *
 * 规则摘要：
 * 1. 解析 `targetKey` 失败 → 不改栈、不切场景（`ok: false`）
 * 2. `pushReturn !== false` 时压入「返回目标」：默认 `currentSceneId`，
 *    若 `returnTarget` 非空且能解析为场景则改用其 id
 * 3. 压入 id 与目标场景 id 相同时不入栈（避免自环）
 *
 * @param params.scenes - 场景库
 * @param params.currentSceneId - 打开前的当前场景 id
 * @param params.stack - 当前返回栈
 * @param params.targetKey - 目标场景 id 或 name
 * @param params.returnTarget - 可选，覆盖压栈 id（须能解析为有效场景）
 * @param params.pushReturn - 缺省 true；false 时只切换场景
 * @returns `ok` 是否成功；成功时 `nextSceneId` 与更新后的 `nextStack`
 *
 * @example
 * ```ts
 * openSceneWithReturn({
 *   scenes,
 *   currentSceneId: "A",
 *   stack: [],
 *   targetKey: "B",
 * });
 * // { ok: true, nextSceneId: "B", nextStack: ["A"] }
 * ```
 */
export function openSceneWithReturn(params: {
  scenes: SceneDefinition[];
  currentSceneId: string;
  stack: string[];
  targetKey: string;
  returnTarget?: string;
  pushReturn?: boolean;
}): {
  ok: boolean;
  nextSceneId: string | null;
  nextStack: string[];
} {
  const scene = findScene(params.scenes, params.targetKey);

  if (scene === undefined) {
    return {
      ok: false,
      nextSceneId: null,
      nextStack: params.stack.slice(),
    };
  }

  let nextStack = params.stack.slice();
  const pushReturn = params.pushReturn !== false;

  if (pushReturn) {
    let pushId = params.currentSceneId.trim();

    if (params.returnTarget !== undefined && params.returnTarget.trim() !== "") {
      const resolved = findScene(params.scenes, params.returnTarget.trim());

      if (resolved !== undefined) {
        pushId = resolved.id;
      }
    }

    if (pushId && pushId !== scene.id) {
      nextStack = pushSceneReturn(nextStack, pushId);
    }
  }

  return { ok: true, nextSceneId: scene.id, nextStack };
}
