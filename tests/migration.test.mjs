import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deployHome, repo } from "./home.mjs";

const migration = "run_once_before_00-migrate-legacy-links.sh.tmpl";
const read = (home, path) => readFileSync(join(home, path), "utf8");
function sourceFixture(t) {
  const source = mkdtempSync(join(tmpdir(), "dotfiles-migration-source-"));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  copyFileSync(join(repo, ".chezmoiroot"), join(source, ".chezmoiroot"));
  cpSync(join(repo, "home"), join(source, "home"), { recursive: true });
  const scripts = join(source, "home/.chezmoiscripts");
  for (const name of readdirSync(scripts)) if (name !== migration) rmSync(join(scripts, name));
  return source;
}
function put(home, path, text) {
  const file = join(home, path);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
}
function legacy(home) {
  put(home, "dotfiles/git/gitconfig", "[user]\n email = old@example.com\n");
  put(home, ".gitconfig.local", '[includeIf "gitdir:~/dev/work/**"]\n path = ~/.gitconfig.work\n');
  put(home, ".gitconfig.work", "[user]\n email = work@example.com\n");
  symlinkSync(join(home, "dotfiles/git/gitconfig"), join(home, ".gitconfig"));
  put(home, "dotfiles/zsh/zshrc", "# legacy shell\n");
  put(home, "dotfiles/zsh/config/local.zsh", "export LOCAL_KEPT=yes\n");
  symlinkSync(join(home, "dotfiles/zsh/zshrc"), join(home, ".zshrc"));
  put(home, ".config/mise/dotfiles-selection.json", JSON.stringify({
    resolved: ["node", "markitdown", "markitdown-mcp", "yt-dlp"],
  }));
  put(home, ".config/mise/conf.d/10-dotfiles-yt-dlp.toml",
    `include = [${JSON.stringify(join(home, "dotfiles/mise/tools/yt-dlp.toml"))}]\n`);
  put(home, ".config/mise/conf.d/20-personal.toml", '[tools]\nruby = "3.3"\n');
}
function gitEmail(home, directory) {
  const result = spawnSync("git", ["-C", directory, "config", "user.email"], {
    env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("native apply preserves legacy Git, extra tools and local shell settings before cleanup", (t) => {
  const source = sourceFixture(t);
  const { home, run } = deployHome({ t, source, profile: "core", exclude: "externals", setup: legacy });
  assert(lstatSync(join(home, ".gitconfig")).isFile());
  assert.equal(gitEmail(home, home), "test@example.com");
  const work = join(home, "dev/work/example");
  mkdirSync(work, { recursive: true });
  assert.equal(spawnSync("git", ["init", "--quiet", work]).status, 0);
  assert.equal(gitEmail(home, work), "work@example.com");
  const extras = read(home, ".config/mise/conf.d/90-migrated-dotfiles.toml");
  for (const key of ['"pipx:markitdown"', '"pipx:markitdown-mcp"', 'yt-dlp']) assert(extras.includes(key));
  assert.equal(read(home, ".config/mise/conf.d/20-personal.toml"), '[tools]\nruby = "3.3"\n');
  assert(!existsSync(join(home, ".config/mise/dotfiles-selection.json")));
  assert(!existsSync(join(home, ".config/mise/conf.d/10-dotfiles-yt-dlp.toml")));
  assert(read(home, ".config/zsh/local.zsh").includes("LOCAL_KEPT=yes"));
  const backups = join(home, ".local/state/dotfiles/migration");
  const snapshot = readdirSync(backups);
  assert.equal(snapshot.length, 1);
  const archive = join(backups, snapshot[0], "configuration.tar.gz");
  assert.equal(lstatSync(archive).mode & 0o077, 0);
  const saved = spawnSync("tar", ["-xOzf", archive, ".config/mise/dotfiles-selection.json"], { encoding: "utf8" });
  assert.equal(saved.status, 0, saved.stderr);
  assert(JSON.parse(saved.stdout).resolved.includes("yt-dlp"));
  run("apply", "--no-tty", "--exclude", "externals");
  assert.deepEqual(readdirSync(backups), snapshot);
  assert.equal(run("diff", "--exclude", "scripts,externals").stdout, "");
});

test("updated migration finishes an earlier apply without shell links or a state reset", (t) => {
  const source = sourceFixture(t);
  const script = join(source, "home/.chezmoiscripts", migration);
  writeFileSync(script, "#!/bin/bash\nexit 0\n");
  const localMise = '[tools]\n"pipx:markitdown" = "custom-version"\n';
  const { home, run } = deployHome({ t, source, profile: "core", exclude: "externals", setup: (home) => {
    put(home, ".gitconfig", "[core]\n editor = nano\n");
    put(home, ".gitconfig.local", "[user]\n email = local@example.com\n");
    put(home, "dotfiles/zsh/config/local.zsh", "export LOCAL_KEPT=yes\n");
    put(home, ".config/mise/config.local.toml", localMise);
    put(home, ".config/mise/conf.d/10-dotfiles-markitdown.toml", "");
    put(home, ".config/mise/conf.d/10-dotfiles-yt-dlp.toml", "");
  } });
  copyFileSync(join(repo, "home/.chezmoiscripts", migration), script);
  run("apply", "--no-tty", "--exclude", "externals");
  assert.equal(gitEmail(home, home), "local@example.com");
  assert(read(home, ".gitconfig").includes("editor = nano"));
  assert.equal(read(home, ".config/mise/config.local.toml"), localMise);
  const extras = read(home, ".config/mise/conf.d/90-migrated-dotfiles.toml");
  assert(extras.includes("yt-dlp"));
  assert(!extras.includes("markitdown"));
  assert(read(home, ".config/zsh/local.zsh").includes("LOCAL_KEPT=yes"));
  const first = read(home, ".gitconfig");
  appendFileSync(script, '\n# Recheck after another migration revision.\n');
  run("apply", "--no-tty", "--exclude", "externals");
  assert.equal(read(home, ".gitconfig"), first);
  assert.equal(read(home, ".config/zsh/local.zsh").match(/LOCAL_KEPT=yes/g).length, 1);
  assert.equal(readdirSync(join(home, ".local/state/dotfiles/migration")).length, 1);
});

test("unknown tools and edited fragments stop migration before any removal", (t) => {
  for (const [name, text, expected] of [
    ["unknown", "", /Unknown legacy tools/],
    ["yt-dlp", '[tools]\n"yt-dlp" = "custom"\n', /contains custom settings/],
    ["yt-dlp", 'include = ["/my/custom-overrides.toml"]\n', /contains custom settings/],
  ]) {
    const source = sourceFixture(t);
    let fixture;
    assert.throws(() => deployHome({ t, source, profile: "core", exclude: "externals", setup: (home) => {
      fixture = home;
      legacy(home);
      put(home, `.config/mise/conf.d/10-dotfiles-${name}.toml`, text);
    } }), expected);
    assert(lstatSync(join(fixture, ".gitconfig")).isSymbolicLink());
    assert(existsSync(join(fixture, ".config/mise/dotfiles-selection.json")));
    assert(existsSync(join(fixture, `.config/mise/conf.d/10-dotfiles-${name}.toml`)));
    assert(!existsSync(join(fixture, ".local/state/dotfiles/migration")));
  }
});

test("legacy mise global overrides move intact to a missing local config", (t) => {
  const source = sourceFixture(t);
  const previous = '[tools]\nnode = "22"\n[env]\nLOCAL_EXAMPLE = "keep-me"\n';
  const { home } = deployHome({ t, source, profile: "core", exclude: "externals", setup: (home) => {
    put(home, ".config/mise/config.toml", previous);
  } });
  assert.equal(read(home, ".config/mise/config.local.toml").trim(), previous.trim());
  assert(read(home, ".config/mise/config.toml").startsWith("# Managed by chezmoi"));
});

test("two different local mise configs require a merge before cleanup", (t) => {
  const source = sourceFixture(t);
  let fixture;
  assert.throws(() => deployHome({ t, source, profile: "core", exclude: "externals", setup: (home) => {
    fixture = home;
    legacy(home);
    put(home, ".config/mise/config.toml", '[tools]\nnode = "22"\n');
    put(home, ".config/mise/config.local.toml", '[tools]\nnode = "24"\n');
  } }), /merge its local settings/);
  assert.equal(read(fixture, ".config/mise/config.toml"), '[tools]\nnode = "22"\n');
  assert.equal(read(fixture, ".config/mise/config.local.toml"), '[tools]\nnode = "24"\n');
  assert(existsSync(join(fixture, ".config/mise/dotfiles-selection.json")));
});

test("Claude migration removes only the legacy hook and keeps mixed-group metadata", (t) => {
  const { home, run } = deployHome({ t, profile: "gbl", setup: (home) => {
    const own = { type: "command", command: "echo keep-me" };
    put(home, ".claude/settings.json", JSON.stringify({ model: "keep-me", hooks: { SessionStart: [
      { matcher: "startup", hooks: [
        { type: "command", command: `/bin/bash '${home}/old checkout/script/claude-code-env.sh'` }, own,
      ] },
      { hooks: [{ type: "command", command: "echo /other/script/claude-code-env.sh" }] },
    ] } }));
  } });
  const first = read(home, ".claude/settings.json");
  const settings = JSON.parse(first);
  assert.equal(settings.model, "keep-me");
  assert.equal(settings.hooks.SessionStart[0].matcher, "startup");
  assert.deepEqual(settings.hooks.SessionStart[0].hooks, [{ type: "command", command: "echo keep-me" }]);
  assert.equal(settings.hooks.SessionStart[1].hooks[0].command, "echo /other/script/claude-code-env.sh");
  assert.equal(settings.hooks.SessionStart.length, 3);
  run("apply", "--no-tty", "--exclude", "scripts,externals");
  assert.equal(read(home, ".claude/settings.json"), first);
});
