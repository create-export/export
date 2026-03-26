import { stringify, parse } from "devalue";
import { CLIENT_CODE, DEVALUE_PARSE, DEVALUE_STRINGIFY } from "./client.js";

const getByPath = (obj, path) => {
  let current = obj;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
};

const isAsyncIterable = (value) =>
  value != null && typeof value[Symbol.asyncIterator] === "function";

const isReadableStream = (value) =>
  value != null && typeof value.getReader === "function" && typeof value.pipeTo === "function";

const isClass = (fn) =>
  typeof fn === "function" && /^class\s/.test(Function.prototype.toString.call(fn));

// Generate TypeScript type definitions from exports
const generateTypeDefinitions = (exports, exportKeys) => {
  const lines = [
    "// Auto-generated type definitions",
    "// All functions are async over the network",
    "",
  ];

  const generateType = (value, name, indent = "") => {
    if (isClass(value)) {
      // Extract class method names
      const proto = value.prototype;
      const methodNames = Object.getOwnPropertyNames(proto).filter(
        (n) => n !== "constructor" && typeof proto[n] === "function"
      );

      lines.push(`${indent}export declare class ${name} {`);
      lines.push(`${indent}  constructor(...args: any[]);`);
      for (const method of methodNames) {
        lines.push(`${indent}  ${method}(...args: any[]): Promise<any>;`);
      }
      lines.push(`${indent}  [Symbol.dispose](): Promise<void>;`);
      lines.push(`${indent}  "[release]"(): Promise<void>;`);
      lines.push(`${indent}}`);
    } else if (typeof value === "function") {
      // Check if it's an async generator
      const fnStr = Function.prototype.toString.call(value);
      if (fnStr.startsWith("async function*") || fnStr.includes("async *")) {
        lines.push(
          `${indent}export declare function ${name}(...args: any[]): Promise<AsyncIterable<any>>;`
        );
      } else if (fnStr.includes("ReadableStream")) {
        lines.push(
          `${indent}export declare function ${name}(...args: any[]): Promise<ReadableStream<any>>;`
        );
      } else {
        lines.push(
          `${indent}export declare function ${name}(...args: any[]): Promise<any>;`
        );
      }
    } else if (typeof value === "object" && value !== null) {
      // Nested object with methods
      const keys = Object.keys(value);
      lines.push(`${indent}export declare const ${name}: {`);
      for (const key of keys) {
        const v = value[key];
        if (typeof v === "function") {
          lines.push(`${indent}  ${key}(...args: any[]): Promise<any>;`);
        } else {
          lines.push(`${indent}  ${key}: any;`);
        }
      }
      lines.push(`${indent}};`);
    } else {
      lines.push(`${indent}export declare const ${name}: any;`);
    }
  };

  for (const key of exportKeys) {
    generateType(exports[key], key);
    lines.push("");
  }

  // Add createUploadStream helper type
  lines.push("export declare function createUploadStream(): Promise<{");
  lines.push("  stream: WritableStream<any>;");
  lines.push("  writableId: number;");
  lines.push("}>;");

  return lines.join("\n");
};

