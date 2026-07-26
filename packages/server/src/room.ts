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
    log: state.log.map((e) => ({ turn: e.turn, phase: e.phase, msg: e.msg })),
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
}

class Room {
  id: string;
  seats: Record<PlayerId, Seat> = {
    A: { ws: null, name: "玩家A", characterId: null, pendingMove: null, pendingDecision: null },
    B: { ws: null, name: "玩家B", characterId: null, pendingMove: null, pendingDecision: null },
  };
  state: GameState | null = null;
  seed: number;
  isResolving: boolean = false;

  constructor(id: string, seed: number) {
    this.id = id;
    this.seed = seed;
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
      this.broadcast({ type: "error", message: `结算错误: ${(e as Error).message}` });
      this.isResolving = false;
      return;
    }

    this.seats.A.pendingMove = null;
    this.seats.B.pendingMove = null;
    this.broadcast({ type: "turnResolved", view: gameView(this.state) });
    if (this.state.winner) {
      this.broadcast({ type: "gameOver", winner: this.state.winner, view: gameView(this.state) });
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
}

export function attachWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
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
          room.seats[conn.seat].ws = null;
          const opp = conn.seat === "A" ? "B" : "A";
          room.send(opp, { type: "opponentLeft" });
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
    case "joinRoom": {
      const room = rooms.get(msg.roomId.toUpperCase());
      if (!room) return send(conn.ws, { type: "error", message: "房间不存在" });
      if (room.seats.B.ws) return send(conn.ws, { type: "error", message: "房间已满" });
      room.seats.B.ws = conn.ws;
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
      if (!conn.roomId || !conn.seat) return;
      const room = rooms.get(conn.roomId);
      if (!room || !room.state) return;
      
      const opp = conn.seat === "A" ? "B" : "A";
      const oppHasForesight = room.state.players[opp].flags["foresight"] === true;
      
      if (oppHasForesight && !room.seats[opp].pendingMove) {
        // 敌方有获知且尚未提交：通知敌方对方的已选符卡
        room.seats[conn.seat].pendingMove = { cardId: msg.cardId, skillIds: msg.skillIds };
        // 标记获知已触发，防止下一回合重复
        room.state.players[opp].flags["_foresight_triggered"] = true;
        room.state.players[opp].flags["foresight"] = false;
        send(room.seats[opp].ws!, {
          type: "foresightReveal",
          opponentCard: msg.cardId,
          opponentSkills: msg.skillIds,
        });
        send(conn.ws, { type: "waitingForOpponent" });
      } else {
        room.seats[conn.seat].pendingMove = { cardId: msg.cardId, skillIds: msg.skillIds };
        if (room.bothMoved()) {
          void room.resolveMoves();
        } else {
          send(conn.ws, { type: "waitingForOpponent" });
        }
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
      room.broadcast(rosterMessage());
      break;
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
