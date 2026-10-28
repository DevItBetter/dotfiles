import { readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { commandEnvironment } from "./command-environment.mjs";

try {
  if (typeof process.execve !== "function") {
    throw new Error("Node.js 24 or newer is required. Run mise install node@lts.");
  }
  const [executable, ...args] = process.argv.slice(2);
  if (!executable) throw new Error("Run bash ~/dotfiles/script/copilot.sh instead.");
  const env = { ...process.env, ...commandEnvironment(process.env) };
  let entry = realpathSync(executable);
  const shimTarget = readFileSync(entry, "utf8").split(/\r?\n/, 2)[1]
    ?.match(/^# aube-bin-shim v2 target=(.+)$/)?.[1];
  if (shimTarget) {
    // mise's aube installer creates a shell wrapper rather than a JS symlink.
    // Follow its relative target and preserve the wrapper's module search paths.
    const basedir = dirname(entry);
    env.NODE_PATH = [resolve(basedir, ".."), resolve(basedir, "../.mise/node_modules")].join(delimiter);
    entry = realpathSync(resolve(basedir, shimTarget));
  }
  // Run the npm entry point with the real Node binary. Its shebang would resolve
  // Node through mise again and reintroduce installation directories on PATH.
  process.execve(process.execPath, [process.execPath, entry, ...args], env);
} catch (error) {
  console.error(`Copilot launcher: ${error.message}`);
  process.exit(1);
}
