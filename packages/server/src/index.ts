import { startServer } from "./room.js";

const PORT = Number(process.env.PORT ?? 8080);
startServer(PORT);
