import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync,
  rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { sharedHome } from "./home.mjs";

const { agentEnv } = sharedHome();
const configure = join(agentEnv, "configure-vscode.mjs");
const { misePython, miseReadPaths, parseSettings, updateSettings, vscodePlan } = await import(pathToFileURL(configure).href);
const bash = join(agentEnv, "bin/bash");
const command = [join(agentEnv, "node-lts"), join(agentEnv, "command-launcher.mjs")];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "vscode-env-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const home = join(directory, "home with 'quotes' and spaces");
  const bin = join(directory, "bin");
  const data = join(directory, "data");
  const config = process.platform === "darwin" ? join(home, "Library/Application Support") :
    join(directory, "config");
  const appRoot = join(directory, "editor/resources/app");
  const settings = join(config, "Code/User/settings.json");
  const target = `${process.platform}-${process.arch}`;
  const runtime = join(appRoot, "node_modules.asar.unpacked/@github", `copilot-sdk-${target}`,
    "prebuilds", target, "copilot-runtime");
  const pythonBin = join(data, "mise/installs/python/latest/bin/python");
  for (const path of [home, bin, dirname(runtime), dirname(settings), dirname(pythonBin)]) mkdirSync(path, { recursive: true });
  writeFileSync(join(appRoot, "package.json"), '{"version":"1.144.0"}\n');
  const bundle = join(appRoot, "out/vs/workbench/workbench.desktop.main.js");
  mkdirSync(dirname(bundle), { recursive: true });
  writeFileSync(bundle, 'chat.tools.terminal.terminalProfile.linux terminal.integrated.agentHostProfile.linux chat.agentHost.copilot.runtimePath');
  writeFileSync(settings, '{\n    // Personal settings stay local.\n    "chat.agent.sandbox.enabled": "on",\n    "editor.fontFamily": "my font",\n    "private.example": "not-for-sharing",\n}\n');
  writeFileSync(join(home, ".bashrc"), 'echo PERSONAL_BASHRC_LOADED\nexport GIT_PAGER=broken\n');
  writeFileSync(join(home, ".bash_profile"), 'echo PERSONAL_PROFILE_LOADED\n');
  writeFileSync(join(bin, "mise"), `#!/bin/bash
[[ "$MISE_OFFLINE" == 1 ]] || exit 2
case "$*" in
  'which --tool node@lts node') selected="$TEST_NODE_BIN" ;;
  'which --tool python@latest python') selected="$TEST_PYTHON_BIN" ;;
  *) exit 2 ;;
esac
[[ -x "$selected" ]] || exit 1
printf '%s\\n' "$selected"
`, { mode: 0o755 });
  writeFileSync(pythonBin, "#!/bin/bash\nprintf 'Python 3.15.0\\n'\n", { mode: 0o755 });
  writeFileSync(runtime, `#!${process.execPath}
const { readFileSync } = require("node:fs");
console.log(JSON.stringify({ pid: process.pid, args: process.argv.slice(2), input: readFileSync(0, "utf8"),
  path: process.env.PATH, pager: process.env.GIT_PAGER, token: process.env.TEST_CREDENTIAL }));
process.exit(Number(process.env.TEST_EXIT_CODE || 0));
`, { mode: 0o755 });
  const env = { HOME: home, PATH: `${bin}:${data}/mise/installs/node/old/bin:/usr/bin:/bin`,
    MISE_DATA_DIR: join(data, "mise"), TEST_NODE_BIN: process.execPath, TEST_PYTHON_BIN: pythonBin, XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: data, TEST_CREDENTIAL: "device-local", GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "diff.algorithm", GIT_CONFIG_VALUE_0: "histogram" };
  return { directory, home, bin, data, config, appRoot, settings, runtime, pythonBin, env };
}

function cli(f, args = []) {
  return spawnSync(process.execPath, [configure, "--app-root", f.appRoot, ...args], {
    env: f.env, cwd: f.directory, encoding: "utf8", timeout: 10000,
  });
}

function shell(f, args, options = {}) {
  return spawnSync(bash, args, { env: f.env, cwd: f.directory, encoding: "utf8", timeout: 10000, ...options });
}

