import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync,
  rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const common = fileURLToPath(new URL("../lib/common.sh", import.meta.url));

for (const kind of ["file", "directory", "dangling link"]) {
  test(`relinking preserves a ${kind} and every existing backup`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "dotfiles-links-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const source = join(directory, "source");
    const destination = join(directory, "destination");
    writeFileSync(source, "new configuration");
    if (kind === "directory") {
      mkdirSync(destination);
      writeFileSync(join(destination, "local"), "local configuration");
    } else if (kind === "dangling link") {
      symlinkSync("missing-local-config", destination);
    } else {
      writeFileSync(destination, "local configuration");
    }
    mkdirSync(destination + ".backup");
    writeFileSync(join(destination + ".backup", "older"), "old backup");
    symlinkSync("missing-backup", destination + ".backup.1");

    const result = spawnSync("/bin/bash", ["-euc",
      'source "$1"; link_file "$2" "$3"; link_file "$2" "$3"',
      "--", common, source, destination], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readlinkSync(destination), source);
    assert.equal(readFileSync(join(destination + ".backup", "older"), "utf8"), "old backup");
    assert.equal(readlinkSync(destination + ".backup.1"), "missing-backup");
    const backup = destination + ".backup.2";
    if (kind === "directory") {
      assert(lstatSync(backup).isDirectory());
      assert.equal(readFileSync(join(backup, "local"), "utf8"), "local configuration");
    } else if (kind === "dangling link") {
      assert.equal(readlinkSync(backup), "missing-local-config");
    } else {
      assert.equal(readFileSync(backup, "utf8"), "local configuration");
    }
  });
}
