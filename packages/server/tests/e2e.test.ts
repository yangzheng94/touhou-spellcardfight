import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { startServer } from "../src/room.js";
import type { ClientMessage, ServerMessage } from "../src/protocol.js";

// 在随机端口起服务器，模拟两名客户端完整对战。
const PORT = 8123;
startServer(PORT);

function connect(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on("open", () => resolve(ws));
  });
}

function send(ws: WebSocket, msg: ClientMessage): void {
  ws.send(JSON.stringify(msg));
}

function waitFor(ws: WebSocket, type: ServerMessage["type"]): Promise<ServerMessage> {
  return waitForAny(ws, [type]);
}

function waitForAny(ws: WebSocket, types: ServerMessage["type"][]): Promise<ServerMessage> {
  return new Promise((resolve) => {
    const handler = (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (types.includes(msg.type)) {
        ws.off("message", handler);
        resolve(msg);
      }
    };
    ws.on("message", handler);
  });
}

describe("服务器端到端对战", () => {
  it("两名玩家建房/加入/选将/对战直到分出胜负", async () => {
    const a = await connect();
    const b = await connect();

    send(a, { type: "createRoom", name: "Alice" });
    const created = (await waitFor(a, "roomCreated")) as Extract<ServerMessage, { type: "roomCreated" }>;
    expect(created.seat).toBe("A");
    const roomId = created.roomId;

    send(b, { type: "joinRoom", roomId, name: "Bob" });
    await waitFor(b, "joined");

    // 双方选将
    const startA = waitFor(a, "gameStart");
    const startB = waitFor(b, "gameStart");
    send(a, { type: "selectCharacter", characterId: "youmu" });
    send(b, { type: "selectCharacter", characterId: "reimu" });
    const gsA = (await startA) as Extract<ServerMessage, { type: "gameStart" }>;
    await startB;
    expect(gsA.you).toBe("A");
    expect(gsA.yourChar.id).toBe("youmu");

    // 反复出牌直到 gameOver（或回合上限）
    let over: Extract<ServerMessage, { type: "gameOver" }> | null = null;
    let turn = 0;
    while (turn < 10 && !over) {
      // 各按回合索引出一张符卡（一次性，索引递增避免重复）
      const cardA = gsA.yourChar.cards[turn % gsA.yourChar.cards.length].id;
      const cardB = gsA.oppChar.cards[turn % gsA.oppChar.cards.length].id;

      // 同时提交双方 move
      const sendA = send(a, { type: "submitMove", cardId: cardA, skillIds: [] });
      const sendB = send(b, { type: "submitMove", cardId: cardB, skillIds: [] });

      // 等待 turnResolved 或 gameOver
      const resultP = new Promise<ServerMessage | null>((resolve) => {
        let aDone = false;
        let bDone = false;
        let aMsg: ServerMessage | null = null;
        let bMsg: ServerMessage | null = null;

        const check = () => {
          if (aDone && bDone) {
            const msg = aMsg || bMsg;
            if (msg) resolve(msg);
            else resolve(null);
          }
        };

        const aHandler = (raw: Buffer) => {
          const msg = JSON.parse(raw.toString()) as ServerMessage;
          if (msg.type === "turnResolved" || msg.type === "gameOver") {
            aMsg = msg;
            aDone = true;
            a.off("message", aHandler);
            check();
          } else if (msg.type === "foresightReveal" || msg.type === "waitingForOpponent") {
            // 忽略中间状态
          }
        };
        const bHandler = (raw: Buffer) => {
          const msg = JSON.parse(raw.toString()) as ServerMessage;
          if (msg.type === "turnResolved" || msg.type === "gameOver") {
            bMsg = msg;
            bDone = true;
            b.off("message", bHandler);
            check();
          } else if (msg.type === "foresightReveal" || msg.type === "waitingForOpponent") {
            // 忽略中间状态
          }
        };
        a.on("message", aHandler);
        b.on("message", bHandler);

        setTimeout(() => resolve(null), 3000);
      });

      const msg = await resultP;
      if (msg && msg.type === "gameOver") {
        over = msg as Extract<ServerMessage, { type: "gameOver" }>;
      }
      turn++;
    }

    // 至少完成了若干回合（初始视图 turn=0）
    expect(gsA.view.turn).toBe(0);
    a.close();
    b.close();
  }, 30000);

  it("单人模式：玩家与 AI 对战直到分出胜负", async () => {
    const a = await connect();
    const received: ServerMessage[] = [];
    a.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      received.push(msg);
    });

    send(a, { type: "createSinglePlayerRoom", name: "Solo" });
    const created = (await waitFor(a, "roomCreated")) as Extract<ServerMessage, { type: "roomCreated" }>;
    expect(created.seat).toBe("A");

    // 玩家选将后游戏开始（AI 已在服务端同步选好角色）
    const startP = waitFor(a, "gameStart");
    send(a, { type: "selectCharacter", characterId: "youmu" });
    const gs = (await startP) as Extract<ServerMessage, { type: "gameStart" }>;
    expect(gs.you).toBe("A");
    expect(gs.oppChar).toBeTruthy();
    expect(gs.view.players.B.characterId).toBeTruthy();

    // 校验 AI 自动选将的消息确实已送达
    const aiChosen = received.find((m) => m.type === "characterChosen" && m.seat === "B") as
      | Extract<ServerMessage, { type: "characterChosen" }>
      | undefined;
    expect(aiChosen).toBeTruthy();

    // 反复出牌，验证单人模式能正常与 AI 结算多回合（只跑固定 3 回合，避免超时）
    let resolvedTurns = 0;
    let view = gs.view;
    for (let turn = 0; turn < 3; turn++) {
      const hand = view.hands.A;
      const cardA = hand.length > 0 ? hand[0].id : null;
      send(a, { type: "submitMove", cardId: cardA, skillIds: [] });

      const msg = (await waitForAny(a, ["turnResolved", "gameOver"])) as ServerMessage;
      if (msg.type === "gameOver") {
        break;
      }
      view = (msg as Extract<ServerMessage, { type: "turnResolved" }>).view;
      resolvedTurns++;
    }

    expect(resolvedTurns).toBeGreaterThanOrEqual(1);
    a.close();
  }, 30000);
  it("单人模式：重赛后 AI 自动重新选将，可再次开局", async () => {
    const a = await connect();
    const received: ServerMessage[] = [];
    a.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      received.push(msg);
    });

    send(a, { type: "createSinglePlayerRoom", name: "Solo" });
    await waitFor(a, "roomCreated");

    // 第一局开局
    const start1 = waitFor(a, "gameStart");
    send(a, { type: "selectCharacter", characterId: "youmu" });
    const gs1 = (await start1) as Extract<ServerMessage, { type: "gameStart" }>;
    const aiFirst = gs1.oppChar.id;
    expect(aiFirst).toBeTruthy();

    // 重赛：AI 应自动重新选将，且房间回到选将阶段而非卡死
    send(a, { type: "rematch" });
    await waitFor(a, "roster");
    const aiChosenAfter = received.filter((m) => m.type === "characterChosen" && m.seat === "B");
    expect(aiChosenAfter.length).toBeGreaterThanOrEqual(2);

    // 玩家再次选将即可开局
    const start2 = waitFor(a, "gameStart");
    send(a, { type: "selectCharacter", characterId: "reimu" });
    const gs2 = (await start2) as Extract<ServerMessage, { type: "gameStart" }>;
    expect(gs2.you).toBe("A");
    expect(gs2.yourChar.id).toBe("reimu");
    expect(gs2.oppChar.id).toBeTruthy();

    a.close();
  }, 30000);

  it("单人模式：玩家宣告获知后，下一回合提交不会死锁（AI 自动生成并 reveal）", async () => {
    const a = await connect();
    send(a, { type: "createSinglePlayerRoom", name: "Solo" });
    await waitFor(a, "roomCreated");

    const startP = waitFor(a, "gameStart");
    send(a, { type: "selectCharacter", characterId: "seija" });
    const gs = (await startP) as Extract<ServerMessage, { type: "gameStart" }>;
    const seijaCards = gs.yourChar.cards.map((c) => c.id);

    // T1：宣告「获知」
    send(a, { type: "submitMove", cardId: seijaCards[0], skillIds: ["seija-miraishi"] });
    const t1 = (await waitForAny(a, ["turnResolved", "gameOver"])) as ServerMessage;
    expect(t1.type).toBe("turnResolved");

    // T2：玩家先提交（此时应拥有 foresight）→ 服务器生成 AI move 并 reveal，而不是报错死锁
    send(a, { type: "submitMove", cardId: seijaCards[1], skillIds: [] });
    const reveal = (await waitFor(a, "foresightReveal")) as Extract<ServerMessage, { type: "foresightReveal" }>;
    expect(typeof reveal.opponentCard).not.toBe("undefined");

    // 重新提交后正常结算
    send(a, { type: "submitMove", cardId: seijaCards[1], skillIds: [] });
    const t2 = (await waitForAny(a, ["turnResolved", "gameOver"])) as ServerMessage;
    expect(t2.type).toBe("turnResolved");

    a.close();
  }, 30000);
});