test("VS Code agent Bash is executable, clean, and normalized", (t) => {
  const f = fixture(t);
  assert(statSync(bash).mode & 0o111);
  const result = shell(f, ["-i", "-c",
    'printf "%s\\n" "$GIT_PAGER" "$BASH_VERSION"; git config --get color.ui; git config --get diff.algorithm; printf "%s\\n" "$PATH"']);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines[0], "cat");
  assert.match(lines[1], /^\d/);
  assert.deepEqual(lines.slice(2, 4), ["false", "histogram"]);
  assert.equal(lines[4].split(":")[0], join(f.data, "mise/shims"));
  assert(!result.stdout.includes("PERSONAL_"));
  assert(!lines[4].includes("/installs/"));
});

test("VS Code init-file arguments still work without sourcing personal rc or login files", (t) => {
  const f = fixture(t);
  const integration = join(f.directory, "shell integration.sh");
  writeFileSync(integration, `if [[ "$VSCODE_INJECTION" == 1 ]]; then source "$HOME/.bashrc"; fi
if [[ "$VSCODE_SHELL_LOGIN" == 1 ]]; then source "$HOME/.bash_profile"; fi
export TEST_INTEGRATION=loaded
`);
  f.env.VSCODE_INJECTION = "1";
  f.env.VSCODE_SHELL_LOGIN = "1";
  const result = shell(f, ["--init-file", integration, "-i", "-c", 'printf "%s\\n" "$TEST_INTEGRATION" "$GIT_PAGER"']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "loaded\ncat\n");
});

test("agent bootstrap also works from a GUI PATH without mise", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.home, ".local/bin"), { recursive: true });
  renameSync(join(f.bin, "mise"), join(f.home, ".local/bin/mise"));
  f.env.PATH = "/usr/bin:/bin";
  const result = shell(f, ["-c", 'printf "%s\\n" "$GIT_PAGER"']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "cat\n");
});

test("missing Node LTS fails explicitly rather than installing it", (t) => {
  const f = fixture(t);
  f.env.TEST_NODE_BIN = join(f.directory, "missing");
  const result = shell(f, ["-c", "echo should-not-run"]);
  assert.equal(result.status, 127);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Node LTS is not installed/);
});

test("generic agent launcher preserves native process identity, arguments, input, credentials, and status", (t) => {
  const f = fixture(t);
  f.env.TEST_EXIT_CODE = "42";
  const args = ["--stdio", "spaces and $variables", ""];
  const result = spawnSync(command[0], [command[1], f.runtime, ...args], {
    env: f.env, encoding: "utf8", input: "protocol input\n", timeout: 10000,
  });
  assert.equal(result.status, 42, result.stderr);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.pid, result.pid);
  assert.deepEqual(output.args, args);
  assert.equal(output.input, "protocol input\n");
  assert.equal(output.pager, "cat");
  assert.equal(output.token, "device-local");
  assert.equal(output.path.split(":")[0], join(f.data, "mise/shims"));
});

test("JSONC updates preserve comments, nested settings, strings, and CRLF", () => {
  const source = '{\r\n\t// Keep me.\r\n\t"unrelated": {"url":"https://example.com/", "values":[1,2,],},\r\n\t"change": false, // Keep this too.\r\n}\r\n';
  const updates = { change: { path: "bash" }, added: true };
  const after = updateSettings(source, updates);
  assert(after.includes('// Keep me.\r\n\t"unrelated": {"url":"https://example.com/", "values":[1,2,],},'));
  assert(after.includes("// Keep this too."));
  assert.deepEqual(parseSettings(after).data, {
    unrelated: { url: "https://example.com/", values: [1, 2] }, change: { path: "bash" }, added: true,
  });
  assert.equal(updateSettings(after, updates), after);
});

test("JSONC additions handle empty objects and a last property without a comma", () => {
  for (const source of ["{}", "{/* comment */}", '{"x":true}', '{"x":true /* comment */}']) {
    const after = updateSettings(source, { added: [1, { value: "}, // not a comment" }] });
    assert.deepEqual(parseSettings(after).data.added, [1, { value: "}, // not a comment" }]);
  }
});

