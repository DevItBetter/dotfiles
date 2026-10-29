import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { sharedHome } from "./home.mjs";

const { home } = sharedHome();
const deployed = (path) => pathToFileURL(join(home, path)).href;
const { commandEnvironment } = await import(deployed(".local/share/agent-env/command-environment.mjs"));
const { default: opencode } = await import(deployed(".config/opencode/plugins/command-environment.js"));

const inherited = {
  HOME: "/example/home",
  PATH: "/example/venv/bin:/example/mise/installs/node/old/bin:/usr/bin:/bin",
  MISE_DATA_DIR: "/example/mise",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "diff.algorithm",
  GIT_CONFIG_VALUE_0: "histogram",
};

test("shims replace inherited mise paths without dropping other paths", () => {
  const env = commandEnvironment(inherited);
  assert.equal(env.PATH.split(":")[0], "/example/mise/shims");
  assert(!env.PATH.includes("/installs/"));
  assert(env.PATH.includes("/example/venv/bin"));
  assert.equal(env.GIT_CONFIG_KEY_0, "diff.algorithm");
  assert.equal(env.GIT_CONFIG_VALUE_0, "histogram");
  assert.equal(env.GIT_PAGER, "cat");
  assert.equal(inherited.GIT_CONFIG_COUNT, "1");
});

test("custom shim location and XDG data directory are honored", () => {
  const base = { HOME: "/home/example", XDG_DATA_HOME: "/data", PATH: "/usr/bin" };
  assert.equal(commandEnvironment(base).PATH.split(":")[0], "/data/mise/shims");
  assert.equal(commandEnvironment({ ...base, MISE_SHIMS_DIR: "/shims" })
    .PATH.split(":")[0], "/shims");
});

test("repeated normalization is idempotent, including Git override counts", () => {
  const once = commandEnvironment(inherited);
  assert.deepEqual(commandEnvironment({ ...inherited, ...once }), once);
});

test("malformed and incomplete Git overrides fail explicitly", () => {
  assert.throws(() => commandEnvironment({ GIT_CONFIG_COUNT: "invalid" }), /nonnegative integer/);
  assert.throws(() => commandEnvironment({ GIT_CONFIG_COUNT: "1" }), /missing GIT_CONFIG_KEY_0/);
});

test("Git retains prior overrides and gets plain output in Bash", () => {
  const env = { ...process.env, ...inherited, ...commandEnvironment(inherited) };
  const child = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c",
    'git config --get diff.algorithm && git config --get color.ui && printf "%s\\n" "$GIT_PAGER"'],
    { env, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "histogram\nfalse\ncat\n");
});

test("per-command color settings in Git config do not color agent output", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "agent-color-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const global = join(directory, "gitconfig");
  writeFileSync(global, "[color]\n\tui = always\n\tbranch = always\n\tdiff = always\n" +
    "[user]\n\tname = Test\n\temail = test@example.com\n");
  const env = { ...process.env, ...inherited, GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: "1" };
  const script = 'git init -q -b main repo && cd repo && git commit -q --allow-empty -m x && ' +
    'git branch feature && echo a > f && git add f && git branch --list && git diff --cached';
  const run = (overrides) => spawnSync("/bin/bash", ["--noprofile", "--norc", "-c", script],
    { cwd: directory, env: { ...env, ...overrides }, encoding: "utf8" });
  // Without the shared environment the fixture really does produce color codes.
  assert.match(run({}).stdout, /\x1b\[/);
  rmSync(join(directory, "repo"), { recursive: true, force: true });
  const child = run(commandEnvironment(inherited));
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /^ {2}feature\n\* main\ndiff --git/);
  assert.doesNotMatch(child.stdout, /\x1b/);
});

test("OpenCode V2 hook preserves parent Git entries in a filtered environment", async () => {
  let hook;
  await opencode.setup({ shell: { hook: async (name, callback) => {
    assert.equal(name, "create.before");
    hook = callback;
  } } });
  const saved = { ...process.env };
  try {
    Object.assign(process.env, inherited);
    const event = { shell: "/bin/zsh", env: { GIT_CONFIG_COUNT: "1" } };
    hook(event);
    assert.equal(event.shell, "/bin/bash");
    assert.equal(event.env.GIT_CONFIG_KEY_0, "diff.algorithm");
    assert.equal(event.env.GIT_CONFIG_VALUE_0, "histogram");
    assert.equal(event.env.GIT_CONFIG_COUNT, "12");
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("Pi extension normalizes only its own process and tolerates reloads", () => {
  const source = deployed(".pi/agent/extensions/command-environment.js");
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import extension from ${JSON.stringify(source)};
    extension();
    const once = { ...process.env };
    extension();
    if (process.env.GIT_CONFIG_COUNT !== once.GIT_CONFIG_COUNT) process.exit(1);
    console.log(JSON.stringify({path: process.env.PATH, pager: process.env.GIT_PAGER,
      color: process.env.GIT_CONFIG_VALUE_1}));
  `], { env: { ...process.env, ...inherited }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.path.split(":")[0], "/example/mise/shims");
  assert.equal(result.pager, "cat");
  assert.equal(result.color, "false");
});
