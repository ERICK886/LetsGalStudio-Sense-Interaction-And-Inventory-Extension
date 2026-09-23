import type { SceneAction, SceneVariableOperand } from "./types";

type VariableValue = string | number | boolean | null;
type VariableAction = Extract<SceneAction, { type: "editVariable" }>;

function resolveOperand(
  operand: SceneVariableOperand,
  getVariable: (name: string) => VariableValue | undefined,
): VariableValue {
  if (operand.kind === "variable") {
    const name = operand.value.trim();
    if (!name) throw new Error("右值变量名为空");
    const value = getVariable(name);
    if (value === undefined) throw new Error("右值变量不存在：" + name);
    return value;
  }
  if (operand.kind === "boolean") return operand.value === "true";
  if (operand.kind === "string") return operand.value;
  if (operand.value.trim() === "") throw new Error("数字右值为空");
  const number = Number(operand.value);
  if (!Number.isFinite(number)) throw new Error("数字右值无效：" + operand.value);
  return number;
}

function numeric(value: VariableValue): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("减、乘、除及对应复合赋值要求数字变量和数字右值");
  }
  return value;
}

function calculate(
  left: VariableValue,
  operator: "+" | "-" | "*" | "/",
  right: VariableValue,
): VariableValue {
  if (operator === "+" && (typeof left === "string" || typeof right === "string")) {
    return String(left) + String(right);
  }
  const a = numeric(left);
  const b = numeric(right);
  if (operator === "/" && b === 0) throw new Error("除数不能为 0");
  const result =
    operator === "+" ? a + b :
    operator === "-" ? a - b :
    operator === "*" ? a * b : a / b;
  if (!Number.isFinite(result)) throw new Error("运算结果不是有效数字");
  return result;
}

/** 使用 Studio 游戏变量接口执行动作，失败时不写入并允许动作链继续。 */
export function applySceneVariableAction(
  action: VariableAction,
  getVariable: (name: string) => VariableValue | undefined,
  setVariable: (name: string, value: VariableValue) => void,
  warn: (message: string) => void,
): boolean {
  try {
    const target = action.target.trim();
    if (!target) throw new Error("目标变量名为空");
    let value = resolveOperand(action.operand, getVariable);
    if (action.binary) {
      value = calculate(value, action.binary.operator, resolveOperand(action.binary.operand, getVariable));
    }
    if (action.assignment !== "=") {
      const previous = getVariable(target);
      if (previous === undefined) throw new Error("目标变量不存在：" + target);
      value = calculate(previous, action.assignment.slice(0, 1) as "+" | "-" | "*" | "/", value);
    }
    setVariable(target, value);
    return true;
  } catch (error) {
    warn("editVariable: " + (error instanceof Error ? error.message : String(error)));
    return false;
  }
}