test("JSONC removal preserves neighboring comments and valid commas in every position", () => {
  for (const source of [
    '{"remove":1}', '{"remove":1,}', '{"remove":1,"keep":2}',
    '{"keep":2,"remove":1}', '{"keep":2,"remove":1,}',
    '{"keep":2, /* retain */ "remove":1 /* retain too */}',
    '{"a":3,"remove":{"nested":[1,2]},"keep":2}',
  ]) {
    const after = updateSettings(source, {}, ["remove"]);
    const expected = parseSettings(source).data;
    delete expected.remove;
    assert.deepEqual(parseSettings(after).data, expected, after);
    if (source.includes("retain")) {
      assert(after.includes("/* retain */"));
      assert(after.includes("/* retain too */"));
    }
    assert.equal(updateSettings(after, {}, ["remove"]), after);
  }
});

test("sandbox read permissions use mise/XDG overrides without changing write or deny rules", (t) => {
  const f = fixture(t);
  const key = `chat.agent.sandbox.fileSystem.${process.platform === "darwin" ? "mac" : "linux"}`;
  const original = { allowRead: ["/personal/read"], allowWrite: ["/personal/write"],
    denyRead: ["/personal/secret"], denyWrite: ["/personal/readonly"] };
  writeFileSync(f.settings, updateSettings(readFileSync(f.settings, "utf8"), { [key]: original }));
  Object.assign(f.env, { MISE_CONFIG_DIR: join(f.directory, "mise-config"),
    MISE_STATE_DIR: join(f.directory, "mise-state"), XDG_CACHE_HOME: join(f.directory, "cache"),
    MISE_SHIMS_DIR: join(f.directory, "shims") });
  const result = cli(f);
  assert.equal(result.status, 0, result.stderr);
  const sandbox = parseSettings(readFileSync(f.settings, "utf8")).data[key];
  for (const name of ["allowWrite", "denyRead", "denyWrite"]) assert.deepEqual(sandbox[name], original[name]);
  for (const path of ["/personal/read", join(f.home, ".local/bin/mise"), join(f.data, "mise"),
    f.env.MISE_CONFIG_DIR, f.env.MISE_STATE_DIR, join(f.env.XDG_CACHE_HOME, "mise"), f.env.MISE_SHIMS_DIR,
    join(f.bin, "mise")]) assert(sandbox.allowRead.includes(path), path);
  assert(!sandbox.allowRead.includes(f.home));
  assert(!sandbox.allowRead.includes(join(f.config, "mise")));
  assert.equal(cli(f).status, 0);
  assert(!existsSync(f.settings + ".before-dotfiles-agents.1"));
});

test("mise sandbox paths resolve symlinked installations and retain macOS's XDG config convention", (t) => {
  const f = fixture(t);
  const target = join(f.directory, "mise-real");
  renameSync(join(f.bin, "mise"), target);
  symlinkSync(target, join(f.bin, "mise"));
  const paths = miseReadPaths({ home: f.home, data: f.data, env: { PATH: f.bin } });
  assert(paths.includes(target));
  assert(paths.includes(join(f.bin, "mise")));
  assert(paths.includes(join(f.home, ".config/mise")));
  assert.throws(() => miseReadPaths({ home: f.home, data: f.data, env: { MISE_DATA_DIR: "relative" } }), /absolute/);
});

test("invalid JSONC and duplicate root keys are refused", () => {
  for (const source of ['{"x":1,"x":2}', "[]", "null", "{,}", '{"x":[,]}', '{"x":1', "{/*", '{"x":true "y":false}']) {
    assert.throws(() => updateSettings(source, { added: true }), undefined, source);
  }
});