export const createHandler = (exports, generatedTypes) => {
  const exportKeys = Object.keys(exports);
  const iteratorStore = new Map();
  const instanceStore = new Map();
  const streamStore = new Map();
  const writableStreamStore = new Map();
  let nextIteratorId = 1;
  let nextInstanceId = 1;
  let nextStreamId = 1;

  const send = (ws, data) => {
    ws.send(stringify(data));
  };

  return {
    async fetch(request) {
      const url = new URL(request.url);
      const upgradeHeader = request.headers.get("Upgrade");

      if (upgradeHeader === "websocket") {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        server.accept();

        server.addEventListener("message", async (event) => {
          try {
            const msg = parse(event.data);
            const { type, id, path = [], args = [], iteratorId, instanceId } = msg;

            // Keepalive ping/pong
            if (type === "ping") {
              send(server, { type: "pong", id });
              return;
            }

            if (type === "construct") {
              // Class instantiation
              try {
                const Ctor = getByPath(exports, path);
                if (!isClass(Ctor)) {
                  send(server, { type: "error", id, error: `${path.join(".")} is not a class` });
                  return;
                }
                const instance = new Ctor(...args);
                const instId = nextInstanceId++;
                instanceStore.set(instId, instance);
                send(server, { type: "result", id, instanceId: instId, valueType: "instance" });
              } catch (err) {
                send(server, { type: "error", id, error: String(err) });
              }
            } else if (type === "call") {
              try {
                let target;
                let thisArg;

                if (instanceId !== undefined) {
                  // Method call on instance
                  const instance = instanceStore.get(instanceId);
                  if (!instance) {
                    send(server, { type: "error", id, error: "Instance not found" });
                    return;
                  }
                  target = getByPath(instance, path);
                  thisArg = path.length > 1 ? getByPath(instance, path.slice(0, -1)) : instance;
                } else {
                  // Regular function call
                  target = getByPath(exports, path);
                  thisArg = path.length > 1 ? getByPath(exports, path.slice(0, -1)) : undefined;
                }

                if (typeof target !== "function") {
                  send(server, { type: "error", id, error: `${path.join(".")} is not a function` });
                  return;
                }

                // Await result to support both sync and async functions
                const result = await target.apply(thisArg, args);

                if (isReadableStream(result)) {
                  const streamId = nextStreamId++;
                  streamStore.set(streamId, { stream: result, reader: null });
                  send(server, { type: "result", id, streamId, valueType: "readablestream" });
                } else if (isAsyncIterable(result)) {
                  const iterId = nextIteratorId++;
                  iteratorStore.set(iterId, result[Symbol.asyncIterator]());
                  send(server, { type: "result", id, iteratorId: iterId, valueType: "asynciterator" });
                } else if (typeof result === "function") {
                  send(server, { type: "result", id, path: [...path], valueType: "function" });
                } else {
                  send(server, { type: "result", id, value: result });
                }
              } catch (err) {
                send(server, { type: "error", id, error: String(err) });
              }
            } else if (type === "get") {
              // Property access on instance
              try {
                const instance = instanceStore.get(instanceId);
                if (!instance) {
                  send(server, { type: "error", id, error: "Instance not found" });
                  return;
                }
                const value = getByPath(instance, path);
                if (typeof value === "function") {
                  send(server, { type: "result", id, valueType: "function" });
                } else {
                  send(server, { type: "result", id, value });
                }
              } catch (err) {
                send(server, { type: "error", id, error: String(err) });
              }
            } else if (type === "set") {
              // Property assignment on instance
              try {
                const instance = instanceStore.get(instanceId);
                if (!instance) {
                  send(server, { type: "error", id, error: "Instance not found" });
                  return;
                }
                const parent = path.length > 1 ? getByPath(instance, path.slice(0, -1)) : instance;
                const prop = path[path.length - 1];
                parent[prop] = args[0];
                send(server, { type: "result", id, value: true });
              } catch (err) {
                send(server, { type: "error", id, error: String(err) });
              }
            } else if (type === "release") {
              // Release instance
              instanceStore.delete(instanceId);
              send(server, { type: "result", id, value: true });
            } else if (type === "iterate-next") {
              const iter = iteratorStore.get(iteratorId);
              if (!iter) {
                send(server, { type: "error", id, error: "Iterator not found" });
                return;
              }
              try {
                const { value, done } = await iter.next();
                if (done) iteratorStore.delete(iteratorId);
                send(server, { type: "iterate-result", id, value, done: !!done });
              } catch (err) {
                send(server, { type: "error", id, error: String(err) });
              }
            } else if (type === "iterate-return") {
              const iter = iteratorStore.get(iteratorId);
              if (iter?.return) await iter.return(undefined);
              iteratorStore.delete(iteratorId);
              send(server, { type: "iterate-result", id, value: undefined, done: true });
            } else if (type === "stream-read") {
              // ReadableStream chunk read
              const { streamId } = msg;
              const entry = streamStore.get(streamId);
              if (!entry) {
                send(server, { type: "error", id, error: "Stream not found" });
                return;
              }
              try {
                // Get or create reader for this stream
                let reader = entry.reader;
                if (!reader) {
                  reader = entry.stream.getReader();
                  entry.reader = reader;
                }
                const { value, done } = await reader.read();
                if (done) {
                  streamStore.delete(streamId);
                }
                // Convert Uint8Array to array for devalue serialization
                const serializedValue = value instanceof Uint8Array ? Array.from(value) : value;
                send(server, { type: "stream-result", id, value: serializedValue, done: !!done });
              } catch (err) {
                streamStore.delete(streamId);
                send(server, { type: "error", id, error: String(err) });
              }
            } else if (type === "stream-cancel") {
              // Cancel ReadableStream
              const { streamId } = msg;
              const entry = streamStore.get(streamId);
              if (entry) {
                try {
                  if (entry.reader) {
                    await entry.reader.cancel();
                  } else {
                    await entry.stream.cancel();
                  }
                } catch (e) { /* ignore */ }
                streamStore.delete(streamId);
              }
              send(server, { type: "result", id, value: true });
            } else if (type === "writable-create") {
              // Create a WritableStream on server side
              const { targetPath, targetInstanceId } = msg;
              let chunks = [];
              const writableId = nextStreamId++;

              const writable = new WritableStream({
                write(chunk) {
                  chunks.push(chunk);
                },
                close() {
                  // Resolve with all chunks when stream closes
                },
                abort(reason) {
                  chunks = [];
                }
              });

              writableStreamStore.set(writableId, { writable, chunks, targetPath, targetInstanceId });
              send(server, { type: "result", id, writableId, valueType: "writablestream" });
            } else if (type === "writable-write") {
              // Write chunk to WritableStream
              const { writableId, chunk } = msg;
              const entry = writableStreamStore.get(writableId);
              if (!entry) {
                send(server, { type: "error", id, error: "WritableStream not found" });
                return;
              }
              try {
                // Convert array back to Uint8Array if needed
                const data = Array.isArray(chunk) ? new Uint8Array(chunk) : chunk;
                entry.chunks.push(data);
                send(server, { type: "result", id, value: true });
              } catch (err) {
                send(server, { type: "error", id, error: String(err) });
              }
            } else if (type === "writable-close") {
              // Close WritableStream and return collected chunks
              const { writableId } = msg;
              const entry = writableStreamStore.get(writableId);
              if (!entry) {
                send(server, { type: "error", id, error: "WritableStream not found" });
                return;
              }
              writableStreamStore.delete(writableId);
              // Return the collected data
              send(server, { type: "result", id, value: entry.chunks });
            } else if (type === "writable-abort") {
              // Abort WritableStream
              const { writableId } = msg;
              writableStreamStore.delete(writableId);
              send(server, { type: "result", id, value: true });
            }
          } catch (err) {
            console.error("WebSocket message error:", err);
          }
        });

        server.addEventListener("close", () => {
          iteratorStore.clear();
          instanceStore.clear();
          streamStore.clear();
          writableStreamStore.clear();
        });

        return new Response(null, { status: 101, webSocket: client });
      }

      const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${url.host}${url.pathname}`;

      // Serve TypeScript type definitions
      if (url.searchParams.has("types") || url.pathname.endsWith(".d.ts")) {
        const typeDefinitions = generatedTypes || generateTypeDefinitions(exports, exportKeys);
        return new Response(typeDefinitions, {
          headers: {
            "Content-Type": "application/typescript; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
          },
        });
      }

      // Generate named exports
      const namedExports = exportKeys
        .map((key) => `export const ${key} = createProxy([${JSON.stringify(key)}]);`)
        .join("\n");

      const clientCode = CLIENT_CODE
        .replace("__WS_URL__", JSON.stringify(wsUrl))
        .replace("__DEVALUE_STRINGIFY__", DEVALUE_STRINGIFY)
        .replace("__DEVALUE_PARSE__", DEVALUE_PARSE)
        .replace("__NAMED_EXPORTS__", namedExports);

      // Build types URL for X-TypeScript-Types header
      const typesUrl = `${url.protocol}//${url.host}${url.pathname}?types`;

      return new Response(clientCode, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
          "X-TypeScript-Types": typesUrl,
        },
      });
    },
  };
};
