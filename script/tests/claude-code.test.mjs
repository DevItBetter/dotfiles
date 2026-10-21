import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hookCommand, main, updateClaudeSettings } from "../configure-claude-code.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const adapter = join(root, "agents/claude-code.mjs");
const hook = join(root, "script/claude-code-env.sh");
const inherited = {
  HOME: "/example/home",
  PATH: "/example/it's/bin:/example/mise/installs/node/old/bin:/usr/bin:/bin",
  MISE_DATA_DIR: "/example/mise",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "diff.algorithm",
  GIT_CONFIG_VALUE_0: "histogram",
};

function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), "claude-code-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("the hook writes exports that Bash sources before each command", (t) => {
  const file = join(scratch(t), "env file");
  const child = spawnSync(process.execPath, [adapter],
    { env: { ...inherited, CLAUDE_ENV_FILE: file }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const shell = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c",
    'source "$1"; printf "%s\\n" "${PATH%%:*}" "$GIT_PAGER" "$GIT_CONFIG_COUNT"; ' +
    'git config --get diff.algorithm; git config --get color.branch; ' +
    'case ":$PATH:" in *":$2:"*) echo quoted;; esac', "--", file, "/example/it's/bin"],
  { env: { PATH: "/usr/bin:/bin" }, encoding: "utf8" });
  assert.equal(shell.status, 0, shell.stderr);
  assert.equal(shell.stdout, "/example/mise/shims\ncat\n12\nhistogram\nfalse\nquoted\n");
  assert(!readFileSync(file, "utf8").includes("/installs/"));
});

test("the hook refuses to run outside a session", () => {
  const child = spawnSync(process.execPath, [adapter], { env: inherited, encoding: "utf8" });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /CLAUDE_ENV_FILE is not set/);
});

test("the hook runs the adapter with mise's Node LTS, offline", (t) => {
  const directory = scratch(t);
  const bin = join(directory, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "mise"), `#!/bin/bash
[[ "$MISE_OFFLINE" == 1 && "$*" == 'which --tool node@lts node' ]] || exit 2
printf '%s\\n' "$TEST_NODE_BIN"
`, { mode: 0o755 });
  const file = join(directory, "env");
  const env = { HOME: directory, PATH: `${bin}:/usr/bin:/bin`, CLAUDE_ENV_FILE: file };
  const ok = spawnSync("/bin/bash", [hook], { env: { ...env, TEST_NODE_BIN: process.execPath }, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(readFileSync(file, "utf8"), /^export GIT_PAGER='cat'$/m);
  const missing = spawnSync("/bin/bash", [hook], { env: { ...env, TEST_NODE_BIN: "" }, encoding: "utf8" });
  assert.equal(missing.status, 127);
  assert.match(missing.stderr, /Node LTS is not installed/);
});

test("settings gain the shell and hook, keep everything else, and converge", () => {
  const before = JSON.stringify({
    env: { GOTMPDIR: "/cache" },
    permissions: { defaultMode: "auto" },
    hooks: {
      SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "echo hi" }] }],
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "audit" }] }],
    },
  }, null, 2) + "\n";
  const after = updateClaudeSettings(before);
  const data = JSON.parse(after);
  assert.deepEqual(data.env, { GOTMPDIR: "/cache", CLAUDE_CODE_SHELL: "/bin/bash" });
  assert.deepEqual(data.permissions, { defaultMode: "auto" });
  assert.equal(data.hooks.PreToolUse[0].hooks[0].command, "audit");
  assert.deepEqual(data.hooks.SessionStart.map((group) => group.hooks[0].command), ["echo hi", hookCommand]);
  assert.equal(updateClaudeSettings(after), after);
  assert.deepEqual(JSON.parse(updateClaudeSettings("")), {
    env: { CLAUDE_CODE_SHELL: "/bin/bash" },
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: hookCommand }] }] },
  });
});

test("conflicting or malformed settings are refused", () => {
  assert.throws(() => updateClaudeSettings('{"env":{"CLAUDE_CODE_SHELL":"/bin/zsh"}}'), /differs/);
  assert.throws(() => updateClaudeSettings('{"hooks":{"SessionStart":{}}}'), /must be an array/);
  assert.throws(() => updateClaudeSettings("[]"), /JSON object/);
  assert.throws(() => updateClaudeSettings("{"), SyntaxError);
});

test("the configurator previews, refuses symlinks, and backs up before writing", (t) => {
  const directory = scratch(t);
  const settings = join(directory, "settings.json");
  const original = '{\n  "env": {\n    "GOTMPDIR": "/cache"\n  }\n}\n';
  writeFileSync(settings, original, { mode: 0o640 });
  main(["--dry-run", "--settings", settings]);
  assert.equal(readFileSync(settings, "utf8"), original);

  const linked = join(directory, "linked.json");
  symlinkSync(settings, linked);
  assert.throws(() => main(["--settings", linked]), /symlinked/);

  const mise = spawnSync("/bin/bash", ["-c", "MISE_OFFLINE=1 mise which --tool node@lts node"], { encoding: "utf8" });
  if (mise.status !== 0) return t.skip("mise Node LTS is not installed");
  main(["--settings", settings]);
  assert.equal(readFileSync(settings + ".before-dotfiles-agents", "utf8"), original);
  assert.equal(statSync(settings).mode & 0o777, 0o640);
  assert.equal(JSON.parse(readFileSync(settings, "utf8")).env.CLAUDE_CODE_SHELL, "/bin/bash");
  main(["--settings", settings]);
  assert(!existsSync(settings + ".before-dotfiles-agents.1"));
});
