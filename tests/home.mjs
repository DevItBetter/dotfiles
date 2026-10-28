// Test helper: run the real `chezmoi init` + `chezmoi apply` into a temporary
// HOME, so tests exercise the files chezmoi deploys rather than the source tree.
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = fileURLToPath(new URL("../", import.meta.url));
export const chezmoi = process.env.CHEZMOI || "chezmoi";

// Prompt answers keyed by the prompt text in home/.chezmoi.toml.tmpl.
// Pass the test context `t` to delete the HOME when that test ends.
// `setup(home)` runs before chezmoi, for files that should already exist.
export function deployHome({ t, profile = "terumo", desktop = false, name = "Test User",
  email = "test@example.com", env = {}, setup } = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "dotfiles-home-")));
  const remove = () => rmSync(home, { recursive: true, force: true });
  if (t) t.after(remove); else process.on("exit", remove);
  const run = (...args) => {
    const result = spawnSync(chezmoi, args, {
      env: { PATH: process.env.PATH, ...env, HOME: home }, encoding: "utf8", timeout: 60000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`chezmoi ${args.join(" ")}\n${result.stderr}`);
    return result;
  };
  setup?.(home);
  run("init", "--no-tty", "--source", repo,
    "--promptString", `Git user.name=${name},Git user.email=${email}`,
    "--promptChoice", `mise tool profile=${profile}`,
    "--promptBool", `Install desktop apps=${desktop}`);
  run("apply", "--no-tty", "--exclude", "scripts,externals");
  return { home, agentEnv: join(home, ".local/share/agent-env"), run };
}

let shared;
// One terumo deployment shared by a test file, removed at exit. Do not modify it.
export function sharedHome() {
  shared ??= deployHome();
  return shared;
}
