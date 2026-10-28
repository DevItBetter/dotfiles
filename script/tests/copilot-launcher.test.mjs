import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const launcher = join(root, "script/copilot.sh");
const aliases = join(root, "zsh/config/aliases.zsh");
const zsh = spawnSync("/bin/sh", ["-c", "command -v zsh"], { encoding: "utf8" }).stdout.trim();
const actualMise = spawnSync("/bin/sh", ["-c", "command -v mise"], { encoding: "utf8" }).stdout.trim();

function fixture(t, wrapper = false) {
  const directory = mkdtempSync(join(tmpdir(), "copilot-launcher-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const home = join(directory, "home with spaces");
  const bin = join(directory, "bin");
  const data = join(directory, "mise data");
  const copilot = join(data, wrapper ? "installs/npm-github-copilot/latest/node_modules/.bin/copilot" :
    "installs/copilot/latest/bin/copilot");
  const entry = wrapper ? resolve(dirname(copilot),
    "../.mise/@github+copilot@9.8.7/node_modules/@github/copilot/npm-loader.mjs") :
    join(data, "installs/copilot/latest/lib/entry.mjs");
  for (const path of [home, bin, dirname(copilot), dirname(entry), join(data, "shims")]) {
    mkdirSync(path, { recursive: true });
  }
  symlinkSync(root, join(home, "dotfiles"));
  if (wrapper) {
    writeFileSync(copilot, `#!/bin/sh
# aube-bin-shim v2 target=${relative(dirname(copilot), entry)}
echo 'The shell wrapper must not resolve Node through PATH' >&2
exit 89
`, { mode: 0o755 });
  } else {
    symlinkSync(entry, copilot);
  }
  // A stale shim must not be mistaken for an installed Copilot executable.
  symlinkSync("/bin/true", join(data, "shims/copilot"));
  writeFileSync(join(data, "shims/node"), "#!/bin/sh\necho 'Node shim must not bootstrap Copilot' >&2\nexit 88\n",
    { mode: 0o755 });
  writeFileSync(join(bin, "mise"), `#!/bin/bash
[[ "$MISE_OFFLINE" == 1 ]] || exit 2
case "$*" in
  'which --tool npm:@github/copilot copilot') executable="$TEST_COPILOT_BIN" ;;
  'which --tool node@lts node') executable="$TEST_NODE_BIN" ;;
  *) exit 2 ;;
esac
[[ -n "$executable" ]] || exit 1
printf '%s\\n' "$executable"
exit "\${TEST_MISE_STATUS:-0}"
`, { mode: 0o755 });
  writeFileSync(entry, `import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const child = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c",
  'printf "%s\\n" "$GIT_PAGER"; git config --get color.ui; git config --get diff.algorithm; command -v node'],
  { encoding: "utf8" });
console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), pid: process.pid,
  path: process.env.PATH, nodePath: process.env.NODE_PATH, credential: process.env.EXAMPLE_CREDENTIAL,
  bashEnv: process.env.BASH_ENV, input: readFileSync(0, "utf8"), child }));
if (process.env.TEST_SIGNAL) process.kill(process.pid, process.env.TEST_SIGNAL);
process.exit(Number(process.env.TEST_EXIT_CODE || 0));
`, { mode: 0o755 });
  const env = {
    ...process.env, HOME: home, MISE_DATA_DIR: data,
    MISE_CONFIG_DIR: join(directory, "config"), MISE_CACHE_DIR: join(directory, "cache"),
    MISE_STATE_DIR: join(directory, "state"), MISE_SYSTEM_CONFIG_DIR: join(directory, "etc"),
    PATH: [bin, join(data, "installs/node/old/bin"), join(data, "shims"), "/usr/bin", "/bin"].join(":"),
    TEST_COPILOT_BIN: copilot, TEST_NODE_BIN: process.execPath,
    EXAMPLE_CREDENTIAL: "device-local-test-value", GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "diff.algorithm", GIT_CONFIG_VALUE_0: "histogram",
  };
  for (const key of ["BASH_ENV", "ENV", "MISE_SHIMS_DIR", "MISE_GLOBAL_CONFIG_FILE",
    "TEST_EXIT_CODE", "TEST_SIGNAL", "TEST_MISE_STATUS"]) delete env[key];
  return { directory, home, bin, data, copilot, env };
}

function launch(f, args = [], options = {}) {
  return spawnSync("/bin/bash", [launcher, ...args], {
    cwd: f.directory, env: f.env, encoding: "utf8", timeout: 10000, ...options,
  });
}

function shell(f, commands = 'print -r -- "${aliases[copilot]-unset}"') {
  return spawnSync(zsh, ["-f", "-c", 'source "$1"\n' + commands, "--", aliases], {
    cwd: f.directory, env: f.env, encoding: "utf8", timeout: 10000,
  });
}

test("Copilot launcher preserves arguments, cwd, stdin, credentials, and process identity", (t) => {
  const f = fixture(t);
  const args = ["--prompt", "spaces and 'quotes' and $variables", "", "--", "-literal"];
  const result = launch(f, args, { input: "standard input\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const cli = JSON.parse(result.stdout);
  assert.deepEqual(cli.args, args);
  assert.equal(cli.cwd, f.directory);
  assert.equal(cli.pid, result.pid);
  assert.equal(cli.input, "standard input\n");
  assert.equal(cli.credential, "device-local-test-value");
  assert.equal(cli.bashEnv, undefined);
  assert.equal(cli.path.split(":")[0], join(f.data, "shims"));
  assert(!cli.path.includes("/installs/"));
  assert(cli.path.includes(f.bin));
  assert.equal(cli.child.status, 0, cli.child.stderr);
  assert.equal(cli.child.stdout, `cat\nfalse\nhistogram\n${f.data}/shims/node\n`);
});

test("Copilot launcher preserves nonzero exit status", (t) => {
  const f = fixture(t);
  f.env.TEST_EXIT_CODE = "42";
  assert.equal(launch(f).status, 42);
});

for (const linked of [false, true]) {
  test(`Copilot launcher resolves an aube shell wrapper${linked ? " through a symlink" : ""}`, (t) => {
    const f = fixture(t, true);
    if (linked) {
      f.env.TEST_COPILOT_BIN = join(f.bin, "copilot-link");
      symlinkSync(f.copilot, f.env.TEST_COPILOT_BIN);
    }
    const args = ["--prompt", "spaces and 'quotes' and $variables", ""];
    const result = launch(f, args, { input: "wrapper input\n" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const cli = JSON.parse(result.stdout);
    assert.deepEqual(cli.args, args);
    assert.equal(cli.cwd, f.directory);
    assert.equal(cli.pid, result.pid);
    assert.equal(cli.input, "wrapper input\n");
    assert.equal(cli.credential, "device-local-test-value");
    assert.equal(cli.nodePath, [resolve(dirname(f.copilot), ".."),
      resolve(dirname(f.copilot), "../.mise/node_modules")].join(":"));
    assert.equal(cli.path.split(":")[0], join(f.data, "shims"));
    assert(!cli.path.includes("/installs/"));
    assert.equal(cli.child.status, 0, cli.child.stderr);
    assert.equal(cli.child.stdout, `cat\nfalse\nhistogram\n${f.data}/shims/node\n`);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`Copilot launcher preserves ${signal}`, (t) => {
    const f = fixture(t);
    f.env.TEST_SIGNAL = signal;
    const result = launch(f);
    assert.equal(result.status, null, result.stderr);
    assert.equal(result.signal, signal);
  });
}

test("missing Copilot fails clearly and does not create an alias despite a stale shim", (t) => {
  const f = fixture(t);
  unlinkSync(f.copilot);
  const result = launch(f);
  assert.equal(result.status, 127);
  assert.match(result.stderr, /Copilot is not installed/);
  const alias = shell(f);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(alias.stdout, "unset\n");
  assert.equal(alias.stderr, "");
});

test("missing Node LTS fails clearly and does not create an alias", (t) => {
  const f = fixture(t);
  f.env.TEST_NODE_BIN = join(f.directory, "missing-node");
  const result = launch(f);
  assert.equal(result.status, 127);
  assert.match(result.stderr, /Node LTS is not installed/);
  const alias = shell(f);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(alias.stdout, "unset\n");
  assert.equal(alias.stderr, "");
});

test("missing mise fails clearly and does not create an alias", (t) => {
  const f = fixture(t);
  unlinkSync(join(f.bin, "mise"));
  for (const executable of ["dirname", "awk", "sort"]) {
    symlinkSync(`/usr/bin/${executable}`, join(f.bin, executable));
  }
  f.env.PATH = f.bin;
  const result = launch(f);
  assert.equal(result.status, 127);
  assert.match(result.stderr, /mise is not installed/);
  const alias = shell(f);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(alias.stdout, "unset\n");
  assert.equal(alias.stderr, "");
});

test("failed mise resolution never enables the alias even if stdout names an executable", (t) => {
  const f = fixture(t);
  f.env.TEST_MISE_STATUS = "1";
  assert.equal(launch(f).status, 127);
  assert.equal(shell(f).stdout, "unset\n");
});

test("installed Copilot gets a working alias that tolerates reloads without recursion", (t) => {
  const f = fixture(t);
  assert.equal(shell(f).stdout, 'bash "$HOME/dotfiles/script/copilot.sh"\n');
  const result = shell(f, 'source "$1"\neval \'copilot --prompt "argument with spaces"\'');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout).args, ["--prompt", "argument with spaces"]);
});

test("reloading aliases after uninstall removes only the dotfiles alias", (t) => {
  const f = fixture(t);
  const result = shell(f, 'export TEST_COPILOT_BIN=""\nsource "$1"\nprint -r -- "${aliases[copilot]-unset}"');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "unset\n");
  assert.equal(result.stderr, "");
});

test("an unrelated user alias is left alone when Copilot is unavailable", (t) => {
  const f = fixture(t);
  f.env.TEST_COPILOT_BIN = "";
  const result = shell(f, 'alias copilot="my-other-launcher"\nsource "$1"\nprint -r -- "$aliases[copilot]"');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "my-other-launcher\n");
});

test("a missing launcher does not create an alias", (t) => {
  const f = fixture(t);
  unlinkSync(join(f.home, "dotfiles"));
  assert.equal(shell(f).stdout, "unset\n");
});

test("invalid inherited Git overrides fail without starting Copilot", (t) => {
  const f = fixture(t);
  f.env.GIT_CONFIG_COUNT = "invalid";
  const result = launch(f);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /GIT_CONFIG_COUNT must be a nonnegative integer/);
});

test("real mise rejects a stale Copilot shim without an installation", { skip: !actualMise }, (t) => {
  const f = fixture(t);
  unlinkSync(join(f.bin, "mise"));
  symlinkSync(actualMise, join(f.bin, "mise"));
  const result = launch(f);
  assert.equal(result.status, 127, result.stderr);
  assert.match(result.stderr, /Copilot is not installed/);
  const alias = shell(f);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(alias.stdout, "unset\n");
  assert.equal(alias.stderr, "");
});
