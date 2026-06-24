#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SELF = "run-all.mjs";

const files = (await readdir(TESTS_DIR))
  .filter((name) => name.endsWith(".test.mjs") && name !== SELF)
  .sort();

if (files.length === 0) {
  console.error("No test files matching *.test.mjs found in tests/.");
  process.exit(1);
}

const results = [];
for (const file of files) {
  const path = join(TESTS_DIR, file);
  process.stdout.write(`\n=== ${file} ===\n`);
  const code = await runNode(path);
  results.push({ file, code });
}

const failed = results.filter((entry) => entry.code !== 0);

process.stdout.write("\n=== Summary ===\n");
for (const { file, code } of results) {
  process.stdout.write(`${code === 0 ? "PASS" : "FAIL"}  ${file}${code === 0 ? "" : ` (exit ${code})`}\n`);
}

if (failed.length > 0) {
  process.stdout.write(`\n${failed.length} of ${results.length} test file(s) failed.\n`);
  process.exit(1);
}

process.stdout.write(`\nAll ${results.length} test files passed.\n`);

function runNode(path) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path], { stdio: "inherit" });
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(128);
        return;
      }
      resolve(code ?? 1);
    });
    child.on("error", (error) => {
      console.error(`Failed to spawn ${path}: ${error.message}`);
      resolve(1);
    });
  });
}
