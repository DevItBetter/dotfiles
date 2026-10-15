import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { commandEnvironment } from "../../agents/command-environment.mjs";
import opencode from "../../agents/opencode.js";

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
    assert.equal(event.env.GIT_CONFIG_COUNT, "2");
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("Pi extension normalizes only its own process and tolerates reloads", () => {
  const source = new URL("../../agents/pi.js", import.meta.url).href;
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

test("setup links both adapters, backs up the old plugin, and leaves settings alone", (t) => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const home = mkdtempSync(join(tmpdir(), "agent-links-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const config = join(home, "custom config");
  const pi = join(home, "custom pi");
  const plugin = join(config, "opencode/plugins/command-environment.js");
  mkdirSync(dirname(plugin), { recursive: true });
  mkdirSync(pi, { recursive: true });
  writeFileSync(plugin, "// previous plugin\n");
  writeFileSync(join(pi, "settings.json"), '{"theme":"device-local"}\n');
  writeFileSync(join(config, "opencode/opencode.jsonc"), '// local settings\n{}\n');
  const child = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c",
    'source "$1"; link_agent_integrations; link_agent_integrations', "--",
    join(root, "script/lib/symlinks.sh")], { encoding: "utf8", env: {
      ...process.env, HOME: home, DOTFILES_DIR: root,
      XDG_CONFIG_HOME: config, PI_CODING_AGENT_DIR: pi,
    } });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(realpathSync(plugin), join(root, "agents/opencode.js"));
  assert.equal(realpathSync(join(pi, "extensions/command-environment.js")), join(root, "agents/pi.js"));
  for (const directory of [dirname(plugin), join(pi, "extensions")]) {
    assert.equal(realpathSync(join(directory, "command-environment.mjs")),
      join(root, "agents/command-environment.mjs"));
  }
  assert.equal(readFileSync(plugin + ".backup", "utf8"), "// previous plugin\n");
  assert.equal(readFileSync(join(pi, "settings.json"), "utf8"), '{"theme":"device-local"}\n');
  assert.equal(readFileSync(join(config, "opencode/opencode.jsonc"), "utf8"), '// local settings\n{}\n');
});
