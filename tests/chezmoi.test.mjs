import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, statSync, symlinkSync,
  writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { chezmoi, deployHome, repo } from "./home.mjs";

const read = (home, path) => readFileSync(join(home, path), "utf8");
const exists = (home, path) => existsSync(join(home, path));
const zsh = spawnSync("/bin/sh", ["-c", "command -v zsh"], { encoding: "utf8" }).stdout.trim();

function miseTools(home) {
  const config = read(home, ".config/mise/config.toml");
  const tools = config.split("[tools]\n")[1].split("\n\n")[0];
  return tools.trim().split("\n").map((line) => line.split(" = ")[0].replaceAll('"', ""));
}

test("core profile installs only the core tools and no agent integrations", (t) => {
  const { home } = deployHome({ t, profile: "core" });
  assert.deepEqual(miseTools(home).sort(),
    ["aqua:starship/starship", "chezmoi", "node", "npm:diff-so-fancy", "python", "uv"]);
  for (const path of [".config/opencode", ".pi", ".claude", ".local/share/agent-env/copilot",
    ".config/alacritty", ".config/zsh/conf.d/wsl2-ssh-agent.zsh"]) {
    assert(!exists(home, path), `${path} should not be deployed`);
  }
  assert(statSync(join(home, ".local/share/agent-env/bin/bash")).mode & 0o111);
});

test("profiles deploy the integrations for the agents they install", (t) => {
  const terumo = deployHome({ t, profile: "terumo", desktop: true }).home;
  assert(miseTools(terumo).includes("npm:@github/copilot"));
  assert(exists(terumo, ".config/opencode/plugins/command-environment.js"));
  assert(exists(terumo, ".pi/agent/extensions/command-environment.js"));
  assert(exists(terumo, ".local/share/agent-env/copilot"));
  assert(exists(terumo, ".config/alacritty/alacritty.toml"));
  assert(!exists(terumo, ".claude"));
  assert.match(read(terumo, ".config/opencode/plugins/command-environment.js"),
    new RegExp(`from "${join(terumo, ".local/share/agent-env/command-environment.mjs")}"`));

  const gbl = deployHome({ t, profile: "gbl" }).home;
  assert(miseTools(gbl).includes("npm:@anthropic-ai/claude-code"));
  const settings = JSON.parse(read(gbl, ".claude/settings.json"));
  assert.equal(settings.env.CLAUDE_CODE_SHELL, "/bin/bash");
  assert.equal(settings.hooks.SessionStart.length, 1);
});

