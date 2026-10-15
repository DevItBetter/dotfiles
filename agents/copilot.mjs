import { realpathSync } from "node:fs";
import { commandEnvironment } from "./command-environment.mjs";

try {
  if (typeof process.execve !== "function") {
    throw new Error("Node.js 24 or newer is required. Run mise install node@lts.");
  }
  const [executable, ...args] = process.argv.slice(2);
  if (!executable) throw new Error("Run bash ~/dotfiles/script/copilot.sh instead.");
  const env = { ...process.env, ...commandEnvironment(process.env) };
  // Run the npm entry point with the real Node binary. Its shebang would resolve
  // Node through mise again and reintroduce installation directories on PATH.
  process.execve(process.execPath, [process.execPath, realpathSync(executable), ...args], env);
} catch (error) {
  console.error(`Copilot launcher: ${error.message}`);
  process.exit(1);
}
