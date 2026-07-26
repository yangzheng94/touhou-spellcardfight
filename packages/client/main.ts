import type { CharacterInfo, GameView, LogEntry } from "../../engine/src/types.js";
import { getCardIcon } from "./icons/youmu.js";

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
  decision: { prompt: string; options: string[] } | null;
  oppSelectedCard: string | null;
  oppSelectedSkills: string[];
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
const ws = new WebSocket(wsUrl);
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

ws.onopen = () => {
  console.log("[ws] connected");
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
};

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  console.log("[ws] message:", msg.type, msg);
  switch (msg.type) {
    case "roomCreated":
      state.roomId = msg.roomId;
      state.seat = "A";
      state.chosen = { A: null, B: null };
      state.tempCharSelect = null;
      render();
      break;
    case "joined":
    case "joinedRoom":
      state.roomId = msg.roomId;
      state.seat = msg.seat;
      state.chosen = msg.chosen ?? { A: null, B: null };
      state.tempCharSelect = null;
      render();
      break;
    case "roster":
      state.roster = msg.characters ?? msg.roster ?? [];
      render();
      break;
    case "characterChosen":
    case "chooseCharacter":
      state.chosen[msg.seat] = msg.characterId;
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
      state.view = msg.view;
      state.submitted = false;
      state.waiting = false;
      state.selectedSkills.clear();
      state.selectedCard = null;
      state.oppSelectedCard = null;
      state.oppSelectedSkills = [];
      render();
      break;
    case "logEntry":
      appendLog(msg.entry);
      break;
    case "gameOver":
      state.view = msg.view;
      render();
      showBanner(`游戏结束！${msg.winner === state.you ? "你赢了" : "你输了"}`);
      break;
    case "decisionRequest":
      state.decision = { prompt: msg.prompt, options: msg.options };
      render();
      break;
    case "error":
      showBanner(msg.message);
      break;
    default:
      break;
  }
};

ws.onclose = () => {
  console.log("[ws] closed");
  showBanner("连接已断开，5秒后重连…");
  reconnectTimer = setTimeout(() => location.reload(), 5000);
};

ws.onerror = (err) => {
  console.error("[ws] error:", err);
};

const net = {
  send: (payload: Record<string, unknown>) => {
    console.log("[net.send]", payload, "ws state:", ws.readyState);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      console.warn("[net.send] WebSocket not open, state:", ws.readyState);
      showBanner("网络未连接，请等待重连…");
    }
  },
};

