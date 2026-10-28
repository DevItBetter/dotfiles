import { commandEnvironment } from "./command-environment.mjs";

try {
  if (typeof process.execve !== "function") {
    throw new Error("Node.js 24 or newer is required. Run mise install node@lts.");
  }
  let [executable, ...args] = process.argv.slice(2);
  if (!executable?.startsWith("/")) throw new Error("An absolute executable path is required.");
  const env = { ...process.env, ...commandEnvironment(process.env) };
  if (executable === "/bin/bash") {
    // Keep VS Code's command markers, but do not let its injected script source
    // interactive dotfiles. Agent Host ignores the profile's args and env.
    delete env.VSCODE_INJECTION;
    delete env.VSCODE_SHELL_LOGIN;
    const integration = args.includes("--init-file") || args.includes("--rcfile");
    args = ["--noprofile", ...(integration ? [] : ["--norc"]), ...args];
  }
  process.execve(executable, [executable, ...args], env);
} catch (error) {
  console.error(`Agent launcher: ${error.message}`);
  process.exit(1);
}
