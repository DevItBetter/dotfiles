import { readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

// Resolve either an npm executable symlink or mise's aube shell shim without
// running its Node shebang through mise a second time.
export function npmEntry(executable, env) {
  let entry = realpathSync(executable);
  const target = readFileSync(entry, "utf8").split(/\r?\n/, 2)[1]
    ?.match(/^# aube-bin-shim v2 target=(.+)$/)?.[1];
  if (target) {
    const basedir = dirname(entry);
    env.NODE_PATH = [resolve(basedir, ".."), resolve(basedir, "../.mise/node_modules")].join(delimiter);
    entry = realpathSync(resolve(basedir, target));
  }
  return entry;
}
