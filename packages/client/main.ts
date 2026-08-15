import type { CharacterInfo, GameView, LogEntry, Difficulty, ReplayData, SkillInfo } from "./protocol.js";
import { getCardIcon, installCardIconFallback } from "./icons/index.js";
import { getPortraitOrFallback, type PortraitState } from "./portraits.js";
import { playRandomBattleBGM, playMenuBGM, stopBGM, toggleMute, getMuteState, setBGMVolume, getBGMVolume } from "./bgm.js";

const app = document.getElementById("app")!;

// ========== Web Audio 音效系统 ==========
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15): void {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* ignore audio errors */ }
}

function playSound(kind: "damage" | "heal" | "spell" | "physical" | "drain" | "buff" | "clash"): void {
  switch (kind) {
    case "damage":
      playTone(200, 0.3, "sawtooth", 0.12);
      setTimeout(() => playTone(150, 0.2, "sawtooth", 0.1), 80);
      break;
    case "physical":
      playTone(180, 0.25, "square", 0.1);
      setTimeout(() => playTone(120, 0.2, "square", 0.08), 60);
      break;
    case "spell":
      playTone(600, 0.15, "sine", 0.1);
      setTimeout(() => playTone(800, 0.2, "sine", 0.08), 100);
      setTimeout(() => playTone(1000, 0.25, "sine", 0.06), 200);
      break;
    case "heal":
      playTone(440, 0.2, "sine", 0.1);
      setTimeout(() => playTone(550, 0.25, "sine", 0.08), 120);
      setTimeout(() => playTone(660, 0.3, "sine", 0.06), 240);
      break;
    case "drain":
      playTone(300, 0.3, "sawtooth", 0.1);
      setTimeout(() => playTone(200, 0.25, "sawtooth", 0.08), 100);
      break;
    case "buff":
      playTone(520, 0.15, "sine", 0.08);
      setTimeout(() => playTone(660, 0.2, "sine", 0.06), 100);
      break;
    case "clash":
      playTone(100, 0.15, "square", 0.15);
      setTimeout(() => playTone(80, 0.2, "square", 0.12), 50);
      break;
  }
}

// ========== 视觉效果 ==========
function showDamagePopup(text: string, type: "physical" | "spell" | "heal" | "drain", x: number, y: number): void {
  const el = document.createElement("div");
  el.className = `damage-popup ${type}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function createParticleBurst(x: number, y: number, color: string, count = 12): void {
  const container = document.createElement("div");
  container.className = "particle-burst";
  container.style.left = `${x}px`;
  container.style.top = `${y}px`;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.background = color;
    const angle = (Math.PI * 2 * i) / count;
    const dist = 40 + Math.random() * 60;
    p.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
    p.style.animationDelay = `${Math.random() * 0.1}s`;
    container.appendChild(p);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 900);
}

function triggerScreenShake(): void {
  document.body.classList.add("screen-shake");
  setTimeout(() => document.body.classList.remove("screen-shake"), 500);
}

function flashHpBar(target: "me" | "foe", kind: "damage" | "heal"): void {
  const selector = target === "me" ? ".hp-me" : ".hp-foe";
  const el = document.querySelector(selector);
  if (!el) return;
  const cls = kind === "damage" ? "hp-flash-damage" : "hp-flash-heal";
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 600);
}

function glowScreen(kind: "spell" | "physical"): void {
  const cls = kind === "spell" ? "spell-glow" : "physical-glow";
  document.body.classList.add(cls);
  setTimeout(() => document.body.classList.remove(cls), 800);
}

interface DecisionRange {
  min: number;
  max: number;
}

interface State {
  seat: "A" | "B" | null;
  roomId: string | null;
  roster: CharacterInfo[];
  you: "A" | "B" | null;
  yourChar: CharacterInfo | null;
  oppChar: CharacterInfo | null;
  view: GameView | null;
  chosen: { A: string | null; B: string | null };
  tempCharSelect: string | null;
  submitted: boolean;
  waiting: boolean;
  selectedSkills: Set<string>;
  selectedCard: string | null;
  showSkillPanel: boolean;
  decision: { prompt: string; options: string[]; range?: DecisionRange } | null;
  oppSelectedCard: string | null;
  oppSelectedSkills: string[];
  gameOver: boolean;
  gameOverWinner: "A" | "B" | "draw" | null;
  showReview: boolean;
  replay: ReplayData | null;
  replayMode: boolean;
  replayTurn: number;
  singleSetup: boolean;
  singleOpponent: string | null;
  singleDifficulty: Difficulty;
  codexOpen: boolean;
  codexChar: string | null;
  guideOpen: boolean;
  hurtUntilMe: number;
  hurtUntilO: number;
}

const state: State = {
  seat: null,
  roomId: null,
  roster: [],
  you: null,
  yourChar: null,
  oppChar: null,
  view: null,
  chosen: { A: null, B: null },
  tempCharSelect: null,
  submitted: false,
  waiting: false,
  selectedSkills: new Set(),
  selectedCard: null,
  showSkillPanel: false,
  decision: null,
  oppSelectedCard: null,
  oppSelectedSkills: [],
  gameOver: false,
  gameOverWinner: null,
  showReview: false,
  replay: null,
  replayMode: false,
  replayTurn: 0,
  singleSetup: false,
  singleOpponent: null,
  singleDifficulty: "easy",
  codexOpen: false,
  codexChar: null,
  guideOpen: false,
  hurtUntilMe: 0,
  hurtUntilO: 0,
};

/** 根据符卡 ID 查找符卡名称 */
function cardNameById(id: string | null): string {
  if (!id) return "无";
  const allCards = state.yourChar?.cards ?? state.oppChar?.cards ?? [];
  const card = allCards.find((c) => c.id === id);
  return card?.name ?? id;
}

const protocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}//${location.host}/ws`;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** sessionStorage 键：断线重连用的房间信息。 */
const ROOM_KEY = "thsb_rejoin_room";

function savedRoom(): { roomId: string; seat: "A" | "B" } | null {
  try {
    const raw = sessionStorage.getItem(ROOM_KEY);
    return raw ? (JSON.parse(raw) as { roomId: string; seat: "A" | "B" }) : null;
  } catch {
    return null;
  }
}

function saveRoom(roomId: string, seat: "A" | "B"): void {
  try {
    sessionStorage.setItem(ROOM_KEY, JSON.stringify({ roomId, seat }));
  } catch {
    /* ignore */
  }
}

function clearSavedRoom(): void {
  try {
    sessionStorage.removeItem(ROOM_KEY);
  } catch {
    /* ignore */
  }
}

// 安装符卡图标格式回退函数（支持 png/jpg/jpeg/webp 自动探测）
installCardIconFallback();

function connectWS(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const sock = new WebSocket(wsUrl);
  ws = sock;

  sock.onopen = () => {
    console.log("[ws] connected");
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    // 断线重连：优先恢复原房间
    const saved = savedRoom();
    if (saved && saved.roomId && saved.seat) {
      console.log("[ws] rejoin room:", saved.roomId, saved.seat);
      sock.send(JSON.stringify({ type: "rejoinRoom", roomId: saved.roomId, seat: saved.seat }));
      return;
    }
    // 分享链接自动加入：?room=XXXX
    const params = new URLSearchParams(location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      params.delete("room");
      const qs = params.toString();
      history.replaceState(null, "", qs ? `${location.pathname}?${qs}` : location.pathname);
      console.log("[ws] auto join via link:", roomParam);
      sock.send(JSON.stringify({ type: "joinRoom", roomId: roomParam.toUpperCase() }));
    }
};

  sock.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    console.log("[ws] message:", msg.type, msg);
    switch (msg.type) {
      case "roomCreated":
        state.roomId = msg.roomId;
        state.seat = "A";
        saveRoom(msg.roomId, "A");
        state.chosen = { A: null, B: null };
        state.tempCharSelect = null;
        render();
        break;
      case "joined":
      case "joinedRoom":
        state.roomId = msg.roomId;
        state.seat = msg.seat;
        saveRoom(msg.roomId, msg.seat);
        state.chosen = msg.chosen ?? { A: null, B: null };
        state.tempCharSelect = null;
        render();
        break;
      case "rejoined":
        // 断线重连成功：恢复房间与座位
        state.roomId = msg.roomId;
        state.seat = msg.seat;
        render();
        break;
      case "roster":
        state.roster = msg.characters ?? msg.roster ?? [];
        render();
        break;
      case "characterChosen":
      case "chooseCharacter":
        state.chosen[msg.seat as "A" | "B"] = msg.characterId;
        render();
        break;
      case "gameStart":
        state.you = msg.you;
        state.yourChar = msg.yourChar;
        state.oppChar = msg.oppChar;
        state.view = msg.view;
        state.submitted = false;
        state.waiting = false;
        state.selectedSkills.clear();
        state.selectedCard = null;
        state.tempCharSelect = null;
        state.oppSelectedCard = null;
        state.oppSelectedSkills = [];
        // 断线重连恢复对局时：若已有胜者，直接进入结算界面
        if (msg.view?.winner) {
          state.gameOver = true;
          state.gameOverWinner = msg.view.winner;
        }
        // 开始对战 BGM：从双方角色中随机选一人播放
        void playRandomBattleBGM(msg.yourChar.id, msg.oppChar.id);
        render();
        break;
      case "waitingForOpponent":
        state.waiting = true;
        render();
        break;
      case "foresightReveal":
        state.waiting = false;
        state.submitted = false;
        state.oppSelectedCard = msg.opponentCard;
        state.oppSelectedSkills = msg.opponentSkills ?? [];
        showBanner(`获知：敌方选择了 ${msg.opponentCard ? cardNameById(msg.opponentCard) : "无"}`);
        render();
        break;
      case "turnResolved":
        const prevHpMe = state.view?.players[state.you!]?.hp;
        const prevHpO = state.view?.players[state.you === "A" ? "B" : "A"]?.hp;
        state.view = msg.view;
        state.submitted = false;
        state.waiting = false;
        state.selectedSkills.clear();
        state.selectedCard = null;
        state.oppSelectedCard = null;
        state.oppSelectedSkills = [];
      
        // 检测伤害并触发hurt立绘
        let needHurtTimer = false;
        if (prevHpMe !== undefined && msg.view) {
          const currentHpMe = msg.view.players[state.you!].hp;
          const currentHpO = msg.view.players[state.you === "A" ? "B" : "A"].hp;
          if (currentHpMe < prevHpMe) {
            state.hurtUntilMe = Date.now() + 1500; // 1.5秒
            needHurtTimer = true;
          }
          if (currentHpO < (prevHpO ?? Infinity)) {
            state.hurtUntilO = Date.now() + 1500; // 1.5秒
            needHurtTimer = true;
          }
        }
      
        render();
      
        // 触发hurt立绘后自动恢复
        if (needHurtTimer) {
          setTimeout(() => {
            const now = Date.now();
            if (now >= state.hurtUntilMe && now >= state.hurtUntilO) {
              render();
            } else if (now >= state.hurtUntilMe || now >= state.hurtUntilO) {
              render();
            }
          }, 1600);
        }
        break;
      case "logEntry":
        appendLog(msg.entry);
        break;
      case "gameOver":
        state.view = msg.view;
        state.gameOver = true;
        state.gameOverWinner = msg.winner || null;
        state.replay = msg.replay ?? null;
        stopBGM();
        render();
        if (msg.winner === "draw") {
          showBanner("游戏结束！🤝 平局");
        } else {
          showBanner(`游戏结束！${msg.winner === state.you ? "你赢了" : "你输了"}`);
        }
        break;
      case "decisionRequest":
        state.decision = { prompt: msg.prompt, options: msg.options, range: msg.range };
        render();
        break;
      case "error":
        showBanner(msg.message);
        // 重连失败：清除已保存的房间信息，避免停留在失效状态
        if (msg.message && /房间已失效|座位已被占用/.test(msg.message)) {
          clearSavedRoom();
          stopBGM();
          resetToLobby();
          render();
        }
        break;
      case "opponentLeft":
        showBanner("对手已离开房间");
        stopBGM();
        clearSavedRoom();
        resetToLobby();
        render();
        break;
      case "opponentDisconnected":
        showBanner("对手连接已断开，正在等待对方重连…");
        break;
      case "opponentReconnected":
        showBanner("对手已重新连接！");
        break;
      default:
        break;
    }
};

  sock.onclose = () => {
    console.log("[ws] closed");
    showBanner("连接已断开，正在重新连接…");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    reconnectTimer = setTimeout(connectWS, 3000);
  };

  sock.onerror = (err) => {
    console.error("[ws] error:", err);
  };
}

