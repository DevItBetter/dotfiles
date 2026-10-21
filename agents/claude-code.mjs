import { appendFileSync } from "node:fs";
import { commandEnvironment } from "./command-environment.mjs";

const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

// Claude Code sources CLAUDE_ENV_FILE before each Bash command, so a SessionStart
// hook can normalize those commands without changing Claude Code's own process.
try {
  const file = process.env.CLAUDE_ENV_FILE;
  if (!file) throw new Error("CLAUDE_ENV_FILE is not set. Run this as a SessionStart hook.");
  const env = commandEnvironment(process.env);
  appendFileSync(file, Object.entries(env)
    .map(([name, value]) => `export ${name}=${quote(value)}\n`).join(""));
} catch (error) {
  console.error(`Claude Code environment: ${error.message}`);
  process.exit(1);
}
