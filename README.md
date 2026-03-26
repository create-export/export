# export

**Seamlessly export functions from Cloudflare Workers as ES modules.**

[![npm version](https://img.shields.io/npm/v/create-export.svg)](https://www.npmjs.com/package/create-export)
[![npm version](https://img.shields.io/npm/v/export-runtime.svg)](https://www.npmjs.com/package/export-runtime)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

```javascript
// Client-side: Just import from your Worker URL
import { greet, Counter } from "https://my-worker.workers.dev/";

const message = await greet("World");  // "Hello, World!"
const counter = await new Counter(10);
await counter.increment();  // 11
```

## Features

- **Zero-config client** - Import directly from Worker URL, no SDK needed
- **Path-based imports** - `import greet from "https://my-worker.workers.dev/greet"`
- **Classes** - Full class support with Comlink-style instance management
- **Streaming** - ReadableStream, WritableStream, AsyncIterator for real-time data
- **Rich data types** - Date, Map, Set, BigInt, URL, ArrayBuffer, TypedArrays via [devalue](https://github.com/sveltejs/devalue)
- **Precise TypeScript types** - Build-time static analysis with [oxc-parser](https://github.com/nicolo-ribaudo/oxc-parser)
- **Deno support** - Auto-generated types via `X-TypeScript-Types` header
- **Minified & cached** - Core module served with immutable cache, minified with [oxc-minify](https://github.com/nicolo-ribaudo/oxc-minify)
- **Keepalive** - Automatic ping/pong to prevent idle disconnection

## Quick Start

```bash
npm create export my-app
cd my-app
npm install
npm run dev
```

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Worker                             │
│                                                                 │
│   // src/index.ts - Just write normal exports                  │
│   export function greet(name: string) {                        │
│     return `Hello, ${name}!`;                                  │
│   }                                                            │
│   export class Counter { ... }                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP GET: Returns ESM glue code
                              │ WebSocket: RPC over devalue
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Client                                 │
│                                                                 │
│   import { greet, Counter } from "https://my-worker.workers.dev/";
│   await greet("World");         // "Hello, World!"             │
│   const c = await new Counter(0);                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

1. Client imports from Worker URL
2. Worker returns a thin ESM module that imports the core client library
3. Core library establishes a WebSocket connection, serializes calls with [devalue](https://github.com/sveltejs/devalue)
4. Results are returned as promises

## Usage

### Worker Side

Write your functions and classes as normal ES module exports:

```typescript
// src/index.ts

// Sync functions become async on the client
export function add(a: number, b: number): number {
  return a + b;
}

// Async functions work as expected
export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

// Nested objects
export const math = {
  multiply(a: number, b: number): number {
    return a * b;
  },
};

// AsyncIterator for streaming
export async function* countUp(start: number, end: number): AsyncGenerator<number> {
  for (let i = start; i <= end; i++) {
    await new Promise((r) => setTimeout(r, 100));
    yield i;
  }
}

// ReadableStream for large data streaming
export function streamData(count: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= count) { controller.close(); return; }
      controller.enqueue(new TextEncoder().encode(`chunk-${i++}\n`));
    },
  });
}

// Classes with Comlink-style instance management
export class Counter {
  private count: number;

  constructor(initial: number = 0) {
    this.count = initial;
  }

  increment(): number { return ++this.count; }
  decrement(): number { return --this.count; }
  getCount(): number { return this.count; }
}
```

### Client Side

#### Import all exports

```javascript
import { greet, add, math, Counter } from "https://my-worker.workers.dev/";

await greet("World");       // "Hello, World!"
await add(10, 20);          // 30
await math.multiply(6, 7);  // 42
```

#### Import a single export by path

Like [esm.sh](https://esm.sh), you can import individual exports by path:

```javascript
import greet from "https://my-worker.workers.dev/greet";
import Counter from "https://my-worker.workers.dev/Counter";

await greet("World");
const c = await new Counter(0);
```

Both default and named exports are available on each path:

```javascript
import { greet } from "https://my-worker.workers.dev/greet";       // named
import greetDefault from "https://my-worker.workers.dev/greet";    // default
```

#### AsyncIterator

```javascript
import { countUp } from "https://my-worker.workers.dev/";

for await (const num of await countUp(1, 5)) {
  console.log(num);  // 1, 2, 3, 4, 5
}
```

#### ReadableStream

```javascript
import { streamData } from "https://my-worker.workers.dev/";

const stream = await streamData(10);
const reader = stream.getReader();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log(new TextDecoder().decode(value));
}
```

#### Classes

```javascript
import { Counter } from "https://my-worker.workers.dev/";

const counter = await new Counter(10);
console.log(await counter.getCount());   // 10
console.log(await counter.increment());  // 11
console.log(await counter.increment());  // 12

// Explicit cleanup (optional - auto-cleaned on disconnect)
await counter[Symbol.dispose]();
// or: await counter["[release]"]();
```

### Deno Support

Deno automatically fetches type definitions via the `X-TypeScript-Types` header:

```typescript
import { greet, Counter } from "https://my-worker.workers.dev/";

const message = await greet("World");  // Full type inference
```

Types are also available manually:

```bash
curl "https://my-worker.workers.dev/?types"
curl "https://my-worker.workers.dev/greet?types"
```

## Supported Types

All [structured-clonable](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) types are supported via [devalue](https://github.com/sveltejs/devalue):

| Type | Supported |
|------|-----------|
| Primitives (string, number, boolean, null) | ✅ |
| undefined, NaN, Infinity, -0 | ✅ |
| Date | ✅ |
| RegExp | ✅ |
| Map | ✅ |
| Set | ✅ |
| BigInt | ✅ |
| ArrayBuffer | ✅ |
| TypedArrays (Uint8Array, etc.) | ✅ |
| URL | ✅ |
| URLSearchParams | ✅ |
| Nested objects and arrays | ✅ |
| Circular references | ✅ |
| ReadableStream | ✅ |
| WritableStream | ✅ |
| AsyncIterator | ✅ |
| Classes | ✅ |
| Functions | ❌ (use exports) |

## Architecture

### URL Routing

| Endpoint | Content | Cache |
|----------|---------|-------|
| `GET /` | Index module — re-exports all via core | `no-cache` |
| `GET /<name>` | Per-export module — default + named export | `no-cache` |
| `GET /<uuid>.js` | Core module — minified RPC client | `immutable, max-age=1y` |
| `GET /?types` | Full TypeScript definitions | `no-cache` |
| `GET /<name>?types` | Re-export from root types | `no-cache` |
| `WS /` (any path) | WebSocket RPC connection | — |

### Caching Strategy

The core client library (devalue + WebSocket + Proxy infrastructure) is served at a path with a **build-time generated UUID** (e.g., `/<uuid>.js`). This path changes on each deploy, enabling:

- **Immutable caching** (`Cache-Control: public, max-age=31536000, immutable`) for the ~6KB core module
- **Automatic cache busting** on redeploy — new UUID, new path
- **Tiny per-export modules** (~130 bytes) that import from the cached core

### Build-Time Type Generation

Running `generate-export-types` (automatically called by `npm run dev` / `npm run export`) uses [oxc-parser](https://github.com/nicolo-ribaudo/oxc-parser) to statically analyze your TypeScript source and generate precise type definitions:

```typescript
// Instead of: greet(...args: any[]): Promise<any>
// You get:    greet(name: string): Promise<string>
```

The core module is also minified with [oxc-minify](https://github.com/nicolo-ribaudo/oxc-minify), reducing the client payload by ~50%.

### WebSocket RPC Protocol

| Message | Direction | Purpose |
|---------|-----------|---------|
| `ping` / `pong` | Both | Keepalive (30s interval) |
| `call` | Client → Server | Function / method call |
| `construct` | Client → Server | Class instantiation |
| `get` / `set` | Client → Server | Property access on instances |
| `release` | Client → Server | Instance cleanup |
| `iterate-next` / `iterate-return` | Client → Server | AsyncIterator protocol |
| `stream-read` / `stream-cancel` | Client → Server | ReadableStream pull |
| `writable-create` / `writable-write` / `writable-close` / `writable-abort` | Client → Server | WritableStream push |
| `result` / `error` | Server → Client | Response |

## Deployment

```bash
npm run export
```

This runs `generate-export-types` (type generation + minification) then `wrangler deploy`.

## Project Structure

```
my-app/
├── src/
│   └── index.ts          # Your exports
├── .export-types.js       # Generated (types + minified core + UUID)
├── package.json
├── wrangler.toml
└── tsconfig.json
```

## Testing

```bash
npm test
```

Runs 106 E2E tests against a live Wrangler dev server covering HTTP routing, type generation, WebSocket RPC, class instances, streams, iterators, devalue serialization, concurrency, and edge cases.

## Packages

| Package | Description |
|---------|-------------|
| [create-export](https://www.npmjs.com/package/create-export) | CLI to scaffold new projects |
| [export-runtime](https://www.npmjs.com/package/export-runtime) | Runtime that powers the RPC |

## Requirements

- Node.js 18+
- Cloudflare Workers account (free tier works)

## License

MIT
