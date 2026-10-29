import { homedir } from "node:os";
import { delimiter, join, resolve, sep } from "node:path";

// A command's own color.<command> setting overrides color.ui, so each is disabled.
const COLOR_KEYS = ["color.ui", "color.advice", "color.branch", "color.diff", "color.grep",
  "color.interactive", "color.push", "color.remote", "color.showbranch", "color.status",
  "color.transport"];

// Return only overrides. Callers retain their own credentials and session env.
export function commandEnvironment(inherited) {
  const home = inherited.HOME || homedir();
  const dataDir = inherited.MISE_DATA_DIR ||
    join(inherited.XDG_DATA_HOME || join(home, ".local/share"), "mise");
  const installs = resolve(dataDir, "installs");
  const shims = inherited.MISE_SHIMS_DIR || join(dataDir, "shims");
  const paths = (inherited.PATH || "/usr/local/bin:/usr/bin:/bin")
    .split(delimiter)
    .filter((entry) => entry && !resolve(entry).startsWith(installs + sep));
  const env = {
    PATH: [...new Set([shims, join(home, ".local/bin"), ...paths])].join(delimiter),
    GIT_PAGER: "cat",
  };

  const count = inherited.GIT_CONFIG_COUNT || "0";
  if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count))) {
    throw new Error("GIT_CONFIG_COUNT must be a nonnegative integer");
  }
  let index = Number(count);
  const colors = new Map();
  for (let i = 0; i < index; i++) {
    for (const prefix of ["GIT_CONFIG_KEY_", "GIT_CONFIG_VALUE_"]) {
      const name = `${prefix}${i}`;
      if (inherited[name] === undefined) {
        throw new Error(`GIT_CONFIG_COUNT references missing ${name}`);
      }
      env[name] = inherited[name];
    }
    colors.set(env[`GIT_CONFIG_KEY_${i}`].toLowerCase(), env[`GIT_CONFIG_VALUE_${i}`]);
  }
  // Reloads and nested agents must not keep appending the same override.
  for (const key of COLOR_KEYS) {
    if (colors.get(key) === "false") continue;
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = "false";
    index++;
  }
  env.GIT_CONFIG_COUNT = String(index);
  return env;
}
