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

const isClass = (fn) =>
  typeof fn === "function" && /^class\s/.test(Function.prototype.toString.call(fn));

export const createHandler = (exports) => {
  const exportKeys = Object.keys(exports);
  const iteratorStore = new Map();
  const instanceStore = new Map();
  let nextIteratorId = 1;
  let nextInstanceId = 1;

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

                if (isAsyncIterable(result)) {
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
            }
          } catch (err) {
            console.error("WebSocket message error:", err);
          }
        });

        server.addEventListener("close", () => {
          iteratorStore.clear();
          instanceStore.clear();
        });

        return new Response(null, { status: 101, webSocket: client });
      }

      const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${url.host}${url.pathname}`;

      // Generate named exports
      const namedExports = exportKeys
        .map((key) => `export const ${key} = createProxy([${JSON.stringify(key)}]);`)
        .join("\n");

      const clientCode = CLIENT_CODE
        .replace("__WS_URL__", JSON.stringify(wsUrl))
        .replace("__DEVALUE_STRINGIFY__", DEVALUE_STRINGIFY)
        .replace("__DEVALUE_PARSE__", DEVALUE_PARSE)
        .replace("__NAMED_EXPORTS__", namedExports);

      return new Response(clientCode, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    },
  };
};
