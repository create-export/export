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

export const createHandler = (exports) => {
  const exportKeys = Object.keys(exports);
  const iteratorStore = new Map();
  let nextIteratorId = 1;

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
            const { type, id, path = [], args = [], iteratorId } = msg;

            if (type === "call") {
              try {
                const fn = getByPath(exports, path);
                if (typeof fn !== "function") {
                  send(server, { type: "error", id, error: `${path.join(".")} is not a function` });
                  return;
                }
                const result = await fn.apply(undefined, args);

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
