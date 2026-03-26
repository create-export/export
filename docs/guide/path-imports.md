---
description: "Your src/ file structure becomes your API. Each file is importable by its path, and individual exports can be accessed by name."
---

# Path-based Imports

Your `src/` directory structure directly maps to URL paths. Each file becomes its own importable module.

## File → URL mapping

```
src/
├── index.ts          → https://worker.dev/
├── greet.ts          → https://worker.dev/greet
├── Counter.ts        → https://worker.dev/Counter
└── utils/
    └── math.ts       → https://worker.dev/utils/math
```

## Importing a module

```javascript
// Import all exports from src/utils/math.ts
import { multiply, divide, PI } from "https://worker.dev/utils/math";

await multiply(6, 7);  // 42
```

## Importing a specific export

You can append the export name to the module path:

```javascript
// Just the multiply function from src/utils/math.ts
import multiply from "https://worker.dev/utils/math/multiply";

await multiply(6, 7);  // 42
```

## Root module

`src/index.ts` maps to the root URL `/`:

```javascript
import { greet } from "https://worker.dev/";
```

If no file module matches a path, it falls back to looking up exports from the root module. So if `src/greet.ts` doesn't exist but `src/index.ts` exports `greet`, then `/greet` still works.

::: tip Priority
File modules take priority over root exports. If both `src/greet.ts` and an export named `greet` in `src/index.ts` exist, `/greet` serves the file module.
:::

## How it works

At build time, `generate-export-types` scans `src/` and produces a module map:

```javascript
// .export-module-map.js (generated)
import * as _0 from "./src/index.ts";
import * as _1 from "./src/greet.ts";
import * as _2 from "./src/utils/math.ts";
export default { "": _0, "greet": _1, "utils/math": _2 };
```

Wrangler bundles all source files in one pass. The handler uses the map to route requests.

## Type definitions

Each module has its own types:

```bash
curl "https://worker.dev/?types"            # types for src/index.ts
curl "https://worker.dev/utils/math?types"  # types for src/utils/math.ts
```
