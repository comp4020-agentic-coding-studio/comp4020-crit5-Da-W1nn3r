#!/usr/bin/env node
// Bare site: dist/ is a straight copy of the authored HTML/CSS/JS, not a
// bundle --- what you write is what ships. Anything that isn't part of the
// deployed site (repo metadata, checks, process docs) is excluded by name.
import { cpSync, readdirSync, rmSync } from "node:fs";

const EXCLUDE = new Set([
  ".git",
  ".github",
  ".githooks",
  "node_modules",
  "dist",
  "spec",
  "scripts",
  "reflections",
  "PROCESS.md",
  "README.md",
  "CLAUDE.md",
  "AGENTS.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "mise.toml",
  ".gitignore",
  ".gitattributes",
]);

rmSync("dist", { recursive: true, force: true });

for (const entry of readdirSync(".", { withFileTypes: true })) {
  if (entry.name.startsWith(".") || EXCLUDE.has(entry.name)) continue;
  cpSync(entry.name, `dist/${entry.name}`, { recursive: true });
}
