import { WebSocketServer, WebSocket } from "ws";
import {
  newGame,
  playTurn,
  isSkillReady,
  type GameState,
  type PlayerId,
  type Character,
  type DecisionResolver,
} from "../../engine/src/index.js";
import { CHARACTERS, CHARACTERS_BY_ID } from "../../engine/src/data/index.js";
import type {
  ClientMessage,
  ServerMessage,
  CharacterInfo,
  GameView,
  PlayerView,
  CardInfo,
  ReplayData,
  Difficulty,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// 视图转换
// ---------------------------------------------------------------------------

function characterInfo(state: GameState | null, who: PlayerId | null, char: Character): CharacterInfo {
  return {
    id: char.id,
    name: char.name,
    hp: char.hp,
    cards: char.cards.map((c) => ({
      id: c.id,
      name: c.name,
      power: c.power,
      text: c.text,
      tags: c.tags,
    })),
    skills: char.skills.map((s) => ({
      id: s.id,
      name: s.name,
      text: s.text,
      cooldown: s.cooldown,
      passive: s.passive,
      declaredAtTurnStart: s.declaredAtTurnStart,
      ready: state && who ? isSkillReady(state, who, s) : true,
    })),
  };
}

function playerView(state: GameState, who: PlayerId): PlayerView {
  const p = state.players[who];
  return {
    id: who,
    characterId: p.character.id,
    characterName: p.character.name,
    hp: p.hp,
    maxHp: p.maxHp,
    usedCardIds: p.usedCardIds,
    resources: p.resources,
    flags: p.flags,
    buffs: p.buffs.map((b) => ({ id: b.id, name: b.name, remainingTurns: b.remainingTurns })),
    skills: p.character.skills.map((s) => ({
      id: s.id,
      name: s.name,
      text: s.text,
      cooldown: s.cooldown,
      passive: s.passive,
      declaredAtTurnStart: s.declaredAtTurnStart,
      ready: isSkillReady(state, who, s),
    })),
  };
}

function cardInfo(c: { id: string; name: string; power: number; text: string; tags: string[] }): CardInfo {
  return { id: c.id, name: c.name, power: c.power, text: c.text, tags: c.tags };
}

function gameView(state: GameState): GameView {
  const hands: GameView["hands"] = { A: [], B: [] };
  const used: GameView["used"] = { A: [], B: [] };
  for (const who of ["A", "B"] as PlayerId[]) {
    const p = state.players[who];
    const usedIds = new Set(p.usedCardIds);
    for (const c of p.character.cards) {
      if (usedIds.has(c.id)) {
        used[who].push(cardInfo(c));
      } else {
        hands[who].push(cardInfo(c));
      }
    }
  }
  return {
    turn: state.turn,
    players: { A: playerView(state, "A"), B: playerView(state, "B") },
    winner: state.winner,
    log: state.log.map((e) => ({ turn: e.turn, phase: e.phase, msg: e.msg, type: e.type })),
    hands,
    used,
  };
}

// ---------------------------------------------------------------------------
// 房间
// ---------------------------------------------------------------------------

interface Seat {
  ws: WebSocket | null;
  name: string;
  characterId: string | null;
  pendingMove: { cardId: string | null; skillIds: string[] } | null;
  pendingDecision: { resolve: (value: number) => void; reject: (reason?: unknown) => void } | null;
  isAI: boolean;
}

class Room {
  id: string;
  seats: Record<PlayerId, Seat> = {
    A: { ws: null, name: "玩家A", characterId: null, pendingMove: null, pendingDecision: null, isAI: false },
    B: { ws: null, name: "玩家B", characterId: null, pendingMove: null, pendingDecision: null, isAI: false },
  };
  state: GameState | null = null;
  seed: number;
  isResolving: boolean = false;
  /** 单人模式人机难度（默认简单）。 */
  difficulty: Difficulty = "easy";
  /** 录像数据：逐回合记录双方出牌、HP 快照与日志。 */
  replayTurns: ReplayData["turns"] = [];

  constructor(id: string, seed: number) {
    this.id = id;
    this.seed = seed;
  }

  /** AI 选择角色：指定 opponentId 则选该角色，否则随机。 */
  aiPickCharacter(opponentId?: string): void {
    let picked: Character;
    if (opponentId && CHARACTERS_BY_ID[opponentId]) {
      picked = CHARACTERS_BY_ID[opponentId];
    } else {
      const chars = CHARACTERS;
      picked = chars[Math.floor(Math.random() * chars.length)];
    }
    this.seats.B.characterId = picked.id;
    this.broadcast({ type: "characterChosen", seat: "B", characterId: picked.id });
  }

  /** AI 生成本回合的 move：按难度分派策略。 */
  generateAIMove(): void {
    if (!this.state || !this.seats.B.isAI) return;
    if (this.difficulty === "medium") this.generateAIMoveMedium();
    else this.generateAIMoveEasy();
  }

  /** 简单人机：完全随机。随机选符卡（或空过），随机宣告部分技能。 */
  generateAIMoveEasy(): void {
    const seat: PlayerId = "B";
    const player = this.state!.players[seat];
    const hand = player.character.cards.filter((c) => !player.usedCardIds.includes(c.id));
    const cardId = hand.length > 0 && Math.random() < 0.9 ? hand[Math.floor(Math.random() * hand.length)].id : null;
    const skillIds = player.character.skills
      .filter((s) => !s.passive && isSkillReady(this.state!, seat, s) && Math.random() < 0.6)
      .map((s) => s.id);
    this.seats.B.pendingMove = { cardId, skillIds };
  }

  /** 中等人机：启发式。低血量优先防御牌，否则选期望威力最高的牌；宣告所有可用技能。 */
  generateAIMoveMedium(): void {
    const seat: PlayerId = "B";
    const player = this.state!.players[seat];
    const foe = this.state!.players.A;
    const hand = player.character.cards.filter((c) => !player.usedCardIds.includes(c.id));
    const lowHp = player.hp <= Math.ceil(player.maxHp * 0.4);
    const opponentThreat = foe.hp <= Math.ceil(foe.maxHp * 0.4);

    let cardId: string | null = null;
    if (hand.length > 0) {
      const defensive = hand.filter((c) =>
        c.tags.some((t) => t === "immune" || t === "reflect" || t === "absorb" || t === "heal" || t === "negate-effect")
      );
      const pool = lowHp && defensive.length > 0 ? defensive : hand;
      let best = pool[0];
      let bestScore = -Infinity;
      for (const c of pool) {
        let score = c.power;
        if (defensive.includes(c)) score += lowHp ? 12 : 4;
        if (c.tags.includes("spell-damage")) score += 3;
        if (c.tags.includes("manual")) score -= 6;
        if (opponentThreat && c.power > 0) score += 2;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      cardId = best.id;
    }
    const skillIds = player.character.skills
      .filter((s) => !s.passive && isSkillReady(this.state!, seat, s))
      .map((s) => s.id);
    this.seats.B.pendingMove = { cardId, skillIds };
  }

  /** AI 对决策请求做出随机选择。 */
  aiDecide(req: Parameters<DecisionResolver>[0]): number {
    if (req.options && req.options.length > 0) {
      return Math.floor(Math.random() * req.options.length);
    }
    if (req.range) {
      const size = req.range.max - req.range.min + 1;
      return req.range.min + Math.floor(Math.random() * size);
    }
    return 0;
  }

  send(who: PlayerId, msg: ServerMessage): void {
    const ws = this.seats[who].ws;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMessage): void {
    this.send("A", msg);
    this.send("B", msg);
  }

  bothChosen(): boolean {
    return !!this.seats.A.characterId && !!this.seats.B.characterId;
  }

  startGame(): void {
    const charA = CHARACTERS_BY_ID[this.seats.A.characterId!];
    const charB = CHARACTERS_BY_ID[this.seats.B.characterId!];
    this.state = newGame(charA, charB, { seed: this.seed });
    for (const who of ["A", "B"] as PlayerId[]) {
      const you = who;
      const opp = who === "A" ? "B" : "A";
      this.send(who, {
        type: "gameStart",
        view: gameView(this.state),
        you,
        yourChar: characterInfo(this.state, you, this.state.players[you].character),
        oppChar: characterInfo(this.state, opp, this.state.players[opp].character),
      });
    }
  }

  bothMoved(): boolean {
    return !!this.seats.A.pendingMove && !!this.seats.B.pendingMove;
  }

  async resolveMoves(): Promise<void> {
    if (!this.state || this.isResolving) return;
    this.isResolving = true;
    const moveA = this.seats.A.pendingMove!;
    const moveB = this.seats.B.pendingMove!;
    const prevLogLen = this.state.log.length;

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let lastLogIndex = prevLogLen;

    const decide: DecisionResolver = (req) => {
      // 先发送自上次决策以来累积的日志
      for (let i = lastLogIndex; i < this.state!.log.length; i++) {
        const entry = this.state!.log[i];
        this.broadcast({ type: "logEntry", entry: { turn: entry.turn, phase: entry.phase, msg: entry.msg, type: entry.type } });
      }
      lastLogIndex = this.state!.log.length;

      // AI 玩家直接随机决策
      if (this.seats[req.player].isAI) {
        return Promise.resolve(this.aiDecide(req));
      }

      // 发送决策请求给对应玩家
      this.send(req.player, {
        type: "decisionRequest",
        prompt: req.prompt,
        options: req.options,
        range: req.range,
      });
      return new Promise<number>((resolve) => {
        this.seats[req.player].pendingDecision = {
          resolve: (value: number) => resolve(value),
          reject: () => resolve(0),
        };
      });
    };

    try {
      await playTurn(this.state, moveA, moveB, decide);

      // 发送结算后剩余的日志（包括决策后的结果）
      for (let i = lastLogIndex; i < this.state.log.length; i++) {
        const entry = this.state.log[i];
        this.broadcast({ type: "logEntry", entry: { turn: entry.turn, phase: entry.phase, msg: entry.msg, type: entry.type } });
        await wait(600);
      }
    } catch (e) {
      console.error(`[room ${this.id}] resolveMoves error:`, e);
      this.broadcast({ type: "error", message: `结算错误: ${(e as Error).message}` });
      this.isResolving = false;
      return;
    }

    // 记录本回合录像（双方出牌 + HP 快照 + 本回合新增日志）
    this.replayTurns.push({
      turn: this.state.turn,
      moves: {
        A: { cardId: moveA.cardId, skillIds: moveA.skillIds },
        B: { cardId: moveB.cardId, skillIds: moveB.skillIds },
      },
      hpAfter: { A: this.state.players.A.hp, B: this.state.players.B.hp },
      log: this.state.log.slice(prevLogLen).map((e) => ({ turn: e.turn, phase: e.phase, msg: e.msg, type: e.type })),
    });

    this.seats.A.pendingMove = null;
    this.seats.B.pendingMove = null;
    this.broadcast({ type: "turnResolved", view: gameView(this.state) });
    if (this.state.winner) {
      this.broadcast({ type: "gameOver", winner: this.state.winner, view: gameView(this.state), replay: this.buildReplay() });
    }
    this.isResolving = false;
  }

  handleDecision(player: PlayerId, value: number): void {
    const seat = this.seats[player];
    if (seat.pendingDecision) {
      seat.pendingDecision.resolve(value);
      seat.pendingDecision = null;
    }
  }

  /** 汇总整局录像数据（角色信息 + 逐回合出牌/HP/日志）。 */
  buildReplay(): ReplayData {
    const st = this.state!;
    return {
      version: 1,
      meta: {
        charA: characterInfo(null, null, st.players.A.character),
        charB: characterInfo(null, null, st.players.B.character),
        seed: this.seed,
        createdAt: Date.now(),
        difficulty: this.seats.B.isAI ? this.difficulty : undefined,
      },
      turns: this.replayTurns,
      winner: st.winner,
    };
  }
}

// ---------------------------------------------------------------------------
// 房间管理器
// ---------------------------------------------------------------------------

const rooms = new Map<string, Room>();
let seedCounter = 1000;

function makeRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(id) ? makeRoomId() : id;
}

function rosterMessage(): ServerMessage {
  const characters: CharacterInfo[] = CHARACTERS.map((c) => characterInfo(null, null, c));
  return { type: "roster", characters };
}

interface Conn {
  ws: WebSocket;
  roomId: string | null;
  seat: PlayerId | null;
}

export function startServer(port: number): void {
  const wss = new WebSocketServer({ port });
  console.log(`[server] WebSocket 监听 ws://localhost:${port}`);
  attachWebSocket(wss);

  // 心跳：30 秒无响应则断开，防止僵尸连接占位。
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const sock = client as WebSocket & { isAlive?: boolean };
      if (sock.isAlive === false) {
        sock.terminate();
        continue;
      }
      sock.isAlive = false;
      try {
        sock.ping();
      } catch {
        /* 连接已关闭 */
      }
    }
    // 空房间回收：双方座位都无存活连接时删除（AI 座位不占连接）。
    for (const [id, room] of rooms) {
      const aAlive = room.seats.A.ws && room.seats.A.ws.readyState === WebSocket.OPEN;
      const bAlive = room.seats.B.ws && room.seats.B.ws.readyState === WebSocket.OPEN;
      if (!aAlive && !bAlive) {
        rooms.delete(id);
      }
    }
  }, 30_000);
  heartbeat.unref?.();
}