test("VS Code dry run changes no files and does not create the runtime launcher", (t) => {
  const f = fixture(t);
  const before = readFileSync(f.settings, "utf8");
  const result = cli(f, ["--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(f.settings, "utf8"), before);
  assert(!existsSync(join(f.data, "dotfiles")));
  assert(!existsSync(f.settings + ".before-dotfiles-agents"));
  assert.match(result.stdout, /chat\.agentHost\.customTerminalTool\.enabled/);
});

test("VS Code terminal setup preserves user settings, keeps a backup, and is idempotent", (t) => {
  const f = fixture(t);
  const before = readFileSync(f.settings, "utf8");
  const result = cli(f);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(f.settings + ".before-dotfiles-agents", "utf8"), before);
  const after = readFileSync(f.settings, "utf8");
  const settings = parseSettings(after).data;
  for (const [key, value] of Object.entries(parseSettings(before).data)) assert.equal(settings[key], value);
  assert.equal(Object.keys(settings).length, Object.keys(parseSettings(before).data).length + 4);
  assert.equal(settings["chat.agentHost.customTerminalTool.enabled"], true);
  assert.equal(settings["chat.agentHost.copilot.runtimePath"], undefined);
  const os = process.platform === "darwin" ? "osx" : "linux";
  assert.equal(settings[`terminal.integrated.agentHostProfile.${os}`].path, bash);
  assert(!existsSync(join(f.data, "dotfiles")));
  assert.equal(settings["chat.agentHost.shellTool.initScript.enabled"], undefined);
  assert.equal(settings["terminal.integrated.defaultProfile.linux"], undefined);
  assert(!existsSync(join(f.config, "Code - Insiders")));
  assert.equal(cli(f).status, 0);
  assert.equal(readFileSync(f.settings, "utf8"), after);
  assert(!existsSync(f.settings + ".before-dotfiles-agents.1"));
});

test("migration removes only the managed runtime override and launcher, including legacy shell paths", (t) => {
  const f = fixture(t);
  const launcher = join(f.data, "dotfiles/vscode/stable/copilot-runtime");
  mkdirSync(dirname(launcher), { recursive: true });
  writeFileSync(launcher, "#!/bin/bash\n# Generated by dotfiles agent-env/configure-vscode.mjs.\nexec /old/runtime\n", { mode: 0o755 });
  const os = process.platform === "darwin" ? "osx" : "linux";
  const before = updateSettings(readFileSync(f.settings, "utf8"), {
    "chat.agentHost.copilot.runtimePath": launcher,
    [`terminal.integrated.agentHostProfile.${os}`]: { path: "${env:HOME}/.local/share/agent-env/bin/bash" },
    [`chat.tools.terminal.terminalProfile.${os}`]: { path: join(f.home, ".local/share/agent-env/bin/bash") },
  });
  writeFileSync(f.settings, before);
  const result = cli(f);
  assert.equal(result.status, 0, result.stderr);
  const settings = parseSettings(readFileSync(f.settings, "utf8")).data;
  assert.equal(settings["chat.agentHost.copilot.runtimePath"], undefined);
  assert.equal(settings[`terminal.integrated.agentHostProfile.${os}`].path, bash);
  assert.equal(readFileSync(f.settings + ".before-dotfiles-agents", "utf8"), before);
  assert(!existsSync(launcher));
  assert.equal(cli(f).status, 0);
});

test("existing custom agent profiles are not overwritten", (t) => {
  const f = fixture(t);
  const os = process.platform === "darwin" ? "osx" : "linux";
  const before = `{"chat.tools.terminal.terminalProfile.${os}":{"path":"/custom/shell"}}`;
  writeFileSync(f.settings, before);
  const result = cli(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /differs/);
  assert.equal(readFileSync(f.settings, "utf8"), before);
  assert(!existsSync(join(f.data, "dotfiles")));
});

for (const dangling of [false, true]) {
  test(`symlinked settings are refused, including dangling=${dangling}`, (t) => {
    const f = fixture(t);
    const target = join(f.directory, "owned elsewhere.json");
    if (!dangling) writeFileSync(target, "{}\n");
    rmSync(f.settings);
    symlinkSync(target, f.settings);
    const result = cli(f);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /symlinked/);
    assert(!existsSync(join(f.data, "dotfiles")));
  });
}

test("unsupported editors and unmanaged runtime overrides or launchers are refused", (t) => {
  const f = fixture(t);
  const options = { ...f };
  writeFileSync(join(f.appRoot, "package.json"), '{"version":"1.141.0"}');
  assert.throws(() => vscodePlan(options), /1\.144/);
  writeFileSync(join(f.appRoot, "package.json"), '{"version":"1.144.0"}');
  const plan = vscodePlan(options);
  writeFileSync(f.settings, '{"chat.agentHost.copilot.runtimePath":"/custom/runtime"}');
  assert.throws(() => vscodePlan(options), /runtimePath differs/);
  writeFileSync(f.settings, '{}');
  mkdirSync(dirname(plan.launcher), { recursive: true });
  writeFileSync(plan.launcher, "# My own launcher\n");
  assert.throws(() => vscodePlan(options), /not managed/);
  rmSync(plan.launcher);
  // No compiled-bundle scan or dependency on SDK package layout remains.
  rmSync(f.runtime);
  rmSync(join(f.appRoot, "out"), { recursive: true });
  assert.doesNotThrow(() => vscodePlan(options));
});

