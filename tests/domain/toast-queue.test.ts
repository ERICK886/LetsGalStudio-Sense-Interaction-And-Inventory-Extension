/**
 * toast-queue.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 轻提示队列单测：入队、推进与不可变更新。
 */
import { describe, it, expect } from "vitest";
import {
  emptyToastQueue,
  enqueueToast,
  advanceToastQueue,
} from "../../src/domain/toast-queue";
import { defaultElementMotion } from "../../src/domain/motion";

/** 构造一条不含 id 的 toast 请求 */
function makeToastRequest(text: string, anchorHotspotId = "hs_1") {
  return {
    text,
    anchorHotspotId,
    motion: defaultElementMotion(),
  };
}

describe("emptyToastQueue", () => {
  it("返回 current 为 null、pending 为空数组", () => {
    expect(emptyToastQueue()).toEqual({ current: null, pending: [] });
  });
});

describe("enqueueToast", () => {
  it("current 为空时新请求直接成为 current", () => {
    const state = emptyToastQueue();
    const next = enqueueToast(state, makeToastRequest("获得药水"), "t1");

    expect(next.current).toMatchObject({
      id: "t1",
      text: "获得药水",
      anchorHotspotId: "hs_1",
    });
    expect(next.pending).toEqual([]);
  });

  it("连续 enqueue 两条：一条 current、一条 pending", () => {
    let state = emptyToastQueue();
    state = enqueueToast(state, makeToastRequest("第一条"), "t1");
    state = enqueueToast(state, makeToastRequest("第二条"), "t2");

    expect(state.current?.id).toBe("t1");
    expect(state.current?.text).toBe("第一条");
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]).toMatchObject({ id: "t2", text: "第二条" });
  });

  it("不修改入参 state", () => {
    const state = enqueueToast(
      emptyToastQueue(),
      makeToastRequest("不变"),
      "t1",
    );
    const snapshot = structuredClone(state);

    enqueueToast(state, makeToastRequest("新请求"), "t2");

    expect(state).toEqual(snapshot);
  });
});

describe("advanceToastQueue", () => {
  it("pending 首条晋升为 current，其余 pending 保留", () => {
    let state = emptyToastQueue();
    state = enqueueToast(state, makeToastRequest("第一条"), "t1");
    state = enqueueToast(state, makeToastRequest("第二条"), "t2");
    state = enqueueToast(state, makeToastRequest("第三条"), "t3");

    state = advanceToastQueue(state);

    expect(state.current?.id).toBe("t2");
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]?.id).toBe("t3");
  });

  it("pending 为空时 current 变为 null", () => {
    let state = enqueueToast(
      emptyToastQueue(),
      makeToastRequest("唯一一条"),
      "t1",
    );

    state = advanceToastQueue(state);

    expect(state).toEqual({ current: null, pending: [] });
  });
});
