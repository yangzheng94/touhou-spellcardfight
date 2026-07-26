import { WebSocket } from "ws";

const PORT = 8080;
type Any = Record<string, unknown>;

function connect(): Promise<WebSocket> {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on("open", () => res(ws));
  });
}
function next(ws: WebSocket, type: string): Promise<Any> {
  return new Promise((res) => {
    const h = (raw: Buffer) => {
      const m = JSON.parse(raw.toString());
      if (m.type === type) {
        ws.off("message", h);
        res(m);
      }
    };
    ws.on("message", h);
  });
}
const send = (ws: WebSocket, m: Any) => ws.send(JSON.stringify(m));

const a = await connect();
const b = await connect();
send(a, { type: "createRoom" });
const created = await next(a, "roomCreated");
send(b, { type: "joinRoom", roomId: created.roomId });
await next(b, "joined");

const gsAP = next(a, "gameStart");
send(a, { type: "selectCharacter", characterId: "flandre" });
send(b, { type: "selectCharacter", characterId: "reimu" });
const gsA = (await gsAP) as Any;
const yourChar = gsA.yourChar as Any;
const oppChar = gsA.oppChar as Any;
console.log(`对战开始: ${(yourChar.name as string)} vs ${(oppChar.name as string)}`);

let turn = 0;
let over: Any | null = null;
while (turn < 10 && !over) {
  const overP = Promise.race([next(a, "gameOver"), new Promise<null>((r) => setTimeout(() => r(null), 300))]);
  const resP = next(a, "turnResolved");
  const cardsA = yourChar.cards as Any[];
  const cardsB = oppChar.cards as Any[];
  send(a, { type: "submitMove", cardId: cardsA[turn % cardsA.length].id, skillIds: [] });
  send(b, { type: "submitMove", cardId: cardsB[turn % cardsB.length].id, skillIds: [] });
  const maybe = await overP;
  if (maybe) over = maybe as Any;
  else {
    const res = (await resP) as Any;
    const view = res.view as Any;
    const players = view.players as Any;
    const pa = players.A as Any;
    const pb = players.B as Any;
    console.log(`T${view.turn}: A(${yourChar.name}) HP=${pa.hp}  B(${oppChar.name}) HP=${pb.hp}`);
  }
  turn++;
}
if (over) {
  const winner = over.winner as string;
  console.log(`游戏结束，胜者: ${winner}`);
} else {
  console.log(`打满 ${turn} 回合（符卡耗尽/未分胜负）`);
}
a.close();
b.close();
process.exit(0);
