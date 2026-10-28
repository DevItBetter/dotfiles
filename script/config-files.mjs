import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function writeChanged(path, before, content, mode) {
  if (before === content) return;
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== before) throw new Error(`${path} changed during configuration. Retry.`);
    let backup = path + ".before-dotfiles-agents";
    for (let count = 1; existsSync(backup); count++) backup = path + `.before-dotfiles-agents.${count}`;
    writeFileSync(backup, before, { flag: "wx", mode: 0o600 });
    console.log(`Backup: ${backup}`);
  }
  const temporary = path + `.dotfiles-${process.pid}`;
  writeFileSync(temporary, content, { flag: "wx", mode });
  renameSync(temporary, path);
}
