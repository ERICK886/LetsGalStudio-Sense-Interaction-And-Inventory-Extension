/**
 * actions.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景动作链 executeSceneActions 与 findScene 单测。
 */
import { describe, it, expect, vi } from "vitest";
import { executeSceneActions } from "../../src/domain/actions";
import { findScene } from "../../src/domain/scene-registry";
import { defaultElementMotion } from "../../src/domain/motion";
import type { SceneDefinition } from "../../src/domain/types";

describe("executeSceneActions", () => {
  it("按序执行；openScene 失败仍继续 giveItem", async () => {
    const calls: string[] = [];
    await executeSceneActions(
      [
        { type: "openScene", sceneIdOrName: "missing" },
        {
          type: "giveItem",
          itemId: "potion",
          amount: 1,
          toastText: "获得药水",
          toastMotion: defaultElementMotion(),
        },
      ],
      "hs1",
      {
        openScene: () => {
          calls.push("open");
          return false;
        },
        giveItem: () => {
          calls.push("give");
          return true;
        },
        enqueueToast: () => {
          calls.push("toast");
        },
        warn: () => {
          calls.push("warn");
        },
      },
    );
    expect(calls).toEqual(["open", "warn", "give", "toast"]);
  });

  it("none 不产生副作用", async () => {
    const warn = vi.fn();
    await executeSceneActions([{ type: "none" }], "hs1", {
      openScene: () => true,
      giveItem: () => true,
      enqueueToast: () => {},
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("findScene", () => {
  const scenes: SceneDefinition[] = [
    {
      id: "scene-a",
      name: "场景A",
      baseImage: "",
      hotspots: [],
    },
    {
      id: "scene-b",
      name: "同名",
      baseImage: "",
      hotspots: [],
    },
  ];

  it("优先按 id 匹配", () => {
    expect(findScene(scenes, "scene-a")?.id).toBe("scene-a");
  });

  it("id 未命中时按 name 匹配", () => {
    expect(findScene(scenes, "同名")?.id).toBe("scene-b");
  });
});