function render(): void {
  if (!state.roomId) return renderLobby();
  if (!state.view) return renderCharacterSelect();
  return renderBattle();
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
      <p class="lobby-subtitle">符卡对抗 · 联机对战</p>
      <div class="lobby-panel">
        <button id="btn-create" class="btn-primary">创建房间</button>
        <div class="join-row">
          <input id="room-input" class="input-field" maxlength="4" placeholder="房间码" />
          <button id="btn-join" class="btn-secondary">加入</button>
        </div>
      </div>
      <p class="hint">创建房间后，把 4 位房间码告诉朋友即可对战。</p>
    </div>`;
  document.getElementById("btn-create")!.onclick = () => net.send({ type: "createRoom" });
  document.getElementById("btn-join")!.onclick = () => {
    const v = (document.getElementById("room-input") as HTMLInputElement).value.trim().toUpperCase();
    if (v) net.send({ type: "joinRoom", roomId: v });
  };
}

function renderCharacterSelect(): void {
  const myChoice = state.seat ? state.chosen[state.seat] : null;
  const oppSeat = state.seat === "A" ? "B" : "A";
  const oppChoice = state.chosen[oppSeat];
  app.innerHTML = `
    <div class="select-screen">
      <div class="select-topbar">
        <span>房间码 <b>${state.roomId}</b></span>
        <span>你是 <b>${state.seat}</b></span>
        <span>对手：${oppChoice ? "已选择" : "选择中…"}</span>
      </div>
      <h2 class="select-title">选择角色</h2>
      <div class="char-grid">
        ${state.roster
          .map(
            (c) => `
          <div class="char-card ${state.tempCharSelect === c.id ? "sel" : ""}" data-id="${c.id}">
            <div class="char-portrait">[立绘]</div>
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

  const skillsHtml = (me.skills ?? [])
    .map((s) => {
      const active = state.selectedSkills.has(s.id);
      const disabled = s.passive || !s.ready || state.submitted || state.waiting;
      return `
        <label class="skill-toggle ${active ? "on" : ""} ${disabled ? "disabled" : ""}" data-id="${s.id}">
          <input type="checkbox" data-skill="${s.id}" ${active ? "checked" : ""} ${disabled ? "disabled" : ""} />
          ${s.name}${s.cooldown > 1 ? ` <small style="opacity:0.6">(${s.cooldown}T)</small>` : ""}
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
    .join("");

  const usedHtml = myUsed
    .map((c) => `
      <div class="hand-card used" data-card="${c.id}">
        <div class="card-portrait">${getCardIcon(c.id)}</div>
        <div class="hc-top"><span class="hc-name">${c.name}</span><span class="hc-power">威力 ${c.power}</span></div>
        <div class="hc-text">${c.text}</div>
      </div>`)
    .join("");

  const myHpPct = Math.round((me.hp / me.maxHp) * 100);
  const oppHpPct = Math.round((opp.hp / opp.maxHp) * 100);

  const myBuffs = me.buffs.map((b) => b.name).join(", ") || "无";
  const oppBuffs = opp.buffs.map((b) => b.name).join(", ") || "无";

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
      <div class="battle-main">
        <div class="hp-bars">
          <div class="hp-bar hp-me">
            <div class="hp-label"><span class="hp-name">${me.characterName}（你）</span><span class="hp-num">${me.hp} / ${me.maxHp}</span></div>
            <div class="hp-track"><div class="hp-fill" style="width:${myHpPct}%"></div></div>
          </div>
          <div class="hp-bar hp-foe">
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
              ${state.submitted ? "已提交，等待对手…" : state.waiting ? "等待对手…" : state.oppSelectedCard ? `获知：敌方已选「${cardNameById(state.oppSelectedCard)}」，请做出你的选择` : "请选择一张符卡并确认"}
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
          ${state.selectedCard && !state.submitted && !state.waiting ? `<button id="btn-confirm" class="btn-primary confirm-btn">确认打出</button>` : ""}
          ${state.selectedCard && !state.submitted && !state.waiting ? `<button id="btn-cancel" class="btn-secondary cancel-btn">撤回重选</button>` : ""}
        </div>
      </div>

      <div class="battle-sidebar">
        <div class="side-panel status-panel">
          <h3>回合状态</h3>
          <div class="turn-indicator">第 ${v.turn} 回合</div>
          <div class="status-buffs">
            <div class="buffs-row"><span class="buffs-label">你的BUFF：</span>${myBuffs.split(", ").map(b => `<span class="buff-tag">${b}</span>`).join("")}</div>
            <div class="buffs-row"><span class="buffs-label">对手BUFF：</span>${oppBuffs.split(", ").map(b => `<span class="buff-tag">${b}</span>`).join("")}</div>
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

      ${state.showSkillPanel ? renderSkillPanel(my, opp) : ""}
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
      if (!state.selectedCard || state.submitted) return;
      state.submitted = true;
      net.send({
        type: "submitMove",
        cardId: state.selectedCard,
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

}

function renderSkillPanel(me: GameView["players"]["A"], opp: GameView["players"]["A"]): string {
  console.log("[renderSkillPanel] me.skills:", me.skills, "opp.skills:", opp.skills);
  const skillCard = (s: { id: string; name: string; text: string; passive?: boolean; cooldown: number }, owner: "me" | "foe") => `
    <div class="skill-card ${owner}">
      <div class="skill-name">${s.name}${s.passive ? '<span class="passive">被动</span>' : ""}</div>
      <div class="skill-cooldown">冷却：${s.cooldown} 回合</div>
      <div class="skill-text">${s.text}</div>
    </div>`;

  const mySkillsHtml = me.skills?.map((s) => skillCard(s, "me")).join("") || "<p>无技能数据</p>";
  const oppSkillsHtml = opp.skills?.map((s) => skillCard(s, "foe")).join("") || "<p>无技能数据</p>";

  return `
    <div class="skill-panel-overlay" id="skill-overlay">
      <div class="skill-panel">
        <div class="skill-panel-header">
          <h3>技能详情</h3>
          <button id="btn-close-panel" class="btn-secondary" style="padding:8px 16px;font-size:0.9rem;">关闭</button>
        </div>
        <div class="skill-panel-body">
          <div class="skill-section">
            <h4>你的技能</h4>
            ${mySkillsHtml}
          </div>
          <div class="skill-section">
            <h4>对手技能</h4>
            ${oppSkillsHtml}
          </div>
        </div>
      </div>
    </div>`;
}

function renderDecision(d: { prompt: string; options: string[] }): string {
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
  logEl.scrollTop = logEl.scrollHeight;
  setTimeout(() => line.classList.remove("animate"), 600);

  // 解析日志内容触发视觉效果和音效
  processLogEffects(entry);
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

  // 物理伤害
  if (type === "physical" || msg.includes("物理伤害")) {
    playSound("physical");
    glowScreen("physical");
    if (targetSide) {
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
    const idx = parseInt(optBtn.dataset.index ?? "0", 10);
    state.decision = null;
    net.send({ type: "decision", value: idx });
    render();
  }
});

// 初始渲染
render();
