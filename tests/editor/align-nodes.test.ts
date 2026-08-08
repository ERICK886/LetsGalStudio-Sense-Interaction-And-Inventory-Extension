/**
 * align-nodes.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 多选对齐纯函数单测。
 */

import { describe, expect, it } from "vitest";
import {
  alignRects,
  toggleOrReplaceSelection,
} from "../../src/editor/ui/align-nodes";

describe("alignRects", () => {
  const a = { id: "a", rect: { x: 10, y: 10, w: 40, h: 40 } };
  const b = { id: "b", rect: { x: 80, y: 20, w: 40, h: 40 } };

  it("不足 2 个返回空", () => {
    expect(alignRects([a], "left").size).toBe(0);
  });

  it("左对齐", () => {
    const next = alignRects([a, b], "left");

    expect(next.get("a")!.x).toBe(10);
    expect(next.get("b")!.x).toBe(10);
  });

  it("右对齐", () => {
    const next = alignRects([a, b], "right");

    expect(next.get("a")!.x).toBe(80);
    expect(next.get("b")!.x).toBe(80);
  });

  it("水平居中", () => {
    const next = alignRects([a, b], "centerX");
    // 包围盒 10..120，中心 65；节点中心应对齐 65 → x = 45
    expect(next.get("a")!.x).toBe(45);
    expect(next.get("b")!.x).toBe(45);
  });
});

describe("toggleOrReplaceSelection", () => {
  it("普通单击替换", () => {
    expect(toggleOrReplaceSelection(["a", "b"], "c", false)).toEqual(["c"]);
  });

  it("Shift 追加与移除", () => {
    expect(toggleOrReplaceSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleOrReplaceSelection(["a", "b"], "a", true)).toEqual(["b"]);
  });
});
