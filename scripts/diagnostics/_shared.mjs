import fs from "node:fs";
import path from "node:path";

export const rootDir = process.cwd();
export const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
export const readText = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

export function printSection(title) {
  console.log(`
=== ${title} ===`);
}

export function createResult(name) {
  return { name, errors: [], warnings: [], info: [] };
}

export function printResult(result) {
  printSection(result.name);
  for (const item of result.info) console.log(`[info] ${item}`);
  for (const item of result.warnings) console.log(`[warn] ${item}`);
  for (const item of result.errors) console.log(`[error] ${item}`);
  if (!result.errors.length && !result.warnings.length && !result.info.length) {
    console.log('[ok] no findings');
  }
}
