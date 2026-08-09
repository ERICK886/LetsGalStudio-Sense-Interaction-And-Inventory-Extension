/**
 * history.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.2.0
 *
 * 通用撤销/重做快照栈：createHistory<T>（默认上限 50）。
 * 支持 beginAction / endAction：连续动作只保留「动作前 → 动作后」一步。
 */

/** 编辑器撤销栈默认最大快照数 */
export const HISTORY_MAX = 50;

/**
 * createHistory 返回的撤销/重做句柄。
 *
 * @typeParam T - 快照类型（建议为可 JSON 克隆的纯数据）
 */
export interface HistoryHandle<T> {
  /**
   * 压入新快照；截断 redo 分支；超出 limit 时丢弃最旧项。
   *
   * 若处于 `beginAction`…`endAction` 之间：首次 push 入栈，之后替换栈顶。
   *
   * @param state - 当前状态（内部深拷贝后入栈）
   */
  push(state: T): void;

  /**
   * 开始连续动作（拖拽、滑条、取色等）。
   *
   * 动作前状态即为当前栈顶；动作内多次 push 合并为一步。
   */
  beginAction(): void;

  /**
   * 结束连续动作。
   */
  endAction(): void;

  /**
   * 撤销一步并返回新的 present；不可撤销时返回 undefined。
   *
   * @returns 上一快照副本，或 undefined
   */
  undo(): T | undefined;

  /**
   * 重做一步并返回新的 present；不可重做时返回 undefined。
   *
   * @returns 下一快照副本，或 undefined
   */
  redo(): T | undefined;

  /** 是否可撤销（指针不在栈底） */
  readonly canUndo: boolean;

  /** 是否可重做（指针不在栈顶） */
  readonly canRedo: boolean;

  /** 当前快照副本；尚未 push 时为 undefined */
  readonly present: T | undefined;

  /** 是否处于连续动作中 */
  readonly isActionActive: boolean;
}

/**
 * 深拷贝快照，避免栈内引用被外部 mutation 污染。
 *
 * @typeParam T - 快照类型
 * @param value - 源值
 * @returns 独立副本
 *
 * @throws 若值不可 JSON 序列化，抛出底层 JSON 异常
 */
function cloneSnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 创建通用撤销/重做栈。
 *
 * 采用「快照数组 + 指针」模型：
 * - `push` 截断 redo 并追加深拷贝
 * - `beginAction` / `endAction` 将连续 push 合并为一步
 * - `undo` / `redo` 移动指针并返回当前快照副本
 * - 超出 `limit` 时丢弃最旧快照
 *
 * @typeParam T - 快照类型
 * @param limit - 最大保留快照数（默认 50，至少 1）
 * @returns HistoryHandle
 *
 * @throws RangeError 当 limit < 1
 *
 * @example
 * ```ts
 * const history = createHistory<{ n: number }>();
 * history.push({ n: 1 });
 * history.beginAction();
 * history.push({ n: 2 });
 * history.push({ n: 3 }); // 替换栈顶，仍一步
 * history.endAction();
 * history.undo(); // { n: 1 }
 * ```
 */
export function createHistory<T>(limit: number = HISTORY_MAX): HistoryHandle<T> {
  if (limit < 1) {
    throw new RangeError("[createHistory] limit 必须 >= 1");
  }

  /** 快照序列 */
  const snapshots: T[] = [];

  /** 当前指针（-1 表示空栈） */
  let pointer = -1;

  /** 是否处于连续动作 */
  let actionOpen = false;

  /** 本次动作是否已 push 过 */
  let actionPushed = false;

  return {
    push(state: T): void {
      if (actionOpen && actionPushed && pointer >= 0) {
        snapshots[pointer] = cloneSnapshot(state);

        return;
      }

      snapshots.splice(pointer + 1);
      snapshots.push(cloneSnapshot(state));

      while (snapshots.length > limit) {
        snapshots.shift();
      }

      pointer = snapshots.length - 1;

      if (actionOpen) {
        actionPushed = true;
      }
    },

    beginAction(): void {
      actionOpen = true;
      actionPushed = false;
    },

    endAction(): void {
      actionOpen = false;
      actionPushed = false;
    },

    undo(): T | undefined {
      if (pointer <= 0) {
        return undefined;
      }

      pointer -= 1;

      return cloneSnapshot(snapshots[pointer]!);
    },

    redo(): T | undefined {
      if (pointer < 0 || pointer >= snapshots.length - 1) {
        return undefined;
      }

      pointer += 1;

      return cloneSnapshot(snapshots[pointer]!);
    },

    get canUndo(): boolean {
      return pointer > 0;
    },

    get canRedo(): boolean {
      return pointer >= 0 && pointer < snapshots.length - 1;
    },

    get present(): T | undefined {
      if (pointer < 0) {
        return undefined;
      }

      return cloneSnapshot(snapshots[pointer]!);
    },

    get isActionActive(): boolean {
      return actionOpen;
    },
  };
}
