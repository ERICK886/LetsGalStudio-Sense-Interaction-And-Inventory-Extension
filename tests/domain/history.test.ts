/**
 * history.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * createHistory 撤销/重做栈聚焦单测。
 */
import { describe, it, expect } from "vitest";
import { createHistory } from "../../src/store/history";

describe("createHistory", () => {
  it("初始无 present，不可 undo/redo", () => {
    const history = createHistory<number>();

    expect(history.present).toBeUndefined();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("push 后 present 为最新快照", () => {
    const history = createHistory<{ n: number }>();

    history.push({ n: 1 });
    history.push({ n: 2 });

    expect(history.present).toEqual({ n: 2 });
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("undo 回到上一快照，redo 前进", () => {
    const history = createHistory<string>();

    history.push("a");
    history.push("b");
    history.push("c");

    expect(history.undo()).toBe("b");
    expect(history.present).toBe("b");
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);

    expect(history.redo()).toBe("c");
    expect(history.present).toBe("c");
    expect(history.canRedo).toBe(false);
  });

  it("push 截断 redo 分支", () => {
    const history = createHistory<string>();

    history.push("a");
    history.push("b");
    history.undo();
    history.push("c");

    expect(history.present).toBe("c");
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe("a");
  });

  it("超出 limit 时丢弃最旧快照", () => {
    const history = createHistory<number>(2);

    history.push(1);
    history.push(2);
    history.push(3);

    expect(history.present).toBe(3);
    expect(history.undo()).toBe(2);
    expect(history.canUndo).toBe(false);
  });

  it("push 深拷贝，外部 mutation 不污染栈", () => {
    const history = createHistory<{ items: string[] }>();
    const state = { items: ["x"] };

    history.push(state);
    state.items.push("y");

    expect(history.present).toEqual({ items: ["x"] });
  });

  it("不可 undo/redo 时返回 undefined 且 present 不变", () => {
    const history = createHistory<string>();

    expect(history.undo()).toBeUndefined();
    expect(history.redo()).toBeUndefined();

    history.push("only");
    expect(history.undo()).toBeUndefined();
    expect(history.present).toBe("only");
    expect(history.redo()).toBeUndefined();
  });
});
