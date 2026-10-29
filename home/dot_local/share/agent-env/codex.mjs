import { commandEnvironment } from "./command-environment.mjs";
import { npmEntry } from "./npm-cli.mjs";

try {
  if (typeof process.execve !== "function") {
    throw new Error("Node.js 24 or newer is required. Run mise install node@lts.");
  }
  const [executable, ...args] = process.argv.slice(2);
  if (!executable) throw new Error("Run ~/.local/share/agent-env/codex instead.");
  const overrides = commandEnvironment(process.env);
  const env = { ...process.env, ...overrides };
  const entry = npmEntry(executable, env);
  // Individual dotted keys preserve unrelated shell policy settings. Codex
  // applies these to shell commands even when using an existing app server.
  const config = ["-c", "allow_login_shell=false", "-c", "features.shell_snapshot=false"];
  for (const [key, value] of Object.entries(overrides)) {
    config.push("-c", `shell_environment_policy.set.${key}=${JSON.stringify(value)}`);
  }
  process.execve(process.execPath, [process.execPath, entry, ...config, ...args], env);
} catch (error) {
  console.error(`Codex launcher: ${error.message}`);
  process.exit(1);
}
