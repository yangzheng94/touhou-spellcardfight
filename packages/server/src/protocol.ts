/**
 * 网络协议 —— 客户端 / 服务器共享的消息定义。
 */

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

export interface LogEntryView {
  turn: number;
  phase?: string;
  msg: string;
  type?: "physical" | "spell" | "hp" | "buff" | "info";
}

export interface GameView {
  turn: number;
  players: { A: PlayerView; B: PlayerView };
  winner: "A" | "B" | "draw" | null;
  log: LogEntryView[];
  hands: { A: CardInfo[]; B: CardInfo[] };
  used: { A: CardInfo[]; B: CardInfo[] };
}

/** 客户端 → 服务器 */
export type ClientMessage =
  | { type: "createRoom"; name?: string }
  | { type: "createSinglePlayerRoom"; name?: string }
  | { type: "joinRoom"; roomId: string; name?: string }
  | { type: "selectCharacter"; characterId: string }
  | { type: "submitMove"; cardId: string | null; skillIds: string[] }
  | { type: "decision"; value: number }
  | { type: "rematch" }
  | { type: "leaveRoom" };

/** 服务器 → 客户端 */
export type ServerMessage =
  | { type: "roomCreated"; roomId: string; seat: "A" | "B" }
  | { type: "joined"; roomId: string; seat: "A" | "B" }
  | { type: "error"; message: string }
  | { type: "roster"; characters: CharacterInfo[] }
  | { type: "characterChosen"; seat: "A" | "B"; characterId: string }
  | { type: "gameStart"; view: GameView; you: "A" | "B"; yourChar: CharacterInfo; oppChar: CharacterInfo }
  | { type: "waitingForOpponent" }
  | { type: "turnResolved"; view: GameView }
  | { type: "logEntry"; entry: LogEntryView }
  | { type: "decisionRequest"; prompt: string; options: string[]; range?: { min: number; max: number } }
  | { type: "opponentLeft" }
  | { type: "gameOver"; winner: "A" | "B" | "draw"; view: GameView }
  | { type: "foresightReveal"; opponentCard: string | null; opponentSkills: string[] };
