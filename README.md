# export

**Seamlessly export functions from Cloudflare Workers as ES modules.**

[![npm version](https://img.shields.io/npm/v/create-export.svg)](https://www.npmjs.com/package/create-export)
[![npm version](https://img.shields.io/npm/v/export-runtime.svg)](https://www.npmjs.com/package/export-runtime)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

```javascript
// Client-side: Just import from your Worker URL
import { greet, add } from "https://my-worker.workers.dev/";

const message = await greet("World");  // "Hello, World!"
const sum = await add(10, 20);         // 30
```

## Features

- **Zero-config client** - Import directly from Worker URL, no SDK needed
- **Type-safe RPC** - Full support for async functions, generators, and nested objects
- **Rich data types** - Date, Map, Set, BigInt, ArrayBuffer, TypedArrays via [devalue](https://github.com/sveltejs/devalue)
- **Streaming** - AsyncIterator support for real-time data
- **Tiny footprint** - ~6KB gzipped client bundle, served from your Worker

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
│   export async function greet(name: string) {                  │
│     return `Hello, ${name}!`;                                  │
│   }                                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP GET: Returns ESM glue code
                              │ WebSocket: RPC over devalue
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Client                                 │
│                                                                 │
│   import { greet } from "https://my-worker.workers.dev/";      │
│   await greet("World");  // "Hello, World!"                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

1. Client imports from Worker URL
2. Worker returns ESM glue code that establishes WebSocket connection
3. Function calls are serialized with [devalue](https://github.com/sveltejs/devalue) and sent over WebSocket
4. Results are returned as promises

## Usage

### Worker Side

Write your functions as normal ES module exports:

```typescript
// src/index.ts

export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

export async function add(a: number, b: number): Promise<number> {
  return a + b;
}

// Nested objects work too
export const math = {
  async multiply(a: number, b: number): Promise<number> {
    return a * b;
  },
  async factorial(n: number): Promise<number> {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  },
};

// AsyncIterators for streaming
export async function* countUp(start: number, end: number): AsyncGenerator<number> {
  for (let i = start; i <= end; i++) {
    await new Promise((r) => setTimeout(r, 100));
    yield i;
  }
}
```

### Client Side

```javascript
import { greet, add, math, countUp } from "https://my-worker.workers.dev/";

// Simple function calls
const message = await greet("World");
const sum = await add(10, 20);

// Nested object methods
const product = await math.multiply(6, 7);
const factorial = await math.factorial(5);

// Streaming with AsyncIterator
for await (const num of await countUp(1, 5)) {
  console.log(num);  // 1, 2, 3, 4, 5
}
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
   - Establishes WebSocket connection
   - Creates Proxy objects for each export
   - Serializes function calls with devalue

2. **WebSocket** handles bidirectional RPC:
   - Client → Worker: `{ type: "call", id, path, args }`
   - Worker → Client: `{ type: "result", id, value }`

3. **devalue** provides rich serialization:
   - Supports Date, Map, Set, BigInt, ArrayBuffer, etc.
   - Handles circular references
   - Smaller and faster than JSON for complex objects

## Requirements

- Node.js 18+
- Cloudflare Workers account (free tier works)

## License

MIT

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) before submitting a PR.

---

<p align="center">
  Built with ❤️ for the edge
</p>
