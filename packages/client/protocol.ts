// 与服务器 packages/server/src/protocol.ts 保持同步。

export interface CardInfo {
  id: string;
  name: string;
  power: number;
  text: string;
  tags: string[];
}

export interface SkillInfo {
  id: string;
  name: string;
  text: string;
  cooldown: number;
  passive: boolean;
  declaredAtTurnStart: boolean;
  ready: boolean;
}

export interface CharacterInfo {
  id: string;
  name: string;
  hp: number;
  cards: CardInfo[];
  skills: SkillInfo[];
}

export interface PlayerView {
  id: "A" | "B";
  characterId: string;
  characterName: string;
  hp: number;
  maxHp: number;
  usedCardIds: string[];
  resources: Record<string, number>;
  flags: Record<string, string | number | boolean>;
  buffs: { id: string; name: string; remainingTurns: number }[];
  skills: SkillInfo[];
}

export interface GameView {
  turn: number;
  players: { A: PlayerView; B: PlayerView };
  winner: "A" | "B" | "draw" | null;
  log: LogEntry[];
  hands: { A: CardInfo[]; B: CardInfo[] };
  used: { A: CardInfo[]; B: CardInfo[] };
}

export type ClientMessage =
  | { type: "createRoom"; name?: string }
  | { type: "createSinglePlayerRoom"; name?: string; opponentId?: string; difficulty?: Difficulty }
  | { type: "joinRoom"; roomId: string; name?: string }
  | { type: "selectCharacter"; characterId: string }
  | { type: "submitMove"; cardId: string | null; skillIds: string[] }
  | { type: "decision"; value: number }
  | { type: "rematch" }
  | { type: "leaveRoom" };

export interface LogEntry {
  turn: number;
  phase?: string;
  msg: string;
  type?: "physical" | "spell" | "hp" | "buff" | "info";
}

/** 人机难度：简单（随机）/ 中等（启发式）/ 困难（预留最优解）。 */
export type Difficulty = "easy" | "medium" | "hard";

/** 录像：单回合数据（双方出牌、HP 快照、本回合日志）。 */
export interface ReplayTurn {
  turn: number;
  moves: {
    A: { cardId: string | null; skillIds: string[] };
    B: { cardId: string | null; skillIds: string[] };
  };
  hpAfter: { A: number; B: number };
  log: LogEntry[];
}

/** 完整对局录像（自包含：含双方角色数据，可离线回放）。 */
export interface ReplayData {
  version: number;
  meta: {
    charA: CharacterInfo;
    charB: CharacterInfo;
    seed: number;
    createdAt: number;
    difficulty?: Difficulty;
  };
  turns: ReplayTurn[];
  winner: "A" | "B" | "draw" | null;
}

export type ServerMessage =
  | { type: "roomCreated"; roomId: string; seat: "A" | "B" }
  | { type: "joined"; roomId: string; seat: "A" | "B" }
  | { type: "error"; message: string }
  | { type: "roster"; characters: CharacterInfo[] }
  | { type: "characterChosen"; seat: "A" | "B"; characterId: string }
  | { type: "gameStart"; view: GameView; you: "A" | "B"; yourChar: CharacterInfo; oppChar: CharacterInfo }
  | { type: "waitingForOpponent" }
  | { type: "turnResolved"; view: GameView }
  | { type: "logEntry"; entry: LogEntry }
  | { type: "decisionRequest"; prompt: string; options: string[]; range?: { min: number; max: number } }
  | { type: "opponentLeft" }
  | { type: "gameOver"; winner: "A" | "B" | "draw"; view: GameView; replay?: ReplayData }
  | { type: "foresightReveal"; opponentCard: string | null; opponentSkills: string[] };
