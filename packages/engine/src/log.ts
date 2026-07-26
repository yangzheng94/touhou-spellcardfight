import type { GameState, LogEntry } from "./types.js";

/** 将战斗日志格式化为可读文本（调试/展示用）。 */
export function formatLog(state: GameState): string {
  return state.log.map(formatEntry).join("\n");
}

export function formatEntry(e: LogEntry): string {
  const phase = e.phase ? `[${e.phase}]` : "";
  return `T${e.turn} ${phase} ${e.msg}`;
}
