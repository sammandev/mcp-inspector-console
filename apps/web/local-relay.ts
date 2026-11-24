import { JSONRPCMessageSchema } from "@modelcontextprotocol/core";
import type { z } from "zod";
import which from "which";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { serverConfigurationSchema } from "./src/features/model.js";

const base = "/mcp/inspector/api/local";
const encoder = new TextEncoder();
type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;
type Pending = { resolve: (message: JSONRPCMessage) => void; reject: (error: Error) => void };
type Session = {
  transport: StdioClientTransport;
  pending: Map<string, Pending>;
  streams: Set<ReadableStreamDefaultController<Uint8Array>>;
  queued: JSONRPCMessage[];
  stderr: string;
  error?: string;
  closed: boolean;
  command: string;
  cwd?: string;
  createdAt: string;
};
const key = (id: string | number) => `${typeof id}:${id}`;
const event = (message: JSONRPCMessage) => encoder.encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`);

export function createLocalRelay() {
  const sessions = new Map<string, Session>();
  let launching = 0;
  const terminate = (session: Session, error: Error) => {
    session.closed = true;
    for (const pending of session.pending.values()) pending.reject(error);
    session.pending.clear();
    for (const stream of session.streams) stream.close();
    session.streams.clear();
  };
  async function stop(id: string, session: Session) {
    sessions.delete(id);
    terminate(session, new Error("Local process stopped"));
    const pid = session.transport.pid;
    if (process.platform === "win32" && pid !== null) {
      // Target only this explicitly launched process and its descendants.
      await promisify(execFile)("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 5000 }).catch((error: Error) => {
        if (!session.closed || session.transport.pid !== null) throw error;
      });
    }
    await session.transport.close();
  }
  async function forward(session: Session, message: JSONRPCMessage, signal: AbortSignal) {
    if (session.closed) throw new Error(session.error || "Local process is no longer running");
    if (!("method" in message) || !("id" in message)) {
      await session.transport.send(message);
      return new Response(null, { status: 202 });
    }
    const id = key(message.id);
    if (session.pending.has(id)) return Response.json({ error: "Duplicate in-flight request ID" }, { status: 409 });
    if (session.pending.size >= 128) return Response.json({ error: "Too many pending requests" }, { status: 429 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      const response = new Promise<JSONRPCMessage>((resolve, reject) => {
        session.pending.set(id, { resolve, reject });
        timer = setTimeout(() => reject(new Error("Local request timed out")), 30_000);
        abort = () => reject(new Error("Local request cancelled"));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
      const [result] = await Promise.all([response, session.transport.send(message)]);
      return Response.json(result);
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) signal.removeEventListener("abort", abort);
      session.pending.delete(id);
    }
  }
  async function handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === base && request.method === "GET") {
      return Response.json({ sessions: [...sessions].map(([id, session]) => ({
        id, pid: session.transport.pid, command: session.command, cwd: session.cwd, createdAt: session.createdAt,
        closed: session.closed, error: session.error, pending: session.pending.size, queued: session.queued.length, streams: session.streams.size,
      })) });
    }
    if (path === base && request.method === "POST") {
      if (sessions.size + launching >= 8) return Response.json({ error: "At most eight local processes may run" }, { status: 429 });
      launching++;
      let transport: StdioClientTransport | undefined;
      try {
        const config = serverConfigurationSchema.parse(await request.json());
        if (!config.command) throw new Error("A stdio command is required");
        const command = await which(config.command, { path: config.env?.PATH ?? getDefaultEnvironment().PATH });
        transport = new StdioClientTransport({
          command, args: config.args, env: { ...getDefaultEnvironment(), ...config.env }, cwd: config.cwd,
          stderr: "pipe", maxBufferSize: 1_048_576,
        });
        const session: Session = {
          transport, pending: new Map(), streams: new Set(), queued: [], stderr: "", closed: false,
          command: config.command, cwd: config.cwd, createdAt: new Date().toISOString(),
        };
        transport.stderr?.on("data", (chunk: Buffer) => { session.stderr = (session.stderr + chunk.toString()).slice(-65536); });
        transport.onerror = (error) => {
          session.error = error.message;
          console.error("Local MCP transport failed:", error);
          terminate(session, error);
        };
        transport.onclose = () => terminate(session, new Error("Local process exited"));
        transport.onmessage = (message) => {
          if (!("method" in message) && "id" in message && message.id !== undefined) {
            session.pending.get(key(message.id))?.resolve(message);
            return;
          }
          if (session.streams.size) {
            for (const stream of session.streams) stream.enqueue(event(message));
          } else {
            session.queued.push(message);
            if (session.queued.length > 128) {
              const error = new Error("Local notification queue overflow; reconnect the server");
              session.error = error.message;
              terminate(session, error);
            }
          }
        };
        await transport.start();
        if (request.signal.aborted || session.closed) throw new Error(session.error || "Local launch cancelled");
        const id = randomUUID();
        sessions.set(id, session);
        return Response.json({ id, pid: transport.pid }, { status: 201 });
      } catch (error) {
        if (transport) await transport.close();
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      } finally { launching--; }
    }
    const match = /^\/mcp\/inspector\/api\/local\/([a-f0-9-]+)(\/mcp)?$/.exec(path);
    const session = match && sessions.get(match[1]);
    if (!match || !session) return Response.json({ error: "Unknown local session" }, { status: 404 });
    try {
      if (request.method === "DELETE") {
        await stop(match[1], session);
        return new Response(null, { status: 204 });
      }
      if (!match[2] && request.method === "GET") {
        return Response.json({ id: match[1], pid: session.transport.pid, stderr: session.stderr, error: session.error, closed: session.closed });
      }
      if (match[2] && request.method === "POST") {
        return await forward(session, JSONRPCMessageSchema.parse(await request.json()), request.signal);
      }
      if (match[2] && request.method === "GET") {
        if (session.closed) throw new Error(session.error || "Local process has exited");
        let controller: ReadableStreamDefaultController<Uint8Array>;
        const abort = () => { if (session.streams.delete(controller)) controller.close(); };
        const body = new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
            session.streams.add(controller);
            for (const message of session.queued.splice(0)) controller.enqueue(event(message));
            request.signal.addEventListener("abort", abort, { once: true });
            if (request.signal.aborted) abort();
          },
          cancel() { session.streams.delete(controller); request.signal.removeEventListener("abort", abort); },
        });
        return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
      }
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
    }
  }
  return { handle, close: async () => { await Promise.all([...sessions].map(([id, session]) => stop(id, session))); } };
}