export function attachWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    const sock = ws as WebSocket & { isAlive?: boolean };
    sock.isAlive = true;
    sock.on("pong", () => {
      sock.isAlive = true;
    });
    const conn: Conn = { ws, roomId: null, seat: null };
    ws.send(JSON.stringify(rosterMessage()));

    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      handle(conn, msg);
    });

    ws.on("close", () => {
      if (conn.roomId && conn.seat) {
        const room = rooms.get(conn.roomId);
        if (room) {
          const opp = conn.seat === "A" ? "B" : "A";
          room.send(opp, { type: "opponentLeft" });
          // 双方都离开（含单人房的 AI 空位）则删除房间
          if (!room.seats.A.ws && !room.seats.B.ws) {
            rooms.delete(conn.roomId);
          }
        }
      }
    });
  });
}

function handle(conn: Conn, msg: ClientMessage): void {
  switch (msg.type) {
    case "createRoom": {
      const id = makeRoomId();
      const room = new Room(id, seedCounter++);
      rooms.set(id, room);
      room.seats.A.ws = conn.ws;
      room.seats.A.name = msg.name ?? "玩家A";
      conn.roomId = id;
      conn.seat = "A";
      send(conn.ws, { type: "roomCreated", roomId: id, seat: "A" });
      break;
    }
    case "createSinglePlayerRoom": {
      if (msg.difficulty === "hard") {
        return send(conn.ws, { type: "error", message: "困难难度暂未开放，请先选择简单或中等" });
      }
      const id = makeRoomId();
      const room = new Room(id, seedCounter++);
      rooms.set(id, room);
      room.seats.A.ws = conn.ws;
      room.seats.A.name = msg.name ?? "玩家A";
      room.seats.B.isAI = true;
      room.difficulty = msg.difficulty ?? "easy";
      room.seats.B.name = room.difficulty === "medium" ? "中等人机" : "简单人机";
      conn.roomId = id;
      conn.seat = "A";
      console.log(`[server] single player room ${id} created (difficulty=${room.difficulty}, opponent=${msg.opponentId ?? "random"})`);
      send(conn.ws, { type: "roomCreated", roomId: id, seat: "A" });
      // AI 选择对手（指定或随机）
      room.aiPickCharacter(msg.opponentId ?? undefined);
      console.log(`[server] AI picked character ${room.seats.B.characterId}`);
      break;
    }
    case "joinRoom": {
      const room = rooms.get(msg.roomId.toUpperCase());
      if (!room) return send(conn.ws, { type: "error", message: "房间不存在" });
      if (room.seats.B.ws) return send(conn.ws, { type: "error", message: "房间已满" });
      room.seats.B.ws = conn.ws;
      room.seats.B.isAI = false; // 真人加入后取消 AI 标志，避免单人房被误加入后由 AI 代打。
      room.seats.B.name = msg.name ?? "玩家B";
      conn.roomId = room.id;
      conn.seat = "B";
      send(conn.ws, { type: "joined", roomId: room.id, seat: "B" });
      // 通知双方已选角色（若有）
      for (const who of ["A", "B"] as PlayerId[]) {
        if (room.seats[who].characterId)
          room.broadcast({ type: "characterChosen", seat: who, characterId: room.seats[who].characterId! });
      }
      break;
    }
    case "selectCharacter": {
      if (!conn.roomId || !conn.seat) return;
      const room = rooms.get(conn.roomId);
      if (!room || !CHARACTERS_BY_ID[msg.characterId]) return;
      room.seats[conn.seat].characterId = msg.characterId;
      room.broadcast({ type: "characterChosen", seat: conn.seat, characterId: msg.characterId });
      if (room.bothChosen() && !room.state) room.startGame();
      break;
    }
    case "submitMove": {
      console.log(`[server] submitMove from ${conn.seat} in room ${conn.roomId}: card=${msg.cardId} skills=${JSON.stringify(msg.skillIds)}`);
      if (!conn.roomId || !conn.seat) return;
      const room = rooms.get(conn.roomId);
      if (!room || !room.state) {
        console.log(`[server] submitMove rejected: room=${!!room} state=${!!room?.state}`);
        return;
      }

      const seat = conn.seat;
      const opp = seat === "A" ? "B" : "A";

      // 觉/圣娅的「预知」：拥有 foresight 的一方必须等对手先提交，才能看到对方选择。
      const selfHasForesight = room.state.players[seat].flags["foresight"] === true;
      if (selfHasForesight && !room.seats[opp].pendingMove) {
        // 单人模式：AI 不会主动提交，先自动生成 AI move 并 reveal 给本方，再由本方重新提交。
        if (room.seats[opp].isAI) {
          room.generateAIMove();
          room.state.players[seat].flags["_foresight_triggered"] = true;
          room.state.players[seat].flags["foresight"] = false;
          send(conn.ws, {
            type: "foresightReveal",
            opponentCard: room.seats[opp].pendingMove!.cardId,
            opponentSkills: room.seats[opp].pendingMove!.skillIds,
          });
          return;
        }
        return send(conn.ws, { type: "error", message: "请先等待对方选择符卡" });
      }

      // 保存当前玩家的 move。
      room.seats[seat].pendingMove = { cardId: msg.cardId, skillIds: msg.skillIds };

      // 单人模式：若对手是 AI 且尚未提交，自动生成 AI move。
      if (room.seats[opp].isAI && !room.seats[opp].pendingMove) {
        room.generateAIMove();
      }

      // 若对手拥有 foresight 且尚未提交，则向对手 reveal 本方的选择。
      const oppHasForesight = room.state.players[opp].flags["foresight"] === true;
      if (oppHasForesight && !room.seats[opp].pendingMove) {
        room.state.players[opp].flags["_foresight_triggered"] = true;
        room.state.players[opp].flags["foresight"] = false;
        if (room.seats[opp].ws) {
          send(room.seats[opp].ws, {
            type: "foresightReveal",
            opponentCard: msg.cardId,
            opponentSkills: msg.skillIds,
          });
        }
        send(conn.ws, { type: "waitingForOpponent" });
        break;
      }

      if (room.bothMoved()) {
        void room.resolveMoves();
      } else {
        send(conn.ws, { type: "waitingForOpponent" });
      }
      break;
    }
    case "decision": {
      if (!conn.roomId || !conn.seat) return;
      const room = rooms.get(conn.roomId);
      if (!room) return;
      room.handleDecision(conn.seat, msg.value);
      break;
    }
    case "rematch": {
      if (!conn.roomId) return;
      const room = rooms.get(conn.roomId);
      if (!room) return;
      room.state = null;
      room.seed = seedCounter++;
      room.seats.A.characterId = null;
      room.seats.B.characterId = null;
      room.seats.A.pendingMove = null;
      room.seats.B.pendingMove = null;
      // 单人模式：AI 座位自动重新选将，否则重赛后 B 永远无法选将导致卡死。
      if (room.seats.B.isAI) {
        room.aiPickCharacter();
      }
      room.broadcast(rosterMessage());
      break;
    }
    case "leaveRoom": {
      if (!conn.roomId || !conn.seat) return;
      const room = rooms.get(conn.roomId);
      if (room) {
        const seat = conn.seat;
        const opp = seat === "A" ? "B" : "A";
        room.seats[seat].ws = null;
        room.seats[seat].characterId = null;
        room.seats[seat].pendingMove = null;
        room.seats[seat].pendingDecision = null;
        room.send(opp, { type: "opponentLeft" });
        // 若房间已空则删除
        if (!room.seats.A.ws && !room.seats.B.ws) {
          rooms.delete(conn.roomId);
        }
      }
      send(conn.ws, rosterMessage());
      conn.roomId = null;
      conn.seat = null;
      break;
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
