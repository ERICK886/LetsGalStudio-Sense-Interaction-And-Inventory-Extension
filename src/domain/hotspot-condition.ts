import type { HotspotCondition, HotspotConditionGroup } from "./types";

const OPERATORS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "truthy", "falsy"]);

export function normalizeHotspotConditionGroup(raw: unknown): HotspotConditionGroup | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const group = raw as Record<string, unknown>;
  if ((group.logic !== "all" && group.logic !== "any") || !Array.isArray(group.conditions)) return undefined;
  const conditions: HotspotCondition[] = [];
  for (const candidate of group.conditions) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const entry = candidate as Record<string, unknown>;
    if (entry.source !== "game" || typeof entry.target !== "string" ||
      !["string", "number", "bool"].includes(String(entry.valueType)) ||
      typeof entry.operator !== "string" || !OPERATORS.has(entry.operator)) continue;
    const valueType = entry.valueType as HotspotCondition["valueType"];
    const compareTo = entry.compareTo && typeof entry.compareTo === "object" &&
      !Array.isArray(entry.compareTo) ? entry.compareTo as Record<string, unknown> : undefined;
    const condition: HotspotCondition = {
      source: "game",
      target: entry.target,
      valueType,
      operator: entry.operator as HotspotCondition["operator"],
    };
    if (compareTo?.source === "game" && typeof compareTo.target === "string") {
      condition.compareTo = { source: "game", target: compareTo.target };
    } else if (typeof entry.value === valueType || (valueType === "bool" && typeof entry.value === "boolean")) {
      condition.value = entry.value as HotspotCondition["value"];
    }
    conditions.push(condition);
  }
  return conditions.length > 0 ? { logic: group.logic, conditions } : undefined;
}

function normalizeValue(value: unknown, type: HotspotCondition["valueType"]): string | number | boolean {
  if (type === "bool") return typeof value === "boolean" ? value : false;
  if (type === "number") {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  return typeof value === "string" ? value : String(value ?? "");
}

export function evaluateHotspotConditionGroup(
  group: HotspotConditionGroup | undefined,
  getVariable: (name: string) => unknown,
): boolean {
  if (!group || group.conditions.length === 0) return true;
  const matches = (condition: HotspotCondition): boolean => {
    if (!condition.target) return false;
    const actual = getVariable(condition.target);
    if (actual === undefined) return false;
    const expected = condition.compareTo
      ? condition.compareTo.target ? getVariable(condition.compareTo.target) : undefined
      : condition.value;
    if (condition.compareTo && expected === undefined) return false;
    if (!condition.compareTo && condition.value === undefined &&
      condition.operator !== "truthy" && condition.operator !== "falsy") return false;
    switch (condition.operator) {
      case "truthy": return Boolean(actual);
      case "falsy": return !Boolean(actual);
      case "eq": return Object.is(normalizeValue(actual, condition.valueType), normalizeValue(expected, condition.valueType));
      case "neq": return !Object.is(normalizeValue(actual, condition.valueType), normalizeValue(expected, condition.valueType));
      case "gt": return Number(actual) > Number(expected);
      case "gte": return Number(actual) >= Number(expected);
      case "lt": return Number(actual) < Number(expected);
      case "lte": return Number(actual) <= Number(expected);
    }
  };
  return group.logic === "any" ? group.conditions.some(matches) : group.conditions.every(matches);
}
