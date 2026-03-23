#!/usr/bin/env node

import * as p from "@clack/prompts";
import mri from "mri";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = mri(process.argv.slice(2), {
  alias: {
    t: "template",
    h: "help",
  },
  string: ["template"],
  boolean: ["help"],
});

if (argv.help) {
  console.log(`
Usage: npm create export [project-name] [options]

Options:
  -t, --template <type>  Template type: typescript | javascript
  -h, --help             Show this help message

Examples:
  npm create export my-app
  npm create export my-app --template typescript
  npm create export my-app -t javascript
`);
  process.exit(0);
}

p.intro("create-export");

let projectName = argv._[0];
let template = argv.template;

if (!projectName) {
  const result = await p.text({
    message: "Project name:",
    placeholder: "my-export-app",
    defaultValue: "my-export-app",
    validate: (value) => {
      if (!value) return "Project name is required";
      if (existsSync(resolve(process.cwd(), value))) {
        return `Directory "${value}" already exists`;
      }
    },
  });

  if (p.isCancel(result)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  projectName = result || "my-export-app";
}

const targetDir = resolve(process.cwd(), projectName);

if (existsSync(targetDir)) {
  p.cancel(`Directory "${projectName}" already exists.`);
  process.exit(1);
}

if (!template) {
  const result = await p.select({
    message: "Select a template:",
    options: [
      { value: "typescript", label: "TypeScript", hint: "recommended" },
      { value: "javascript", label: "JavaScript" },
    ],
  });

  if (p.isCancel(result)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  template = result;
}

if (template !== "typescript" && template !== "javascript") {
  p.cancel(`Invalid template: ${template}. Use "typescript" or "javascript".`);
  process.exit(1);
}

const s = p.spinner();
s.start("Creating project...");

const templateDir = join(__dirname, `template-${template}`);

mkdirSync(targetDir, { recursive: true });
cpSync(templateDir, targetDir, { recursive: true });

// Update project package.json
const pkgPath = join(targetDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
pkg.name = projectName;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Update wrangler.toml
const wranglerPath = join(targetDir, "wrangler.toml");
const wranglerContent = readFileSync(wranglerPath, "utf-8");
writeFileSync(wranglerPath, wranglerContent.replace('name = "my-export-app"', `name = "${projectName}"`));

s.stop("Project created!");

p.note(
  `cd ${projectName}
npm install
npm run dev     # Start local development
npm run export  # Deploy to Cloudflare Workers`,
  "Next steps"
);

p.outro(`Import from your Worker URL:

  import { greet, add } from "https://${projectName}.workers.dev/";
  const message = await greet("World");
`);
