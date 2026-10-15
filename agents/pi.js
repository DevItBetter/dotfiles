import { commandEnvironment } from "./command-environment.mjs";

// Pi already uses noninteractive Bash. Normalize the environment inherited by
// its tools, extension subprocesses, and ! / !! commands without replacing them.
export default function commandEnvironmentExtension() {
  Object.assign(process.env, commandEnvironment(process.env));
}
