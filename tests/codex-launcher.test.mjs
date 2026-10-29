import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deployHome } from "./home.mjs";

const { agentEnv, home: deployed } = deployHome({ profile: "gbl" });
function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "codex-launcher-")));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const home = join(directory, "home with spaces");
  const bin = join(directory, "bin");
  const data = join(directory, "mise data");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin);
  mkdirSync(join(data, "shims"), { recursive: true });
  const entry = join(directory, "codex.mjs");
  writeFileSync(entry, `import { readFileSync } from 'node:fs';
console.log(JSON.stringify({args:process.argv.slice(2),pid:process.pid,cwd:process.cwd(),
 input:readFileSync(0,'utf8'),credential:process.env.EXAMPLE_CREDENTIAL,path:process.env.PATH}));
if(process.env.TEST_SIGNAL)process.kill(process.pid,process.env.TEST_SIGNAL);
process.exit(Number(process.env.TEST_EXIT_CODE||0));\n`, { mode: 0o755 });
  writeFileSync(join(bin, "mise"), `#!/bin/bash
[[ "$MISE_OFFLINE" == 1 ]] || exit 2
case "$*" in
 'which --tool npm:@openai/codex codex') printf '%s\\n' "$TEST_CODEX_BIN" ;;
 'which --tool node@lts node') printf '%s\\n' "$TEST_NODE_BIN" ;;
 *) exit 2 ;;
esac
`, { mode: 0o755 });
  // A stale shim is insufficient: the resolved installation must be executable.
  symlinkSync("/bin/true", join(data, "shims/codex"));
  const env = { HOME: home, PATH: `${bin}:${data}/installs/node/old/bin:/usr/bin:/bin`,
    MISE_DATA_DIR: data, TEST_CODEX_BIN: entry, TEST_NODE_BIN: process.execPath,
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "diff.algorithm", GIT_CONFIG_VALUE_0: "histogram",
    EXAMPLE_CREDENTIAL: "local-test-value" };
  return { directory, home, bin, data, entry, env };
}
function launch(f, args = [], options = {}) {
  return spawnSync(join(agentEnv, "codex"), args, {
    env: f.env, cwd: f.directory, encoding: "utf8", timeout: 10000, ...options,
  });
}

test("Codex launch preserves process behavior and sets only native command environment controls", (t) => {
  const f = fixture(t);
  const args = ["exec", "spaces and 'quotes' and $variables", "", "--sandbox", "workspace-write"];
  const result = launch(f, args, { input: "input\n" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.pid, result.pid);
  assert.equal(output.cwd, f.directory);
  assert.equal(output.input, "input\n");
  assert.equal(output.credential, "local-test-value");
  assert.deepEqual(output.args.slice(-args.length), args);
  const config = new Map();
  const prefix = output.args.slice(0, -args.length);
  for (let i = 0; i < prefix.length; i += 2) {
    assert.equal(prefix[i], "-c");
    const separator = prefix[i + 1].indexOf("=");
    config.set(prefix[i + 1].slice(0, separator), JSON.parse(prefix[i + 1].slice(separator + 1)));
  }
  assert.equal(config.get("allow_login_shell"), false);
  assert.equal(config.get("features.shell_snapshot"), false);
  assert.equal(config.get("shell_environment_policy.set.PATH"), `${f.data}/shims:${f.home}/.local/bin:${f.bin}:/usr/bin:/bin`);
  assert.equal(config.get("shell_environment_policy.set.GIT_PAGER"), "cat");
  assert.equal(config.get("shell_environment_policy.set.GIT_CONFIG_KEY_0"), "diff.algorithm");
  assert.equal(config.get("shell_environment_policy.set.GIT_CONFIG_VALUE_0"), "histogram");
  assert.equal(config.get("shell_environment_policy.set.GIT_CONFIG_KEY_1"), "color.ui");
  assert.equal(config.get("shell_environment_policy.set.GIT_CONFIG_VALUE_1"), "false");
  assert([...config.keys()].every(key => ["allow_login_shell", "features.shell_snapshot"].includes(key) || key.startsWith("shell_environment_policy.set.")));
  assert(!output.path.includes("/installs/"));
});

test("Codex launch handles mise npm shell shims and missing installations", (t) => {
  const f = fixture(t);
  const shim = join(f.bin, "codex");
  writeFileSync(shim, `#!/bin/sh\n# aube-bin-shim v2 target=../codex.mjs\nexit 89\n`, { mode: 0o755 });
  f.env.TEST_CODEX_BIN = shim;
  assert.equal(launch(f, ["--version"]).status, 0);
  f.env.TEST_CODEX_BIN = join(f.directory, "missing");
  const missing = launch(f);
  assert.equal(missing.status, 127);
  assert.match(missing.stderr, /Codex CLI is not installed/);
  f.env.TEST_CODEX_BIN = f.entry;
  f.env.TEST_NODE_BIN = join(f.directory, "missing-node");
  assert.equal(launch(f).status, 127);
});

test("Codex launch preserves failed exits and termination signals", (t) => {
  const f = fixture(t);
  f.env.TEST_EXIT_CODE = "7";
  assert.equal(launch(f).status, 7);
  delete f.env.TEST_EXIT_CODE;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    f.env.TEST_SIGNAL = signal;
    assert.equal(launch(f).signal, signal);
  }
});

test("Codex alias survives reloads and is removed when the launcher is unavailable", (t) => {
  const f = fixture(t);
  const zsh = spawnSync("/bin/sh", ["-c", "command -v zsh"], { encoding: "utf8" }).stdout.trim();
  mkdirSync(join(f.home, ".local/share"), { recursive: true });
  symlinkSync(agentEnv, join(f.home, ".local/share/agent-env"));
  const aliases = join(deployed, ".config/zsh/conf.d/aliases.zsh");
  const source = readFileSync(aliases, "utf8");
  const result = spawnSync(zsh, ["-f", "-c", `${source}\n${source}\nprint -r -- "\${aliases[codex]-unset}"`], { env: f.env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert(result.stdout.includes("agent-env/codex"));
  rmSync(join(f.home, ".local/share/agent-env"));
  const missing = spawnSync(zsh, ["-f", "-c", `_launcher=$HOME/.local/share/agent-env/codex\nalias codex=\${(q)_launcher}\n${source}\nprint -r -- "\${aliases[codex]-unset}"`], { env: f.env, encoding: "utf8" });
  assert.equal(missing.status, 0, missing.stderr);
  assert.equal(missing.stdout, "unset\n");
});