test("Claude settings keep the user's own keys and hooks, and re-apply adds nothing", (t) => {
  const own = { model: "opus", env: { KEEP: "1" },
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo mine" }] }] } };
  const { home, run } = deployHome({ t, profile: "gbl", setup: (home) => {
    mkdirSync(join(home, ".claude"));
    writeFileSync(join(home, ".claude/settings.json"), JSON.stringify(own));
  } });
  const first = read(home, ".claude/settings.json");
  const settings = JSON.parse(first);
  assert.equal(settings.model, "opus");
  assert.deepEqual(settings.env, { KEEP: "1", CLAUDE_CODE_SHELL: "/bin/bash" });
  assert.equal(settings.hooks.SessionStart.length, 2);
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, "echo mine");
  assert.match(settings.hooks.SessionStart[1].hooks[0].command, /agent-env\/claude-code\.mjs"$/);
  run("apply", "--no-tty", "--exclude", "scripts,externals");
  assert.equal(read(home, ".claude/settings.json"), first);
});

test("Git identity comes from init answers, and ~/.gitconfig is never overwritten", (t) => {
  const { home, run } = deployHome({ t, profile: "core", name: "Ada Lovelace", email: "ada@example.com" });
  const config = read(home, ".config/git/config");
  assert.match(config, /\tname = Ada Lovelace\n\temail = ada@example.com\n/);
  writeFileSync(join(home, ".gitconfig"), "[user]\n\temail = work@example.com\n");
  run("apply", "--no-tty", "--exclude", "scripts,externals");
  assert.equal(read(home, ".gitconfig"), "[user]\n\temail = work@example.com\n");
  const git = spawnSync("git", ["config", "--global", "user.email"],
    { env: { PATH: process.env.PATH, HOME: home }, encoding: "utf8" });
  assert.equal(git.stdout, "work@example.com\n");
});

test("a second apply changes nothing", (t) => {
  const { run } = deployHome({ t, profile: "terumo" });
  assert.equal(run("diff", "--no-tty", "--exclude", "scripts,externals").stdout, "");
  run("verify", "--exclude", "scripts,externals");
});

test("every script template renders to valid Bash", (t) => {
  const { home } = deployHome({ t, profile: "gbl" });
  const scripts = join(repo, "home/.chezmoiscripts");
  for (const name of spawnSync("ls", [scripts], { encoding: "utf8" }).stdout.trim().split("\n")) {
    const rendered = spawnSync(chezmoi, ["execute-template", "--no-tty"], { input: readFileSync(join(scripts, name)),
      env: { PATH: process.env.PATH, HOME: home }, encoding: "utf8" });
    assert.equal(rendered.status, 0, `${name}: ${rendered.stderr}`);
    const syntax = spawnSync("bash", ["-n"], { input: rendered.stdout, encoding: "utf8" });
    assert.equal(syntax.status, 0, `${name}: ${syntax.stderr}`);
  }
});

test("the legacy migration removes old checkout links and keeps local zsh files", (t) => {
  const { home } = deployHome({ t, profile: "core" });
  const checkout = join(home, "old-dotfiles");
  const links = {
    ".zshrc": "zsh/zshrc", ".gitconfig": "git/gitconfig", ".config/starship.toml": "starship/starship.toml",
    ".pi/agent/extensions/command-environment.js": "agents/pi.js",
  };
  for (const [link, target] of Object.entries(links)) {
    mkdirSync(join(checkout, dirname(target)), { recursive: true });
    writeFileSync(join(checkout, target), "");
    mkdirSync(dirname(join(home, link)), { recursive: true });
    if (exists(home, link)) spawnSync("rm", ["-f", join(home, link)]);
    symlinkSync(join(checkout, target), join(home, link));
  }
  mkdirSync(join(checkout, "zsh/config"));
  writeFileSync(join(checkout, "zsh/config/work.zsh"), "export WORK=1\n");
  symlinkSync("/elsewhere/rc", join(home, ".tmux.conf.keep"));
  writeFileSync(join(home, ".config/mise/dotfiles-selection.json"), "{}");
  mkdirSync(join(home, ".config/mise/conf.d"));
  writeFileSync(join(home, ".config/mise/conf.d/10-dotfiles-node.toml"), "");
  writeFileSync(join(home, ".config/mise/conf.d/20-mine.toml"), "");

  const script = join(repo, "home/.chezmoiscripts/run_once_before_00-migrate-legacy-links.sh.tmpl");
  const env = { PATH: process.env.PATH, HOME: home };
  const rendered = spawnSync(chezmoi, ["execute-template", "--no-tty"],
    { input: readFileSync(script), env, encoding: "utf8" }).stdout;
  for (let run = 0; run < 2; run++) {
    const result = spawnSync("bash", ["-c", rendered], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  for (const link of Object.keys(links)) assert(!exists(home, link), `${link} should be removed`);
  assert.equal(readlinkSync(join(home, ".tmux.conf.keep")), "/elsewhere/rc");
  assert(!exists(home, ".config/mise/dotfiles-selection.json"));
  assert(!exists(home, ".config/mise/conf.d/10-dotfiles-node.toml"));
  assert(exists(home, ".config/mise/conf.d/20-mine.toml"));
  const local = read(home, ".config/zsh/local.zsh");
  assert.equal(local.match(/export WORK=1/g).length, 1);
  assert(lstatSync(join(home, ".config/zsh/.zshrc")).isFile());
});

for (const term of ["xterm-256color", "dumb"]) {
  test(`interactive zsh starts silently with TERM=${term}`, { skip: !zsh }, (t) => {
    const { home } = deployHome({ t, profile: "core" });
    writeFileSync(join(home, ".config/zsh/local.zsh"), "print -r -- LOCAL_LOADED\n");
    const result = spawnSync(zsh, ["-i", "-c", 'print -r -- "$ZDOTDIR"; whence -w compdef'], {
      env: { HOME: home, TERM: term, PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 20000,
    });
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, `LOCAL_LOADED\n${join(home, ".config/zsh")}\ncompdef: function\n`);
  });
}
