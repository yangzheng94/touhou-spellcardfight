import type { ClientMessage, ServerMessage } from "./protocol.js";

export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Set<(msg: ServerMessage) => void>();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("连接失败"));
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        for (const h of this.handlers) h(msg);
      };
    });
  }

  on(handler: (msg: ServerMessage) => void): void {
    this.handlers.add(handler);
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
