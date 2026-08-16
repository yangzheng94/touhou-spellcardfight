/**
 * 全局错误捕获 + 一键导出诊断信息
 *
 * - 捕获 console.log / warn / error 与 window.onerror / unhandledrejection
 * - 出错时在右下角显示友好提示条，可一键导出诊断 JSON（对局状态 + 录像 + 最近日志）
 * - 大厅常驻「🩹 诊断」按钮也可随时导出
 */

export interface DiagLogEntry {
  t: number;
  level: "log" | "warn" | "error" | "exception";
  text: string;
}

const MAX_LOGS = 150;
const MAX_LOG_TEXT = 4000;
const diagLogs: DiagLogEntry[] = [];

let getSnapshot: () => unknown = () => null;

function pushLog(level: DiagLogEntry["level"], text: string): void {
  diagLogs.push({ t: Date.now(), level, text });
  if (diagLogs.length > MAX_LOGS) diagLogs.splice(0, diagLogs.length - MAX_LOGS);
}

function fmtArgs(args: unknown[]): string {
  const parts: string[] = [];
  for (const a of args) {
    let s: string;
    if (a instanceof Error) {
      s = `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ""}`;
    } else if (typeof a === "string") {
      s = a;
    } else if (a instanceof Event) {
      s = `[Event ${a.type}]`;
    } else {
      try {
        s = JSON.stringify(a) ?? String(a);
      } catch {
        s = String(a);
      }
    }
    if (s.length > MAX_LOG_TEXT) s = s.slice(0, MAX_LOG_TEXT) + `…(${s.length}字符截断)`;
    parts.push(s);
  }
  return parts.join(" ");
}

function installConsoleCapture(): void {
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...args: unknown[]) => {
    pushLog("log", fmtArgs(args));
    orig.log(...args);
  };
  console.warn = (...args: unknown[]) => {
    pushLog("warn", fmtArgs(args));
    orig.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    pushLog("error", fmtArgs(args));
    orig.error(...args);
  };
}

// ========== 诊断信息导出 ==========

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/** 序列化保护：处理 Set/Map/BigInt、循环引用、超长字符串 */
function makeReplacer() {
  const seen = new WeakSet<object>();
  return function replacer(this: unknown, _key: string, value: unknown): unknown {
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "function") return undefined;
    if (value instanceof Set) return [...value];
    if (value instanceof Map) return Object.fromEntries(value);
    if (typeof value === "string" && value.length > 8000) {
      return `${value.slice(0, 8000)}…(原长${value.length})`;
    }
    if (value !== null && typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}

export function buildDiagnosticsPayload(): unknown {
  let snapshot: unknown = null;
  try {
    snapshot = getSnapshot();
  } catch (e) {
    snapshot = { __snapshotError: e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e) };
  }
  return {
    app: "touhou-spellcard-battle",
    generatedAt: new Date().toISOString(),
    url: location.href,
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    },
    online: navigator.onLine,
    serviceWorker: "serviceWorker" in navigator ? Boolean(navigator.serviceWorker.controller) : false,
    logs: [...diagLogs],
    state: snapshot,
  };
}

function downloadJson(filename: string, obj: unknown): void {
  const json = JSON.stringify(obj, makeReplacer(), 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function exportDiagnostics(): boolean {
  try {
    downloadJson(`touhou-diag-${stamp()}.json`, buildDiagnosticsPayload());
    return true;
  } catch (e) {
    pushLog("error", `[diag] 导出失败: ${String(e)}`);
    try {
      downloadJson(`touhou-diag-${stamp()}-minimal.json`, {
        error: String(e),
        logs: [...diagLogs],
      });
    } catch {
      /* 彻底失败则忽略 */
    }
    return false;
  }
}

// ========== 错误提示条 ==========

let toastEl: HTMLElement | null = null;
let toastCount = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let lastToastAt = 0;

/** 已知的「无害」错误：不打扰玩家，只记入日志 */
const IGNORED_ERROR_PATTERNS: RegExp[] = [
  /ResizeObserver loop/i,
  /Script error\.?/,
  /NotAllowedError/i,
  /The play\(\) request was interrupted/i,
];

function shouldIgnoreError(text: string): boolean {
  return IGNORED_ERROR_PATTERNS.some((re) => re.test(text));
}

function dismissErrorToast(): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastEl?.remove();
  toastEl = null;
}

function showErrorToast(text: string): void {
  const now = Date.now();
  if (now - lastToastAt < 1500) return; // 节流，避免错误风暴刷屏
  lastToastAt = now;
  toastCount++;

  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "diag-toast";
    toastEl.innerHTML = `
      <div class="diag-toast-head">⚠️ 页面出现异常</div>
      <div class="diag-toast-msg"></div>
      <div class="diag-toast-actions">
        <button class="diag-btn diag-export">📦 导出诊断信息</button>
        <button class="diag-btn diag-dismiss">知道了</button>
      </div>`;
    document.body.appendChild(toastEl);
    toastEl.querySelector(".diag-export")!.addEventListener("click", () => {
      const ok = exportDiagnostics();
      const head = toastEl!.querySelector(".diag-toast-head");
      if (head) head.textContent = ok ? "✅ 诊断信息已导出" : "❌ 导出失败（见控制台）";
    });
    toastEl.querySelector(".diag-dismiss")!.addEventListener("click", dismissErrorToast);
  }

  const msgEl = toastEl.querySelector(".diag-toast-msg");
  if (msgEl) {
    msgEl.textContent = `${toastCount > 1 ? `（已发生 ${toastCount} 次）` : ""}${text}`;
  }
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(dismissErrorToast, 15000);
}

function installGlobalHandlers(): void {
  window.addEventListener("error", (event) => {
    const msg = event.message || "未知脚本错误";
    const src = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "";
    const text = `${msg}${src ? ` @ ${src}` : ""}`;
    pushLog("exception", text);
    // 资源加载失败（图片/音频等）只记录，不弹全局提示
    if (event.target && event.target !== window) return;
    if (shouldIgnoreError(text)) return;
    showErrorToast(text);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    let text: string;
    if (reason instanceof Error) text = `${reason.name}: ${reason.message}\n${reason.stack ?? ""}`;
    else if (typeof reason === "string") text = reason;
    else {
      try {
        text = JSON.stringify(reason) ?? String(reason);
      } catch {
        text = String(reason);
      }
    }
    if (text.length > 1200) text = text.slice(0, 1200) + "…";
    pushLog("exception", `[unhandledrejection] ${text}`);
    if (shouldIgnoreError(text)) return;
    showErrorToast(text);
  });
}

export function initDiagnostics(opts: { getSnapshot: () => unknown }): void {
  getSnapshot = opts.getSnapshot;
  installConsoleCapture();
  installGlobalHandlers();
  // 暴露到 window 便于手动调试：window.__thsbDiag.export()
  try {
    (window as unknown as Record<string, unknown>).__thsbDiag = { export: exportDiagnostics };
  } catch {
    /* 非浏览器环境忽略 */
  }
}