connectWS();

// 移动端切后台导致 WebSocket 被系统断开时，回到前台立即重连（而非刷新页面）。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (!ws || ws.readyState !== WebSocket.OPEN)) {
    connectWS();
  }
});

const net = {
  send: (payload: Record<string, unknown>) => {
    console.log("[net.send]", payload, "ws state:", ws?.readyState);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      console.warn("[net.send] WebSocket not open, state:", ws?.readyState);
      showBanner("网络未连接，请等待重连…");
    }
  },
};

function render(): void {
  if (state.replayMode) { renderReplay(); return; }
  if (state.singleSetup) { renderSingleSetup(); void playMenuBGM(); return; }
  if (state.codexOpen) { renderCodex(); return; }
  if (state.guideOpen) { renderGuide(); return; }
  if (!state.roomId) { renderLobby(); void playMenuBGM(); return; }
  if (state.gameOver) {
    if (state.showReview) { renderReview(); return; }
    renderGameOver();
    return;
  }
  if (!state.view) { renderCharacterSelect(); void playMenuBGM(); return; }
  renderBattle();
}

function renderGameOver(): void {
  const v = state.view!;
  const winner = state.gameOverWinner!;
  const my = state.you!;
  const fo = my === "A" ? "B" : "A";
  const me = v.players[my];
  const opp = v.players[fo];
  
  const isDraw = winner === "draw";
  const myWon = winner === my;
  const myState: PortraitState = isDraw ? "normal" : myWon ? "win" : "lose";
  const oppState: PortraitState = isDraw ? "normal" : myWon ? "lose" : "win";
  
  app.innerHTML = `
    <div class="gameover-screen">
      <div class="gameover-header">
        <h1 class="gameover-title">${isDraw ? "🤝 平局" : myWon ? "🎉 胜利！" : "💔 失败"}</h1>
      </div>
      <div class="gameover-portraits">
        <div class="gameover-char ${isDraw ? "draw" : myWon ? "winner" : "loser"}">
          <div class="gameover-portrait-box">${getPortraitOrFallback(me.characterId, myState)}</div>
          <div class="gameover-name">${me.characterName}（你）</div>
          <div class="gameover-label">${isDraw ? "平局" : myWon ? "胜利" : "失败"}</div>
        </div>
        <div class="gameover-vs">VS</div>
        <div class="gameover-char ${isDraw ? "draw" : myWon ? "loser" : "winner"}">
          <div class="gameover-portrait-box">${getPortraitOrFallback(opp.characterId, oppState)}</div>
          <div class="gameover-name">${opp.characterName}（对手）</div>
          <div class="gameover-label">${isDraw ? "平局" : myWon ? "失败" : "胜利"}</div>
        </div>
      </div>
      <div class="gameover-actions">
        <button id="btn-review" class="btn-primary">📜 复盘战斗</button>
        ${state.replay ? '<button id="btn-save-replay" class="btn-primary">💾 保存录像</button>' : ""}
        <button id="btn-back-lobby" class="btn-primary">返回大厅</button>
      </div>
    </div>`;
  
  const btnReview = document.getElementById("btn-review");
  if (btnReview) {
    btnReview.onclick = () => {
      state.showReview = true;
      render();
    };
  }

  const btnSaveReplay = document.getElementById("btn-save-replay");
  if (btnSaveReplay && state.replay) {
    btnSaveReplay.onclick = () => downloadReplay(state.replay!);
  }

  const btnBack = document.getElementById("btn-back-lobby");
  if (btnBack) {
    btnBack.onclick = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leaveRoom" }));
      }
      clearSavedRoom();
      resetToLobby();
      render();
    };
  }
}

function renderReview(): void {
  const v = state.view!;
  const my = state.you!;
  const fo = my === "A" ? "B" : "A";
  const me = v.players[my];
  const opp = v.players[fo];

  // 按回合分组展示完整战斗日志
  const groups: { turn: number; entries: LogEntry[] }[] = [];
  for (const e of v.log) {
    let g = groups.find((x) => x.turn === e.turn);
    if (!g) {
      g = { turn: e.turn, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }

  const phaseLabels: Record<string, string> = {
    preTurnStart: "回合开始前",
    turnStart: "回合开始",
    priority: "优先级裁定",
    power: "威力计算",
    clash: "威力对抗",
    damage: "伤害结算",
    apply: "效果结算",
    turnEnd: "回合结束",
  };

  const turnHtml = groups
    .map((g) => `
      <div class="review-turn-group">
        <div class="review-turn-header">第 ${g.turn} 回合</div>
        ${g.entries
          .map((e) => `
            <div class="log-line ${e.type ?? ""}">
              ${e.phase ? `<span class="review-phase">${phaseLabels[e.phase] ?? e.phase}</span>` : ""}
              <span class="lt">T${e.turn}</span> ${e.msg}
            </div>`)
          .join("")}
      </div>`)
    .join("") || '<div class="log-empty">暂无战斗记录</div>';

  const winnerText =
    v.winner === "draw"
      ? "平局"
      : v.winner === null
        ? "未分胜负"
        : v.winner === my
          ? "你获胜"
          : "你失败";

  app.innerHTML = `
    <div class="review-overlay" id="review-overlay">
      <div class="review-panel">
        <div class="review-header">
          <div class="review-title">📜 战斗复盘</div>
          <button id="btn-review-close" class="review-close">✕ 关闭</button>
        </div>
        <div class="review-sub">
          ${me.characterName}（你）${me.hp}/${me.maxHp} HP&nbsp;&nbsp;vs&nbsp;&nbsp;${opp.characterName}（对手）${opp.hp}/${opp.maxHp} HP
          &nbsp;·&nbsp;${winnerText} · 共 ${groups.length} 回合
        </div>
        <div id="review-log" class="review-log">${turnHtml}</div>
      </div>
    </div>`;

  const btnClose = document.getElementById("btn-review-close");
  if (btnClose) {
    btnClose.onclick = () => {
      state.showReview = false;
      render();
    };
  }
  const overlay = document.getElementById("review-overlay");
  if (overlay) {
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        state.showReview = false;
        render();
      }
    };
  }

  // 默认滚动到底部，直接看到最后一回合的结算细节
  const logEl = document.getElementById("review-log");
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
}

