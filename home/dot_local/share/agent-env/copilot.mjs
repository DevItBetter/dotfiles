import { commandEnvironment } from "./command-environment.mjs";
import { npmEntry } from "./npm-cli.mjs";

try {
  if (typeof process.execve !== "function") {
    throw new Error("Node.js 24 or newer is required. Run mise install node@lts.");
  }
  const [executable, ...args] = process.argv.slice(2);
  if (!executable) throw new Error("Run ~/.local/share/agent-env/copilot instead.");
  const env = { ...process.env, ...commandEnvironment(process.env) };
  const entry = npmEntry(executable, env);
  // Run the npm entry point with the real Node binary. Its shebang would resolve
  // Node through mise again and reintroduce installation directories on PATH.
  process.execve(process.execPath, [process.execPath, entry, ...args], env);
} catch (error) {
  console.error(`Copilot launcher: ${error.message}`);
  process.exit(1);
}
