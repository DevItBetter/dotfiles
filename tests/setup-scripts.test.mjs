import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chezmoi, deployHome, repo } from "./home.mjs";

const scripts = join(repo, "home/.chezmoiscripts");
const hasZsh = spawnSync("/bin/sh", ["-c", "command -v zsh"]).status === 0;

test("a failed or invalid plugin build preserves the bundle; a valid build replaces it", { skip: !hasZsh }, (t) => {
  const { home } = deployHome({ t, profile: "core" });
  const zdotdir = join(home, ".config/zsh");
  const antidote = join(zdotdir, ".antidote");
  mkdirSync(antidote);
  const bundle = join(zdotdir, ".zsh_plugins.zsh");
  writeFileSync(bundle, "# known-good bundle\n");
  const env = { HOME: home, PATH: process.env.PATH };
  const rendered = spawnSync(chezmoi, ["execute-template", "--no-tty"], {
    env, encoding: "utf8",
    input: readFileSync(join(scripts, "run_onchange_after_40-zsh-plugins.sh.tmpl"), "utf8"),
  });
  assert.equal(rendered.status, 0, rendered.stderr);
  for (const [body, valid] of [
    ['print -r -- "# partial output"; return 1', false],
    ['print -r -- "if then"', false],
    ['print -r -- "# complete bundle"', true],
  ]) {
    writeFileSync(join(antidote, "antidote.zsh"), `antidote() { ${body}; }\n`);
    const result = spawnSync("bash", ["-c", rendered.stdout], { env, encoding: "utf8" });
    assert.equal(result.status === 0, valid, result.stderr);
    assert.equal(readFileSync(bundle, "utf8"), valid ? "# complete bundle\n" : "# known-good bundle\n");
    assert.deepEqual(readdirSync(zdotdir).filter((name) => name.startsWith(".zsh_plugins.zsh.")), []);
  }
});

test("editor setup notices installs, retries failures, and rechecks successful editions", { skip: process.platform !== "linux" }, (t) => {
  const { home, agentEnv } = deployHome({ t, profile: "core" });
  const bin = join(home, "test-bin");
  mkdirSync(bin);
  const env = { HOME: home, PATH: bin };
  const script = join(scripts, readdirSync(scripts).find((name) => name.endsWith("50-configure-vscode.sh.tmpl")));
  const apply = () => spawnSync(chezmoi, ["apply", "--no-tty", "--source-path", script], {
    env, encoding: "utf8", timeout: 10000,
  });
  // Only this setup script is applied; the launcher stands in for a configurator
  // that fails for stable while Insiders succeeds, without touching either app.
  writeFileSync(join(agentEnv, "node-lts"), `#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/attempts"
case " $* " in *" --insiders "*) exit 0 ;; esac
[ ! -f "$HOME/fail-stable" ]
`, { mode: 0o755 });
  assert.equal(apply().status, 0, "absent editors must be optional");
  for (const name of ["code", "code-insiders"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }
  writeFileSync(join(home, "fail-stable"), "");
  const failed = apply();
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Failed to configure VS Code/);
  assert.match(readFileSync(join(home, "attempts"), "utf8"), /--insiders/);
  rmSync(join(home, "fail-stable"));
  const retried = apply();
  assert.equal(retried.status, 0, retried.stderr);
  const checkedAgain = apply();
  assert.equal(checkedAgain.status, 0, checkedAgain.stderr);
  assert.equal(readFileSync(join(home, "attempts"), "utf8").trim().split("\n").length, 6);
});