// ========== 录像回放 ==========
let replayAutoTimer: ReturnType<typeof setInterval> | null = null;

function stopReplayAuto(): void {
  if (replayAutoTimer) {
    clearInterval(replayAutoTimer);
    replayAutoTimer = null;
  }
}

function replayCardName(char: CharacterInfo, cardId: string | null): string {
  if (!cardId) return "无";
  const c = char.cards.find((x) => x.id === cardId);
  return c ? c.name : cardId;
}

function replaySkillNames(char: CharacterInfo, skillIds: string[]): string {
  if (!skillIds.length) return "无";
  return skillIds.map((id) => char.skills.find((s) => s.id === id)?.name ?? id).join("、");
}

function downloadReplay(replay: ReplayData): void {
  try {
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `touhou-replay-${replay.meta.seed}-${replay.meta.createdAt}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (e) {
    console.error("[replay] download failed:", e);
    showBanner("录像下载失败");
  }
}

function loadReplayFromFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result)) as ReplayData;
      if (!data || !Array.isArray(data.turns) || !data.meta?.charA || !data.meta?.charB) {
        throw new Error("bad format");
      }
      state.replay = data;
      state.replayTurn = 0;
      render();
    } catch (e) {
      console.error("[replay] parse failed:", e);
      showBanner("录像文件解析失败，请确认文件格式");
    }
  };
  reader.onerror = () => showBanner("录像文件读取失败");
  reader.readAsText(file);
}

const replayPhaseLabels: Record<string, string> = {
  preTurnStart: "回合开始前",
  turnStart: "回合开始",
  priority: "优先级裁定",
  power: "威力计算",
  clash: "威力对抗",
  damage: "伤害结算",
  apply: "效果结算",
  turnEnd: "回合结束",
};

function renderReplay(): void {
  const replay = state.replay;
  if (!replay) {
    app.innerHTML = `
      <div class="subscreen">
        <div class="subscreen-header">
          <button id="btn-replay-back" class="btn-secondary">← 返回大厅</button>
          <h2 class="subscreen-title">🎬 回看录像</h2>
        </div>
        <div class="subscreen-body replay-empty">
          <p class="hint">当前没有可回放的录像。你可以：</p>
          <ul class="guide-tips">
            <li>打一局后，在对局结束界面点「💾 保存录像」下载 .json 文件；</li>
            <li>或选择之前保存的录像文件进行回放。</li>
          </ul>
          <label class="btn-primary file-upload-btn">
            📂 选择录像文件
            <input id="replay-file" type="file" accept="application/json,.json" hidden />
          </label>
        </div>
      </div>`;
    document.getElementById("btn-replay-back")!.onclick = () => {
      state.replayMode = false;
      render();
    };
    const fileInput = document.getElementById("replay-file") as HTMLInputElement;
    if (fileInput) {
      fileInput.onchange = () => {
        const f = fileInput.files?.[0];
        if (f) loadReplayFromFile(f);
      };
    }
    return;
  }

  const total = replay.turns.length;
  const idx = Math.min(Math.max(state.replayTurn, 0), Math.max(total - 1, 0));
  const turn = replay.turns[idx] ?? null;
  const charA = replay.meta.charA;
  const charB = replay.meta.charB;
  const winnerText =
    replay.winner === "draw"
      ? "🤝 平局"
      : replay.winner === "A"
        ? `${charA.name} 获胜`
        : replay.winner === "B"
          ? `${charB.name} 获胜`
          : "未分胜负";
  const diffText =
    replay.meta.difficulty === "hard"
      ? "困难人机"
      : replay.meta.difficulty === "medium"
        ? "中等人机"
        : replay.meta.difficulty === "easy"
          ? "简单人机"
          : "联机对战";

  const turnLogHtml = turn
    ? turn.log
        .map(
          (e) => `
            <div class="log-line ${e.type ?? ""}">
              ${e.phase ? `<span class="review-phase">${replayPhaseLabels[e.phase] ?? e.phase}</span>` : ""}
              <span class="lt">T${e.turn}</span> ${e.msg}
            </div>`,
        )
        .join("")
    : "";

  const movesHtml = turn
    ? `
      <div class="replay-moves">
        <div class="replay-move replay-move-a">
          <div class="replay-move-char">${charA.name}（A）</div>
          <div class="replay-move-row">🃏 <b>${replayCardName(charA, turn.moves.A.cardId)}</b></div>
          <div class="replay-move-row">✦ ${replaySkillNames(charA, turn.moves.A.skillIds)}</div>
          <div class="replay-move-hp">HP ${turn.hpAfter.A}</div>
        </div>
        <div class="replay-vs">VS</div>
        <div class="replay-move replay-move-b">
          <div class="replay-move-char">${charB.name}（B）</div>
          <div class="replay-move-row">🃏 <b>${replayCardName(charB, turn.moves.B.cardId)}</b></div>
          <div class="replay-move-row">✦ ${replaySkillNames(charB, turn.moves.B.skillIds)}</div>
          <div class="replay-move-hp">HP ${turn.hpAfter.B}</div>
        </div>
      </div>`
    : "";

  app.innerHTML = `
    <div class="subscreen">
      <div class="subscreen-header">
        <button id="btn-replay-back" class="btn-secondary">← 返回大厅</button>
        <h2 class="subscreen-title">🎬 录像回放</h2>
      </div>
      <div class="subscreen-body replay-body">
        <div class="replay-meta">
          <span class="replay-meta-item">${charA.name} vs ${charB.name}</span>
          <span class="replay-meta-item">${diffText}</span>
          <span class="replay-meta-item">${winnerText}</span>
          <span class="replay-meta-item">共 ${total} 回合</span>
          <span class="replay-meta-item">种子 ${replay.meta.seed}</span>
        </div>
        <div class="replay-controls">
          <button id="rp-prev" class="btn-secondary" ${idx === 0 ? "disabled" : ""}>⏮ 上一回合</button>
          <button id="rp-auto" class="btn-secondary">${replayAutoTimer ? "⏸ 暂停" : "▶ 自动播放"}</button>
          <button id="rp-next" class="btn-secondary" ${idx >= total - 1 ? "disabled" : ""}>⏭ 下一回合</button>
          <button id="rp-last" class="btn-secondary" ${idx >= total - 1 ? "disabled" : ""}>⏭⏭ 末回合</button>
        </div>
        <div class="replay-slider-row">
          <span class="replay-turn-label">第 ${idx + 1} / ${total} 回合</span>
          <input id="rp-slider" type="range" min="0" max="${Math.max(total - 1, 0)}" value="${idx}" />
        </div>
        ${movesHtml}
        <div class="replay-log-wrap">
          <div class="replay-log-title">本回合结算日志</div>
          <div class="replay-log">${turnLogHtml || '<div class="log-empty">暂无记录</div>'}</div>
        </div>
        <div class="replay-actions">
          <button id="rp-save" class="btn-primary">💾 保存此录像</button>
        </div>
      </div>
    </div>`;

  document.getElementById("btn-replay-back")!.onclick = () => {
    stopReplayAuto();
    state.replayMode = false;
    render();
  };
  const btnPrev = document.getElementById("rp-prev");
  if (btnPrev) btnPrev.onclick = () => { state.replayTurn = Math.max(0, idx - 1); render(); };
  const btnNext = document.getElementById("rp-next");
  if (btnNext) btnNext.onclick = () => { state.replayTurn = Math.min(total - 1, idx + 1); render(); };
  const btnLast = document.getElementById("rp-last");
  if (btnLast) btnLast.onclick = () => { state.replayTurn = total - 1; render(); };
  const btnAuto = document.getElementById("rp-auto");
  if (btnAuto) {
    btnAuto.onclick = () => {
      if (replayAutoTimer) {
        stopReplayAuto();
        render();
      } else {
        replayAutoTimer = setInterval(() => {
          if (state.replayTurn >= total - 1) {
            stopReplayAuto();
            render();
            return;
          }
          state.replayTurn++;
          render();
        }, 1400);
        render();
      }
    };
  }
  const slider = document.getElementById("rp-slider") as HTMLInputElement;
  if (slider) {
    slider.oninput = () => {
      state.replayTurn = Number(slider.value);
      render();
    };
  }
  const btnSave = document.getElementById("rp-save");
  if (btnSave) btnSave.onclick = () => downloadReplay(replay);
}

// ========== 单人模式设置 ==========
function renderSingleSetup(): void {
  const difficulties: { id: Difficulty; label: string; desc: string; disabled?: boolean }[] = [
    { id: "easy", label: "简单", desc: "草根妖怪也能取胜的程度" },
    { id: "medium", label: "中等", desc: "稍微有些棘手的程度" },
    { id: "hard", label: "困难", desc: "需要全力以赴的程度" },
  ];
  app.innerHTML = `
    <div class="subscreen">
      <div class="subscreen-header">
        <button id="btn-sub-back" class="btn-secondary">← 返回大厅</button>
        <h2 class="subscreen-title">⚔ 单人模式</h2>
      </div>
      <div class="subscreen-body">
        <div class="setup-section">
          <div class="setup-label">选择对手</div>
          <div class="char-scroll">
            <div class="char-card ${state.singleOpponent === null ? "sel" : ""}" data-id="">
              <div class="char-portrait"><div class="portrait-container"><div class="char-portrait-placeholder">随机<br><small>随机</small></div></div></div>
              <div class="char-name">随机对手</div>
              <div class="char-hp">HP ?</div>
              <div class="char-skills">充满浪漫的选择</div>
            </div>
            ${state.roster
              .map(
                (c) => `
                  <div class="char-card ${state.singleOpponent === c.id ? "sel" : ""}" data-id="${c.id}">
                    <div class="char-portrait">${getPortraitOrFallback(c.id, "normal")}</div>
                    <div class="char-name">${c.name}</div>
                    <div class="char-hp">HP ${c.hp}</div>
                    <div class="char-skills">${c.skills.map((s) => s.name).join(" / ")}</div>
                  </div>`,
              )
              .join("")}
          </div>
        </div>
        <div class="setup-section">
          <div class="setup-label">选择难度</div>
          <div class="difficulty-row">
            ${difficulties
              .map(
                (d) => `
                  <button class="difficulty-btn ${state.singleDifficulty === d.id ? "sel" : ""} ${d.disabled ? "disabled" : ""}" data-difficulty="${d.id}">
                    <span class="diff-name">${d.label}</span>
                    <span class="diff-desc">${d.desc}</span>
                  </button>`,
              )
              .join("")}
          </div>
        </div>
        <button id="btn-single-start" class="btn-primary lobby-single" style="display:block;margin:26px auto;font-size:1.1rem;padding:14px 44px;">
          🎮 开始对战
        </button>
      </div>
    </div>`;

  app.querySelectorAll<HTMLElement>(".char-card").forEach((el) => {
    el.onclick = () => {
      state.singleOpponent = el.dataset.id === "" ? null : el.dataset.id!;
      render();
    };
  });
  app.querySelectorAll<HTMLElement>(".difficulty-btn").forEach((el) => {
    el.onclick = () => {
      const d = el.dataset.difficulty as Difficulty;
      state.singleDifficulty = d;
      render();
    };
  });
  document.getElementById("btn-sub-back")!.onclick = () => {
    state.singleSetup = false;
    render();
  };
  document.getElementById("btn-single-start")!.onclick = () => {
    net.send({
      type: "createSinglePlayerRoom",
      opponentId: state.singleOpponent ?? undefined,
      difficulty: state.singleDifficulty,
    });
    state.singleSetup = false;
    render();
  };
}

// ========== 角色图鉴 ==========
function renderCodex(): void {
  const detail = state.roster.find((c) => c.id === state.codexChar);
  if (detail) {
    const skillRows = detail.skills
      .map(
        (s) => `
          <div class="codex-skill">
            <div class="codex-skill-name">
              ${s.name}
              ${s.passive ? '<span class="passive">被动</span>' : ""}
              ${s.declaredAtTurnStart ? '<span class="skill-kind-tag">主动宣告</span>' : ""}
            </div>
            <div class="codex-skill-meta">冷却 ${s.cooldown} 回合</div>
            <div class="codex-skill-text">${s.text}</div>
          </div>`,
      )
      .join("");
    const cardRows = detail.cards
      .map(
        (c) => `
          <div class="codex-card">
            <div class="codex-card-icon">${getCardIcon(c.id)}</div>
            <div class="codex-card-body">
              <div class="codex-card-name">${c.name} <span class="codex-card-power">威力 ${c.power}</span></div>
              <div class="codex-card-text">${c.text}</div>
              ${c.tags.length ? `<div class="codex-card-tags">${c.tags.map((t) => `<span class="tag-chip">${t}</span>`).join("")}</div>` : ""}
            </div>
          </div>`,
      )
      .join("");
    app.innerHTML = `
      <div class="subscreen">
        <div class="subscreen-header">
          <button id="btn-codex-back" class="btn-secondary">← 返回图鉴</button>
          <h2 class="subscreen-title">${detail.name}</h2>
        </div>
        <div class="subscreen-body">
          <div class="codex-hero">
            <div class="codex-hero-portrait"><div class="char-portrait">${getPortraitOrFallback(detail.id, "normal")}</div></div>
            <div class="codex-hero-info">
              <div class="codex-hero-hp">HP ${detail.hp}</div>
            </div>
          </div>
          <div class="codex-section">
            <h3>技能（${detail.skills.length}）</h3>
            ${skillRows}
          </div>
          <div class="codex-section">
            <h3>符卡（${detail.cards.length}）</h3>
            ${cardRows}
          </div>
        </div>
      </div>`;
    document.getElementById("btn-codex-back")!.onclick = () => {
      state.codexChar = null;
      render();
    };
    return;
  }

  app.innerHTML = `
    <div class="subscreen">
      <div class="subscreen-header">
        <button id="btn-codex-back" class="btn-secondary">← 返回大厅</button>
        <h2 class="subscreen-title">📖 角色图鉴</h2>
      </div>
      <div class="subscreen-body">
        <p class="hint">点击角色卡片，查看其技能与符卡详情</p>
        <div class="char-grid">
          ${state.roster
            .map(
              (c) => `
                <div class="char-card" data-id="${c.id}">
                  <div class="char-portrait">${getPortraitOrFallback(c.id, "normal")}</div>
                  <div class="char-name">${c.name}</div>
                  <div class="char-hp">HP ${c.hp}</div>
                  <div class="char-skills">${c.skills.map((s) => s.name).join(" / ")}</div>
                </div>`,
            )
            .join("")}
        </div>
      </div>
    </div>`;
  document.getElementById("btn-codex-back")!.onclick = () => {
    state.codexOpen = false;
    state.codexChar = null;
    render();
  };
  app.querySelectorAll<HTMLElement>(".char-card").forEach((el) => {
    el.onclick = () => {
      state.codexChar = el.dataset.id!;
      render();
    };
  });
}

// ========== 新手引导 ==========
function renderGuide(): void {
  const phases = [
    { t: "回合开始前", d: "「预知」「先制」等回合开始前触发的效果与提示。" },
    { t: "回合开始", d: "双方揭示出牌与宣告技能（打出符卡 / 宣告技能），当前生效 BUFF 逐条展示。" },
    { t: "优先级裁定", d: "决定本回合符卡处理顺序：无效系（发动无效 > 效果无效）> 反转系 > 其余；同级按基础威力高者先攻，威力相同随机。" },
    { t: "威力计算", d: "双方符卡威力按「+X（加减）→ 翻倍（乘除）→ 变为X（赋值）」顺序计算，小数向下取整。" },
    { t: "威力对抗", d: "威力高 − 威力低 = 对低威力方的物理伤害。" },
    { t: "伤害判定", d: "免疫 > 至少/至多 > 反弹；护盾吸收先抵物理再抵法术。物理 / 法术伤害分开结算。" },
    { t: "效果结算", d: "按优先级依次结算双方符卡 / 技能 / BUFF 效果：生命流失、回复、无效、互换、复制等。" },
    { t: "回合结束", d: "结算跨回合状态；10 回合未分胜负时按剩余 HP 判定（HP 高者胜，相同平局）。" },
  ];
  const tips = [
    "「无效系」与「反转系」只作用于符卡效果；技能与 BUFF 不受无效系影响。",
    "生命流失与吸收不属于伤害：流失可绕过免疫 / 反弹，但可被固定 HP 阻挡。",
    "延迟结算的伤害在结算回合按当回合的免疫 / 护盾 / 减伤判定。",
    "「复制最终威力」只复制威力；「复制对方符卡」则效果与威力一起复制。",
    "跨回合累计的计数（如「受到 2 次伤害」）按实际扣血计，被免疫 / 护盾吸收的不算。",
  ];
  app.innerHTML = `
    <div class="subscreen">
      <div class="subscreen-header">
        <button id="btn-guide-back" class="btn-secondary">← 返回大厅</button>
        <h2 class="subscreen-title">🎓 新手引导</h2>
      </div>
      <div class="subscreen-body guide-body">
        <h3>一局流程</h3>
        <ol class="guide-phases">
          ${phases.map((p, i) => `<li><span class="guide-phase-t">${i + 1}. ${p.t}</span><span class="guide-phase-d">${p.d}</span></li>`).join("")}
        </ol>
        <h3>关键要点</h3>
        <ul class="guide-tips">
          ${tips.map((t) => `<li>${t}</li>`).join("")}
        </ul>
      </div>
    </div>`;
  document.getElementById("btn-guide-back")!.onclick = () => {
    state.guideOpen = false;
    render();
  };
}

// ========== 通用小工具 ==========
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function copyText(text: string, okMsg: string): void {
  const clip = navigator.clipboard;
  if (!clip) {
    showBanner("当前环境不支持复制，请手动复制");
    return;
  }
  clip
    .writeText(text)
    .then(() => showBanner(okMsg))
    .catch(() => showBanner("复制失败，请手动复制"));
}

// ========== BUFF 图标与悬浮说明 ==========
const BUFF_ICONS: Record<string, string> = {
  "damage-taken": "🛡️",
  power: "⚡",
  "delayed-damage": "⏳",
  negate: "🚫",
  "immune-reflect-absorb": "💠",
  "hp-lock": "🔒",
  heal: "💚",
  other: "✨",
};

function buffHtml(b: GameView["players"]["A"]["buffs"][number]): string {
  const icon = BUFF_ICONS[b.category ?? "other"] ?? "✨";
  let remain = "永续";
  if (typeof b.remainingTurns === "number" && b.remainingTurns > 0) remain = `${b.remainingTurns} 回合`;
  else if (typeof b.remainingTriggers === "number" && b.remainingTriggers > 0) remain = `${b.remainingTriggers} 次`;
  const tip = `${b.name}\n${b.text ? `效果：${b.text}` : ""}\n剩余：${remain}`;
  return `<span class="buff-tag cat-${b.category ?? "other"}" data-tooltip="${escapeHtml(tip)}" title="${escapeHtml(tip)}">${icon} ${b.name}<small class="buff-remain">${remain}</small></span>`;
}

// ========== 宣言演出 ==========
/** 从宣言日志中推断角色 ID（用于演出立绘）。 */
function declarationCharId(entry: LogEntry): string | undefined {
  const m = entry.msg.match(/^([^（(]+)（([AB])）/);
  if (m) {
    const seat = m[2] as "A" | "B";
    return seat === state.you ? state.yourChar?.id : state.oppChar?.id;
  }
  return undefined;
}

function maybePlayDeclaration(entry: LogEntry): void {
  const cardMatch = entry.msg.match(/打出符卡：([^｜]+)/);
  if (cardMatch && cardMatch[1].trim() !== "无") {
    playDeclaration(cardMatch[1].trim(), "spell", declarationCharId(entry));
    return;
  }
  const skillMatch = entry.msg.match(/宣告技能：([^｜]+)/);
  if (skillMatch && skillMatch[1].trim() !== "无") {
    playDeclaration(skillMatch[1].trim(), "skill", declarationCharId(entry));
  }
}

function playDeclaration(name: string, kind: "spell" | "skill", charId?: string): void {
  const existing = document.querySelector(".declaration-cutscene");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = `declaration-cutscene ${kind}`;
  const portraitHtml = charId
    ? `<div class="decl-portrait">${getPortraitOrFallback(charId, "normal")}</div>`
    : "";
  el.innerHTML = `
    <div class="decl-backdrop"></div>
    <div class="decl-sweep"></div>
    <div class="decl-content">
      ${portraitHtml}
      <div class="decl-kicker">${kind === "spell" ? "SPELL CARD" : "SKILL"}</div>
      <div class="decl-name">${name}</div>
    </div>`;
  document.body.appendChild(el);
  playSound(kind === "spell" ? "spell" : "buff");
  setTimeout(() => el.remove(), 1600);
}

// ========== 差异化弹幕特效 ==========
const DANMAKU_THEME: Record<string, string> = {
  reimu: "#ff6b6b",
  youmu: "#7bd88f",
  "seija-illusion": "#c9a7ff",
  aya: "#ffd93d",
  flandre: "#ff5f5f",
  sakuya: "#9ecbff",
  cirno: "#7fd4ff",
  reisen: "#ff9ed2",
  yuuka: "#a0e05f",
  koishi: "#9fe8d8",
  satori: "#d19bff",
  patchouli: "#8b7bff",
  remilia: "#ff7a9e",
  mystia: "#ffb36b",
  hata: "#ffe37a",
  suika: "#ff9d5c",
  sagume: "#b8b8f0",
  nue: "#8fa8ff",
  patches: "#ffab5c",
  tokoyo: "#e8c8ff",
};

function getDanmakuColor(charId: string | undefined): string {
  return (charId && DANMAKU_THEME[charId]) || "#f4c95d";
}

function spawnDanmaku(target: "me" | "foe", kind: "physical" | "spell" | "drain" | "heal"): void {
  const meBox = document.querySelector<HTMLElement>(".portrait-me .portrait-large-box");
  const foeBox = document.querySelector<HTMLElement>(".portrait-foe .portrait-large-box");
  if (!meBox || !foeBox) return;
  const src = target === "me" ? foeBox : meBox;
  const dst = target === "me" ? meBox : foeBox;
  const srcRect = src.getBoundingClientRect();
  const dstRect = dst.getBoundingClientRect();
  const sx = srcRect.left + srcRect.width / 2;
  const sy = srcRect.top + srcRect.height / 2;
  const dx = dstRect.left + dstRect.width / 2 - sx;
  const dy = dstRect.top + dstRect.height / 2 - sy;
  const color = getDanmakuColor(target === "me" ? state.oppChar?.id : state.yourChar?.id);

  // 多弹幕散开：数量与散布随伤害类型变化，物理呈横向刀光、法术旋转扩散、流失滴落、治疗上升
  const count = kind === "spell" ? 10 : kind === "physical" ? 8 : kind === "drain" ? 6 : 5;
  for (let i = 0; i < count; i++) {
    const layer = document.createElement("div");
    layer.className = `danmaku-layer ${kind}`;
    layer.style.left = `${sx + (Math.random() - 0.5) * 36}px`;
    layer.style.top = `${sy + (Math.random() - 0.5) * 36}px`;
    layer.style.setProperty("--tx", `${dx + (Math.random() - 0.5) * 90}px`);
    layer.style.setProperty("--ty", `${dy + (Math.random() - 0.5) * 90}px`);
    layer.style.setProperty("--danmaku-color", color);
    layer.style.setProperty("--scale", (0.6 + Math.random() * 0.9).toFixed(2));
    layer.style.setProperty("--delay", `${(Math.random() * 0.12).toFixed(2)}s`);
    layer.innerHTML = '<div class="danmaku-bullet"></div>';
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1400);
  }
}

function spawnShieldFx(target: "me" | "foe", text: string): void {
  const box = document.querySelector<HTMLElement>(
    target === "me" ? ".portrait-me .portrait-large-box" : ".portrait-foe .portrait-large-box",
  );
  if (!box) return;
  const rect = box.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "shield-fx";
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 2}px`;
  el.innerHTML = `<span class="shield-ring"></span><span class="shield-text">${text}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function resetToLobby(): void {
  stopBGM();
  state.roomId = null;
  state.seat = null;
  state.view = null;
  state.gameOver = false;
  state.gameOverWinner = null;
  state.showReview = false;
  state.chosen = { A: null, B: null };
  state.tempCharSelect = null;
  state.selectedCard = null;
  state.selectedSkills.clear();
  state.submitted = false;
  state.waiting = false;
  state.decision = null;
  state.oppSelectedCard = null;
  state.oppSelectedSkills = [];
  state.replayMode = false;
  state.replayTurn = 0;
  stopReplayAuto();
  state.singleSetup = false;
  state.singleOpponent = null;
  state.singleDifficulty = "easy";
  state.codexOpen = false;
  state.codexChar = null;
  state.guideOpen = false;
}

function renderLobby(): void {
  app.innerHTML = `
    <div class="lobby-bg">
      <div class="taiji-container">
        <div class="taiji">
          <div class="taiji-dot-black"></div>
          <div class="taiji-dot-white"></div>
        </div>
      </div>
      <div class="sakura-container">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(i => `<div class="petal petal-${i}"></div>`).join("")}
      </div>
    </div>
    <div class="lobby-content">
      <h1 class="lobby-title">东方符卡战</h1>
      <div class="lobby-panel">
        <button id="btn-single" class="btn-primary lobby-single">⚔ 单人模式</button>
        <button id="btn-create" class="btn-primary">创建房间</button>
        <div class="join-row">
          <input id="room-input" class="input-field" maxlength="4" placeholder="房间码" />
          <button id="btn-join" class="btn-secondary">加入</button>
        </div>
        <div class="lobby-tools">
          <button id="btn-codex" class="btn-tool">📖 角色图鉴</button>
          <button id="btn-guide" class="btn-tool">🎓 新手引导</button>
          <button id="btn-replay" class="btn-tool">🎬 回看录像</button>
        </div>
        <div class="lobby-settings">
          <span class="settings-label">🎵 BGM 音量</span>
          <input id="bgm-volume" class="volume-slider" type="range" min="0" max="100" value="${Math.round(getBGMVolume() * 100)}" />
          <button id="btn-bgm" class="btn-tool ${getMuteState() ? "muted" : ""}">${getMuteState() ? "🔇 静音" : "🔊 声音"}</button>
        </div>
      </div>
      <p class="hint">创建房间后，把 4 位房间码告诉朋友即可对战；也可用「复制邀请链接」直接拉朋友入场。</p>
    </div>`;
  document.getElementById("btn-create")!.onclick = () => net.send({ type: "createRoom" });
  document.getElementById("btn-single")!.onclick = () => {
    state.singleSetup = true;
    state.singleOpponent = null;
    state.singleDifficulty = "easy";
    render();
  };
  document.getElementById("btn-codex")!.onclick = () => {
    state.codexOpen = true;
    state.codexChar = null;
    render();
  };
  document.getElementById("btn-guide")!.onclick = () => {
    state.guideOpen = true;
    render();
  };
  document.getElementById("btn-replay")!.onclick = () => {
    state.replayMode = true;
    state.replayTurn = 0;
    render();
  };
  document.getElementById("btn-join")!.onclick = () => {
    const v = (document.getElementById("room-input") as HTMLInputElement).value.trim().toUpperCase();
    if (v) net.send({ type: "joinRoom", roomId: v });
  };
  const volSlider = document.getElementById("bgm-volume");
  if (volSlider) {
    volSlider.oninput = () => {
      setBGMVolume(Number((volSlider as HTMLInputElement).value) / 100);
    };
  }
  const btnBgmLobby = document.getElementById("btn-bgm");
  if (btnBgmLobby) {
    btnBgmLobby.onclick = () => {
      toggleMute();
      render();
    };
  }
}

function renderCharacterSelect(): void {
  const myChoice = state.seat ? state.chosen[state.seat] : null;
  const oppSeat = state.seat === "A" ? "B" : "A";
  const oppChoice = state.chosen[oppSeat];
  app.innerHTML = `
    <div class="select-screen">
      <div class="select-topbar">
        <span>房间码 <b>${state.roomId}</b></span>
        <button id="btn-copy-code" class="btn-tool">📋 复制房间码</button>
        <button id="btn-copy-link" class="btn-tool">🔗 复制邀请链接</button>
        <span>你是 <b>${state.seat}</b></span>
        <span>对手：${oppChoice ? "已选择" : "选择中…"}</span>
      </div>
      <h2 class="select-title">选择角色</h2>
      <div class="char-grid">
        ${state.roster
          .map(
            (c) => `
          <div class="char-card ${state.tempCharSelect === c.id ? "sel" : ""}" data-id="${c.id}">
            <div class="char-portrait">${getPortraitOrFallback(c.id, "normal")}</div>
            <div class="char-name">${c.name}</div>
            <div class="char-hp">HP ${c.hp}</div>
            <div class="char-skills">${c.skills.map((s) => s.name).join(" / ")}</div>
          </div>`,
          )
          .join("")}
      </div>
      ${state.tempCharSelect ? `<p class="hint">已选择 <b>${nameOf(state.tempCharSelect)}</b>，点击确认锁定选择</p>` : ""}
      ${state.tempCharSelect && !myChoice ? `<button id="btn-confirm-char" class="btn-primary" style="display:block;margin:20px auto;">确认选择「${nameOf(state.tempCharSelect)}」</button>` : ""}
      ${myChoice ? `<p class="hint">已锁定 <b>${nameOf(myChoice)}</b>，等待对手…</p>` : ""}
    </div>`;
  app.querySelectorAll(".char-card").forEach((el) => {
    (el as HTMLElement).onclick = () => {
      if (myChoice) return;
      const id = (el as HTMLElement).dataset.id!;
      state.tempCharSelect = id;
      render();
    };
  });
  const btnConfirm = document.getElementById("btn-confirm-char");
  if (btnConfirm) {
    btnConfirm.onclick = () => {
      if (state.tempCharSelect) {
        net.send({ type: "selectCharacter", characterId: state.tempCharSelect });
      }
    };
  }
  const btnCopyCode = document.getElementById("btn-copy-code");
  if (btnCopyCode) {
    btnCopyCode.onclick = () => {
      if (state.roomId) copyText(state.roomId, "房间码已复制！");
    };
  }
  const btnCopyLink = document.getElementById("btn-copy-link");
  if (btnCopyLink) {
    btnCopyLink.onclick = () => {
      if (state.roomId) {
        copyText(`${location.origin}${location.pathname}?room=${state.roomId}`, "邀请链接已复制！");
      }
    };
  }
}

function renderBattle(): void {
  const v = state.view!;
  const my = state.you!;
  const fo = my === "A" ? "B" : "A";
  const me = v.players[my];
  const opp = v.players[fo];
  const myHand = v.hands[my] ?? [];
  const myUsed = v.used[my] ?? [];

  // 保存现有日志内容
  const existingLog = document.getElementById("log");
  const logHtml = existingLog ? existingLog.innerHTML : "";

  // 计算立绘状态
  const myHpPct = Math.round((me.hp / me.maxHp) * 100);
  const oppHpPct = Math.round((opp.hp / opp.maxHp) * 100);
  const now = Date.now();
  
  // 根据伤害日志触发hurt立绘
  if (logHtml !== logHtml) {
    // 检测到新的伤害日志
  }
  
  let myPortraitState: PortraitState = "battle";
  let oppPortraitState: PortraitState = "battle";
  
  // 低血量立绘
  if (myHpPct <= 50) myPortraitState = "lowhp";
  if (oppHpPct <= 50) oppPortraitState = "lowhp";
  
  // 受伤立绘（在指定时间内显示）
  if (now < state.hurtUntilMe) myPortraitState = "hurt";
  if (now < state.hurtUntilO) oppPortraitState = "hurt";
  
  const myPortraitHtml = getPortraitOrFallback(me.characterId, myPortraitState);
  const oppPortraitHtml = getPortraitOrFallback(opp.characterId, oppPortraitState);

  const skillsHtml = (me.skills ?? [])
    .map((s) => {
      const active = state.selectedSkills.has(s.id);
      const cd = s.cooldownLeft ?? 0;
      const disabled = s.passive || !s.ready || cd > 0 || state.submitted || state.waiting;
      const badge = s.passive
        ? '<span class="skill-badge passive">被动</span>'
        : cd > 0
          ? `<span class="skill-badge cd">冷却 ${cd}T</span>`
          : s.ready
            ? '<span class="skill-badge ready">可用</span>'
            : "";
      return `
        <label class="skill-toggle ${active ? "on" : ""} ${disabled ? "disabled" : ""}" data-id="${s.id}" title="${escapeHtml(s.text)}">
          <input type="checkbox" data-skill="${s.id}" ${active ? "checked" : ""} ${disabled ? "disabled" : ""} />
          ${s.name}${badge}
        </label>`;
    })
    .join("");

  const handHtml = myHand
    .map((c) => {
      const selected = state.selectedCard === c.id;
      return `
        <div class="hand-card ${selected ? "selected" : ""}" data-card="${c.id}">
          <div class="card-portrait">${getCardIcon(c.id)}</div>
          <div class="hc-top"><span class="hc-name">${c.name}</span><span class="hc-power">威力 ${c.power}</span></div>
          <div class="hc-text">${c.text}</div>
        </div>`;
    })
    .join("") || '<div class="hand-empty">已无可用符卡</div>';

  const usedHtml = myUsed
    .map((c) => `
      <div class="hand-card used" data-card="${c.id}">
        <div class="card-portrait">${getCardIcon(c.id)}</div>
        <div class="hc-top"><span class="hc-name">${c.name}</span><span class="hc-power">威力 ${c.power}</span></div>
        <div class="hc-text">${c.text}</div>
      </div>`)
    .join("");

  const myBuffs = me.buffs.map(buffHtml).join("") || '<span class="buff-tag empty">无</span>';
  const oppBuffs = opp.buffs.map(buffHtml).join("") || '<span class="buff-tag empty">无</span>';

  const myRes = Object.entries(me.resources)
    .filter(([k, v]) => v !== 0 && !k.startsWith("_"))
    .map(([k, v]) => `${k}=${v}`)
    .join(", ") || "无";
  const oppRes = Object.entries(opp.resources)
    .filter(([k, v]) => v !== 0 && !k.startsWith("_"))
    .map(([k, v]) => `${k}=${v}`)
    .join(", ") || "无";

  app.innerHTML = `
    <div class="battle-screen">
      <div class="battle-portrait-side portrait-left">
        <div class="portrait-large portrait-me">
          <div class="portrait-large-box ${myPortraitState === "hurt" ? "hurt" : ""} ${myPortraitState === "lowhp" ? "lowhp" : ""}">${myPortraitHtml}</div>
          <div class="portrait-name-tag">${me.characterName}</div>
        </div>
      </div>

      <div class="battle-center">
        <div class="hp-bars">
          <div class="hp-bar hp-me" id="hp-bar-me">
            <div class="hp-label"><span class="hp-name">${me.characterName}（你）</span><span class="hp-num">${me.hp} / ${me.maxHp}</span></div>
            <div class="hp-track"><div class="hp-fill" style="width:${myHpPct}%"></div></div>
          </div>
          <div class="hp-bar hp-foe" id="hp-bar-foe">
            <div class="hp-label"><span class="hp-name">${opp.characterName}（对手）</span><span class="hp-num">${opp.hp} / ${opp.maxHp}</span></div>
            <div class="hp-track"><div class="hp-fill" style="width:${oppHpPct}%"></div></div>
          </div>
        </div>
        
        <div class="log-section">
          <div class="log-header">
            <div class="log-title">
              <span class="log-icon">⚔</span>
              <span>战斗结算</span>
              <span class="log-turn-badge">第 ${v.turn} 回合</span>
            </div>
            <div class="log-status">
              ${state.submitted ? '<span class="status-tag waiting">已提交</span>' : state.waiting ? '<span class="status-tag waiting">等待中</span>' : state.oppSelectedCard ? '<span class="status-tag reveal">敌方已选</span>' : '<span class="status-tag ready">选择中</span>'}
            </div>
          </div>
          <div id="log" class="log">${logHtml || '<div class="log-empty">战斗即将开始...</div>'}</div>
          <div class="log-footer">
            <span class="status-line">
              ${state.submitted ? "已提交，等待对手…" : state.waiting ? "等待对手…" : state.oppSelectedCard ? `获知：敌方已选「${cardNameById(state.oppSelectedCard)}」，请做出你的选择` : myHand.length === 0 ? "已无可用符卡，请结束回合" : "请选择一张符卡并确认"}
            </span>
          </div>
        </div>

        <div class="hand-section">
          <div class="section-header">
            <span class="section-title">你的符卡</span>
          </div>
          <div class="hand">${handHtml}</div>
          ${usedHtml ? `<div class="used-section"><div class="section-header"><span class="section-title">已使用</span></div><div class="hand">${usedHtml}</div></div>` : ""}
        </div>

        <div class="action-bar">
          ${!state.submitted && !state.waiting && (state.selectedCard || myHand.length === 0)
            ? `<button id="btn-confirm" class="btn-primary confirm-btn">${state.selectedCard ? "确认打出" : "确认结束回合"}</button>`
            : ""}
          ${state.selectedCard && !state.submitted && !state.waiting ? `<button id="btn-cancel" class="btn-secondary cancel-btn">撤回重选</button>` : ""}
        </div>
      </div>

      <div class="battle-portrait-side portrait-right">
        <div class="portrait-large portrait-foe">
          <div class="portrait-large-box ${oppPortraitState === "hurt" ? "hurt" : ""} ${oppPortraitState === "lowhp" ? "lowhp" : ""}">${oppPortraitHtml}</div>
          <div class="portrait-name-tag">${opp.characterName}</div>
        </div>
      </div>

      <div class="battle-sidebar">
        <div class="side-panel status-panel">
          <h3>回合状态</h3>
          <div class="turn-indicator">第 ${v.turn} 回合</div>
          <div class="status-buffs">
            <div class="buffs-row"><span class="buffs-label">你的BUFF：</span>${myBuffs}</div>
            <div class="buffs-row"><span class="buffs-label">对手BUFF：</span>${oppBuffs}</div>
          </div>
        </div>

        <div class="side-panel resource-panel">
          <h3>资源</h3>
          <div class="resource-info">
            <div class="resource-item"><span class="res-label">你的资源</span><span class="res-tag">${myRes}</span></div>
            <div class="resource-item"><span class="res-label">对手资源</span><span class="res-tag">${oppRes}</span></div>
          </div>
        </div>

        <div class="side-panel skill-panel-sm">
          <h3>技能</h3>
          <div class="skills-bar-compact">
            <button id="btn-skill-panel" class="skill-panel-btn">查看全部技能</button>
            <div class="active-skills">${skillsHtml}</div>
          </div>
        </div>
      </div>

      <button id="btn-bgm" class="bgm-control ${getMuteState() ? "muted" : ""}" title="BGM 开关">
        ${getMuteState() ? "🔇" : "🔊"}
      </button>

      ${state.showSkillPanel ? renderSkillPanel(me, opp) : ""}
      ${state.decision ? renderDecision(state.decision) : ""}
    </div>`;

  // 事件绑定
  app.querySelectorAll<HTMLInputElement>("input[data-skill]").forEach((el) => {
    if (el.disabled) return;
    el.onchange = () => {
      const id = el.dataset.skill!;
      console.log("[skill] changed:", id, "checked:", el.checked);
      if (el.checked) state.selectedSkills.add(id);
      else state.selectedSkills.delete(id);
      render();
    };
  });

  app.querySelectorAll(".hand-card").forEach((el) => {
    const card = el as HTMLElement;
    if (card.classList.contains("used") || state.submitted || state.waiting) return;
    card.onclick = () => {
      const id = card.dataset.card!;
      console.log("[hand-card] clicked:", id);
      state.selectedCard = id;
      render();
    };
  });

  const btnConfirm = document.getElementById("btn-confirm");
  if (btnConfirm) {
    btnConfirm.onclick = () => {
      console.log("[btn-confirm] clicked, selectedCard:", state.selectedCard, "submitted:", state.submitted);
      if (state.submitted) return;
      const myHand = state.view!.hands[state.you!] ?? [];
      const cardId = state.selectedCard;
      if (cardId === null && myHand.length > 0) return;
      state.submitted = true;
      net.send({
        type: "submitMove",
        cardId,
        skillIds: [...state.selectedSkills],
      });
      render();
    };
  } else {
    console.log("[btn-confirm] not found");
  }

  const btnCancel = document.getElementById("btn-cancel");
  if (btnCancel) {
    btnCancel.onclick = () => {
      state.selectedCard = null;
      render();
    };
  }

  const btnSkillPanel = document.getElementById("btn-skill-panel");
  if (btnSkillPanel) {
    btnSkillPanel.onclick = () => {
      console.log("[btn-skill-panel] clicked");
      state.showSkillPanel = !state.showSkillPanel;
      render();
    };
  } else {
    console.warn("[btn-skill-panel] not found");
  }

  const btnBgm = document.getElementById("btn-bgm");
  if (btnBgm) {
    btnBgm.onclick = () => {
      toggleMute();
      render();
    };
  }

}

function renderSkillPanel(me: GameView["players"]["A"], opp: GameView["players"]["A"]): string {
  const mySkills = me.skills || [];
  const oppSkills = opp.skills || [];
  
  const skillCard = (s: SkillInfo, owner: "me" | "foe") => {
    const cd = s.cooldownLeft ?? 0;
    const status = s.passive
      ? '<span class="skill-status passive">被动技能</span>'
      : cd > 0
        ? `<span class="skill-status cd">⏳ 冷却中 · 剩余 ${cd} 回合</span>`
        : s.ready
          ? '<span class="skill-status ready">✅ 本回合可用</span>'
          : '<span class="skill-status not-ready">本回合不可用</span>';
    return `
    <div class="skill-card ${owner}">
      <div class="skill-name">${s.name}${s.passive ? '<span class="passive">被动</span>' : ""}</div>
      <div class="skill-cooldown">基础冷却：${s.cooldown} 回合</div>
      <div class="skill-status-line">${status}</div>
      <div class="skill-text">${s.text}</div>
    </div>`;
  };

  const mySkillsHtml = mySkills.length > 0 
    ? mySkills.map((s) => skillCard(s, "me")).join("") 
    : "<p style='opacity:0.6;'>暂无技能</p>";
  const oppSkillsHtml = oppSkills.length > 0 
    ? oppSkills.map((s) => skillCard(s, "foe")).join("") 
    : "<p style='opacity:0.6;'>暂无技能</p>";

  return `
    <div class="skill-panel-overlay" id="skill-overlay">
      <div class="skill-panel">
        <div class="skill-panel-header">
          <h3>技能详情</h3>
          <button id="btn-close-panel" class="btn-secondary" style="padding:8px 16px;font-size:0.9rem;">关闭</button>
        </div>
        <div class="skill-panel-body">
          <div class="skill-section">
            <h4>你的技能 (${mySkills.length})</h4>
            ${mySkillsHtml}
          </div>
          <div class="skill-section">
            <h4>对手技能 (${oppSkills.length})</h4>
            ${oppSkillsHtml}
          </div>
        </div>
      </div>
    </div>`;
}

function renderDecision(d: { prompt: string; options: string[]; range?: DecisionRange }): string {
  const hasRange = d.range && d.range.min !== undefined;
  const hasOptions = d.options && d.options.length > 0;
  
  if (hasRange && !hasOptions) {
    const { min, max } = d.range!;
    const buttons = [];
    for (let i = min; i <= max; i++) {
      buttons.push(`<button class="decision-option range-option" data-value="${i}">${i}</button>`);
    }
    return `
      <div class="decision-overlay" id="decision-overlay">
        <div class="decision-panel">
          <div class="decision-title">需要做出选择</div>
          <div class="decision-prompt">${d.prompt}</div>
          <div class="decision-options range-options">
            ${buttons.join("")}
          </div>
          <div class="decision-range-hint">请点击上方数字进行选择</div>
        </div>
      </div>`;
  }
  
  if (hasRange && hasOptions) {
    const { min, max } = d.range!;
    const buttons = [];
    for (let i = min; i <= max; i++) {
      buttons.push(`<button class="decision-option range-option" data-value="${i}">${i}</button>`);
    }
    return `
      <div class="decision-overlay" id="decision-overlay">
        <div class="decision-panel">
          <div class="decision-title">需要做出选择</div>
          <div class="decision-prompt">${d.prompt}</div>
          <div class="decision-options range-options">
            ${buttons.join("")}
          </div>
          <div class="decision-divider">或选择：</div>
          <div class="decision-options">
            ${d.options.map((opt, i) => `<button class="decision-option" data-index="${i}">${opt}</button>`).join("")}
          </div>
        </div>
      </div>`;
  }
  
  return `
    <div class="decision-overlay" id="decision-overlay">
      <div class="decision-panel">
        <div class="decision-title">需要做出选择</div>
        <div class="decision-prompt">${d.prompt}</div>
        <div class="decision-options">
          ${d.options.map((opt, i) => `<button class="decision-option" data-index="${i}">${opt}</button>`).join("")}
        </div>
      </div>
    </div>`;
}

function appendLog(entry: LogEntry): void {
  const logEl = document.getElementById("log");
  if (!logEl) return;
  const line = document.createElement("div");
  line.className = `log-line ${entry.type ?? ""} animate`;
  line.innerHTML = `<span class="lt">T${entry.turn}</span> ${entry.msg}`;
  logEl.appendChild(line);
  // 日志 DOM 上限：超长对局防止页面卡顿
  while (logEl.childElementCount > 200) logEl.removeChild(logEl.firstElementChild!);
  logEl.scrollTop = logEl.scrollHeight;
  setTimeout(() => line.classList.remove("animate"), 600);

  // 解析日志内容触发视觉效果和音效
  processLogEffects(entry);
  maybePlayDeclaration(entry);
}

function processLogEffects(entry: LogEntry): void {
  const msg = entry.msg;
  const type = entry.type;

  // 判断目标方（通过日志中的角色名或A/B标识）
  let targetSide: "me" | "foe" | null = null;
  const mySeat = state.you;
  if (msg.includes("（A）") || msg.includes("(A)")) {
    targetSide = mySeat === "A" ? "me" : "foe";
  } else if (msg.includes("（B）") || msg.includes("(B)")) {
    targetSide = mySeat === "B" ? "me" : "foe";
  }

  // 获取HP条位置用于弹出数字
  const getHpBarPos = (side: "me" | "foe") => {
    const el = document.querySelector(side === "me" ? ".hp-me" : ".hp-foe");
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top };
  };

  // 免疫 / 护盾吸收 / 反弹：目标处生成护盾特效
  if (msg.includes("免疫") || msg.includes("护盾吸收") || (msg.includes("反弹") && msg.includes("伤害"))) {
    if (targetSide) spawnShieldFx(targetSide, "免疫");
    playSound("buff");
  }

  // 物理伤害
  if (type === "physical" || msg.includes("物理伤害")) {
    playSound("physical");
    glowScreen("physical");
    if (targetSide) {
      spawnDanmaku(targetSide, "physical");
      const pos = getHpBarPos(targetSide);
      const match = msg.match(/(\d+)/);
      const num = match ? match[1] : "";
      showDamagePopup(`-${num} 物理`, "physical", pos.x - 40, pos.y);
      flashHpBar(targetSide, "damage");
      createParticleBurst(pos.x, pos.y + 20, "#ff8c42", 10);
    }
    return;
  }

  // 法术伤害
  if (type === "spell" || msg.includes("法术伤害")) {
    playSound("spell");
    glowScreen("spell");
    if (targetSide) {
      spawnDanmaku(targetSide, "spell");
      const pos = getHpBarPos(targetSide);
      const match = msg.match(/(\d+)/);
      const num = match ? match[1] : "";
      showDamagePopup(`-${num} 法术`, "spell", pos.x - 40, pos.y);
      flashHpBar(targetSide, "damage");
      createParticleBurst(pos.x, pos.y + 20, "#7b6cf6", 10);
    }
    return;
  }

  // 生命流失
  if (msg.includes("生命流失") || msg.includes("流失")) {
    playSound("drain");
    if (targetSide) {
      spawnDanmaku(targetSide, "drain");
      const pos = getHpBarPos(targetSide);
      const match = msg.match(/(\d+)/);
      const num = match ? match[1] : "";
      showDamagePopup(`-${num} 流失`, "drain", pos.x - 40, pos.y);
      flashHpBar(targetSide, "damage");
    }
    return;
  }

  // 回复HP
  if (msg.includes("回复") && (type === "hp" || msg.includes("HP"))) {
    playSound("heal");
    if (targetSide) {
      spawnDanmaku(targetSide, "heal");
      const pos = getHpBarPos(targetSide);
      const match = msg.match(/(\d+)/);
      const num = match ? match[1] : "";
      showDamagePopup(`+${num} 回复`, "heal", pos.x - 40, pos.y);
      flashHpBar(targetSide, "heal");
      createParticleBurst(pos.x, pos.y + 20, "#5fd08a", 8);
    }
    return;
  }

  // HP变动（扣血）
  if (type === "hp" && (msg.includes("受到") || msg.includes("HP"))) {
    playSound("damage");
    if (targetSide) {
      const pos = getHpBarPos(targetSide);
      flashHpBar(targetSide, "damage");
      triggerScreenShake();
    }
    return;
  }

  // BUFF效果
  if (type === "buff") {
    playSound("buff");
    return;
  }

  // 威力对抗
  if (msg.includes("威力") && msg.includes("对抗")) {
    playSound("clash");
    return;
  }
}

function showBanner(text: string): void {
  const existing = document.querySelector(".banner");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "banner";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function nameOf(id: string): string {
  const c = state.roster.find((x) => x.id === id);
  return c ? c.name : id;
}

// 决策事件委托
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  // 技能面板关闭
  if (target.closest("#btn-close-panel")) {
    state.showSkillPanel = false;
    render();
  }
  if (target.closest("#skill-overlay") && !target.closest(".skill-panel")) {
    state.showSkillPanel = false;
    render();
  }

  // 决策选择
  const optBtn = target.closest(".decision-option") as HTMLElement | null;
  if (optBtn && state.decision) {
    // 检查是否是range数值选择
    const rangeOption = optBtn.closest(".range-option");
    if (rangeOption) {
      const value = parseInt(optBtn.dataset.value ?? "0", 10);
      state.decision = null;
      net.send({ type: "decision", value: value });
      render();
      return;
    }
    
    // 普通选项
    const idx = parseInt(optBtn.dataset.index ?? "0", 10);
    state.decision = null;
    net.send({ type: "decision", value: idx });
    render();
  }
});

// PWA: 仅生产环境注册服务工作器，开发模式跳过以免干扰 Vite 热更新
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("[sw] register failed", err);
    });
  });
}

// 初始渲染
render();
