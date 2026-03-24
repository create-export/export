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
- **Classes** - Full class support with Comlink-style instance management
- **Streaming** - ReadableStream, AsyncIterator for real-time data
- **Rich data types** - Date, Map, Set, BigInt, ArrayBuffer, TypedArrays via [devalue](https://github.com/sveltejs/devalue)
- **Deno support** - Auto-generated types via `X-TypeScript-Types` header
- **Keepalive** - Automatic ping/pong to prevent idle disconnection
- **Tiny footprint** - Lightweight client bundle served from your Worker

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
2. Worker returns ESM glue code that establishes WebSocket connection
3. Function calls are serialized with [devalue](https://github.com/sveltejs/devalue) and sent over WebSocket
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
  factorial(n: number): number {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
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
      if (i >= count) {
        controller.close();
        return;
      }
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

  increment(): number {
    return ++this.count;
  }

  decrement(): number {
    return --this.count;
  }

  getCount(): number {
    return this.count;
  }
}
```

### Client Side

```javascript
import { greet, add, math, countUp, streamData, Counter } from "https://my-worker.workers.dev/";

// Function calls (sync functions become async)
const message = await greet("World");
const sum = await add(10, 20);

// Nested object methods
const product = await math.multiply(6, 7);
const factorial = await math.factorial(5);

// AsyncIterator streaming
for await (const num of await countUp(1, 5)) {
  console.log(num);  // 1, 2, 3, 4, 5
}

// ReadableStream
const stream = await streamData(10);
const reader = stream.getReader();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log(new TextDecoder().decode(value));
}

// Class instantiation
const counter = await new Counter(10);
console.log(await counter.getCount());   // 10
console.log(await counter.increment());  // 11
console.log(await counter.increment());  // 12
console.log(await counter.decrement());  // 11

// Release instance when done (optional, cleaned up on disconnect)
await counter["[release]"]();
```

### Deno Support

Deno automatically fetches type definitions via the `X-TypeScript-Types` header:

```typescript
// Deno will auto-fetch types from https://my-worker.workers.dev/?types
import { greet, Counter } from "https://my-worker.workers.dev/";

const message = await greet("World");  // Type inference works!
```

You can also fetch types directly:

```bash
curl "https://my-worker.workers.dev/?types"
```

## Supported Types

All [structured-clonable](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) types are supported via [devalue](https://github.com/sveltejs/devalue):

| Type | Supported |
|------|-----------|
| Primitives (string, number, boolean, null) | ✅ |
| undefined | ✅ |
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
| AsyncIterator | ✅ |
| Classes | ✅ |
| Functions | ❌ (use exports) |

## Deployment

```bash
npm run export
```

This deploys your Worker to Cloudflare using [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

## Project Structure

```
my-app/
├── src/
│   └── index.ts       # Your exports (just write functions!)
├── package.json
├── wrangler.toml      # Cloudflare Workers config
└── tsconfig.json      # TypeScript config (if using TS)
```

## Packages

| Package | Description |
|---------|-------------|
| [create-export](https://www.npmjs.com/package/create-export) | CLI to scaffold new projects |
| [export-runtime](https://www.npmjs.com/package/export-runtime) | Runtime that powers the RPC |

## How It Works (Technical)

1. **HTTP GET** to Worker URL returns dynamically generated ESM that:
   - Establishes WebSocket connection with automatic keepalive (30s ping)
   - Creates Proxy objects for each export
   - Serializes function calls with devalue

2. **WebSocket** handles bidirectional RPC:
   - Function calls: `{ type: "call", path, args }` → `{ type: "result", value }`
   - Class instantiation: `{ type: "construct", path, args }` → `{ type: "result", instanceId }`
   - Instance methods: `{ type: "call", instanceId, path, args }` → `{ type: "result", value }`
   - Streaming: `{ type: "stream-read", streamId }` → `{ type: "stream-result", value, done }`
   - Keepalive: `{ type: "ping" }` → `{ type: "pong" }`

3. **devalue** provides rich serialization:
   - Supports Date, Map, Set, BigInt, ArrayBuffer, etc.
   - Handles circular references
   - Smaller and faster than JSON for complex objects

4. **Type definitions** served via `X-TypeScript-Types` header:
   - Auto-generated from exports at runtime
   - Full Deno compatibility

## Requirements

- Node.js 18+
- Cloudflare Workers account (free tier works)

## License

MIT

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) before submitting a PR.

---

<p align="center">
  Built with care for the edge
</p>
