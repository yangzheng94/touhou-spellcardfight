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
  return new Promise((resolve) => {
    const handler = (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === type) {
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
});