test("Insiders setup is opt-in and does not change stable settings", (t) => {
  const f = fixture(t);
  const before = readFileSync(f.settings, "utf8");
  const result = cli(f, ["--insiders"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(f.settings, "utf8"), before);
  const settings = parseSettings(readFileSync(join(f.config, "Code - Insiders/User/settings.json"), "utf8")).data;
  assert.equal(settings["chat.agentHost.copilot.runtimePath"], undefined);
  assert.equal(settings["chat.agentHost.customTerminalTool.enabled"], true);
  assert(!existsSync(join(f.data, "dotfiles/vscode")));
});

test("Python default configuration is opt-in", (t) => {
  const f = fixture(t);
  writeFileSync(f.settings, updateSettings(readFileSync(f.settings, "utf8"), { "python.defaultInterpreterPath": "/bin/python" }));
  assert.equal(cli(f).status, 0);
  assert.equal(parseSettings(readFileSync(f.settings, "utf8")).data["python.defaultInterpreterPath"], "/bin/python");
});

test("Python opt-in replaces the system default with mise Python latest and preserves saved selections", (t) => {
  const f = fixture(t);
  const before = updateSettings(readFileSync(f.settings, "utf8"), { "python.defaultInterpreterPath": "/bin/python" });
  writeFileSync(f.settings, before);
  const storage = join(f.config, "Code/User/workspaceStorage/test/state.vscdb");
  mkdirSync(dirname(storage), { recursive: true });
  writeFileSync(storage, "Existing project interpreter selection\n");
  const result = cli(f, ["--python"]);
  assert.equal(result.status, 0, result.stderr);
  const after = readFileSync(f.settings, "utf8");
  assert.equal(parseSettings(after).data["python.defaultInterpreterPath"], f.pythonBin);
  assert(!f.pythonBin.includes("/shims/"));
  assert.equal(readFileSync(f.settings + ".before-dotfiles-agents", "utf8"), before);
  assert.equal(readFileSync(storage, "utf8"), "Existing project interpreter selection\n");
  assert.equal(cli(f, ["--python"]).status, 0);
  assert.equal(readFileSync(f.settings, "utf8"), after);
  assert(!existsSync(f.settings + ".before-dotfiles-agents.1"));
});

test("Python opt-in preserves custom defaults unless reviewed", (t) => {
  const f = fixture(t);
  const before = updateSettings(readFileSync(f.settings, "utf8"), { "python.defaultInterpreterPath": "${workspaceFolder}/.venv" });
  writeFileSync(f.settings, before);
  const result = cli(f, ["--python"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /python\.defaultInterpreterPath differs/);
  assert.equal(readFileSync(f.settings, "utf8"), before);
  assert(!existsSync(join(f.data, "dotfiles")));
});

test("missing Python fails before changing settings, even with a stale shim", (t) => {
  const f = fixture(t);
  const before = readFileSync(f.settings, "utf8");
  rmSync(f.pythonBin);
  mkdirSync(join(f.data, "mise/shims"), { recursive: true });
  writeFileSync(join(f.data, "mise/shims/python"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const result = cli(f, ["--python"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /mise install python@latest/);
  assert.equal(readFileSync(f.settings, "utf8"), before);
  assert(!existsSync(f.settings + ".before-dotfiles-agents"));
  assert(!existsSync(join(f.data, "dotfiles")));
});

test("Python dry run resolves the installed interpreter without writing files", (t) => {
  const f = fixture(t);
  const before = readFileSync(f.settings, "utf8");
  const result = cli(f, ["--python", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /python\.defaultInterpreterPath/);
  assert.equal(readFileSync(f.settings, "utf8"), before);
  assert(!existsSync(join(f.data, "dotfiles")));
});

test("Python resolution also works when a GUI PATH omits mise", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.home, ".local/bin"), { recursive: true });
  renameSync(join(f.bin, "mise"), join(f.home, ".local/bin/mise"));
  f.env.PATH = "/usr/bin:/bin";
  assert.equal(misePython({ home: f.home, env: f.env }), f.pythonBin);
});

test("Python resolution rejects failed mise results even if stdout names an executable", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.bin, "mise"), '#!/bin/bash\nprintf "%s\\n" "$TEST_PYTHON_BIN"\nexit 1\n', { mode: 0o755 });
  assert.throws(() => misePython({ home: f.home, env: f.env }), /Cannot resolve/);
});
