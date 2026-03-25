import fs from "node:fs";
import path from "node:path";
import { createResult, rootDir } from "./_shared.mjs";

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

export function run() {
  const result = createResult('modularity-audit');
  const files = listFiles(path.join(rootDir, 'app/chat')).filter((file) => file.endsWith('.tsx'));

  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/).length;
    if (lines > 700) {
      result.warnings.push(`${rel} is large (${lines} lines). Consider extracting more view-model and UI sections.`);
    }
    if (/return null;\s*}\s*$/.test(content.trim())) {
      result.warnings.push(`${rel} is still a placeholder component (returns null).`);
    }
  }

  return result;
}
