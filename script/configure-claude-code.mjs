import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { writeChanged } from "./configure-vscode.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const SHELL = "/bin/bash";
export const hookCommand = `/bin/bash ${quote(join(root, "script/claude-code-env.sh"))}`;

// Claude Code itself rewrites settings.json as plain JSON, so formatting follows its style.
export function updateClaudeSettings(text, command = hookCommand) {
  const data = text.trim() ? JSON.parse(text) : {};
  if (!isObject(data)) throw new Error("Claude Code settings must be a JSON object.");
  const env = data.env ?? {};
  if (!isObject(env)) throw new Error("Settings env must be an object.");
  if (env.CLAUDE_CODE_SHELL !== undefined && env.CLAUDE_CODE_SHELL !== SHELL) {
    throw new Error(`Existing env.CLAUDE_CODE_SHELL differs (${env.CLAUDE_CODE_SHELL}). Review it before replacing it.`);
  }
  const hooks = data.hooks ?? {};
  if (!isObject(hooks)) throw new Error("Settings hooks must be an object.");
  const sessionStart = hooks.SessionStart ?? [];
  if (!Array.isArray(sessionStart)) throw new Error("Settings hooks.SessionStart must be an array.");
  const present = sessionStart.some((group) =>
    group?.hooks?.some?.((hook) => hook?.type === "command" && hook.command === command));
  data.env = { ...env, CLAUDE_CODE_SHELL: SHELL };
  data.hooks = { ...hooks, SessionStart: present ? sessionStart :
    [...sessionStart, { hooks: [{ type: "command", command }] }] };
  const after = JSON.stringify(data, null, 2) + "\n";
  return text.trim() && JSON.stringify(JSON.parse(text)) === JSON.stringify(data) ? text : after;
}

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    "dry-run": { type: "boolean" }, settings: { type: "string" }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log("Usage: node script/configure-claude-code.mjs [--dry-run] [--settings PATH]");
    console.log("Sets Claude Code's Bash tool to /bin/bash and adds a SessionStart hook that applies the shared agent command environment.");
    return;
  }
  if (!["linux", "darwin"].includes(process.platform)) throw new Error("Use this integration on Linux, WSL, or macOS.");
  const home = process.env.HOME || homedir();
  const settings = resolve(values.settings ||
    join(process.env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "settings.json"));
  let link = false;
  try { link = lstatSync(settings).isSymbolicLink(); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (link) throw new Error("Settings are symlinked. Update the owning configuration instead.");
  const before = existsSync(settings) ? readFileSync(settings, "utf8") : undefined;
  const after = updateClaudeSettings(before ?? "");
  console.log(`Settings: ${settings}`);
  console.log(JSON.stringify({ env: { CLAUDE_CODE_SHELL: SHELL }, SessionStart: hookCommand }, null, 2));
  if (before === after) {
    console.log("Already configured.");
    return;
  }
  if (values["dry-run"]) return;
  const check = spawnSync("/bin/bash", [join(root, "script/claude-code-env.sh")],
    { cwd: home, encoding: "utf8", env: { ...process.env, CLAUDE_ENV_FILE: "/dev/null" } });
  if (check.status !== 0) throw new Error(check.stderr.trim() || "Cannot start the Claude Code environment hook.");
  const mode = before === undefined ? 0o600 : statSync(settings).mode & 0o777;
  writeChanged(settings, before, after, mode);
  console.log("Claude Code configured. Start a new session; running sessions keep their shell.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Claude Code setup: ${error.message}`); process.exit(1); }
}
