import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { sharedHome } from "./home.mjs";

const { vscodePlan } = await import(pathToFileURL(join(sharedHome().agentEnv, "configure-vscode.mjs")).href);

// Opt-in: needs an installed VS Code SDK, mise Node LTS, and native sandbox support.
// Uses temporary state and the SDK's tool RPC directly, never a language model.
test("bundled VS Code SDK Bash keeps the normalized environment inside its native sandbox",
  { skip: !process.env.VSCODE_APP_ROOT, timeout: 30000 }, async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "vscode-sdk-test-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const home = process.env.HOME;
    const data = process.env.MISE_DATA_DIR || join(process.env.XDG_DATA_HOME || join(home, ".local/share"), "mise");
    const plan = vscodePlan({ appRoot: process.env.VSCODE_APP_ROOT, home: directory,
      config: join(directory, "config"), data: join(directory, "data") });
    mkdirSync(dirname(plan.launcher), { recursive: true });
    writeFileSync(plan.launcher, plan.content, { mode: 0o755 });
    const sdk = join(dirname(dirname(dirname(plan.runtime))), "copilot-sdk/index.js");
    const { CopilotClient, RuntimeConnection, approveAll } = await import(pathToFileURL(sdk).href);
    const env = {
      HOME: directory, PATH: `${data}/installs/node/old/bin:${home}/.local/bin:${process.env.PATH}`,
      MISE_DATA_DIR: data, MISE_CONFIG_DIR: join(directory, "mise-config"),
      MISE_CACHE_DIR: join(directory, "mise-cache"), MISE_STATE_DIR: join(directory, "mise-state"),
      COPILOT_OFFLINE: "true", COPILOT_TELEMETRY_DISABLED: "true", OTEL_SDK_DISABLED: "true",
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "diff.algorithm", GIT_CONFIG_VALUE_0: "histogram",
    };
    const client = new CopilotClient({ mode: "empty", baseDirectory: join(directory, "copilot"),
      connection: RuntimeConnection.forStdio({ path: plan.launcher }), env,
      workingDirectory: directory, useLoggedInUser: false, logLevel: "error" });
    const timer = setTimeout(() => { void client.forceStop(); }, 25000);
    try {
      await client.start();
      const session = await client.createSession({ model: "offline-test", availableTools: ["bash"],
        workingDirectory: directory, enableConfigDiscovery: false,
        provider: { type: "openai", baseUrl: "http://127.0.0.1:9/v1" },
        onPermissionRequest: approveAll });
      await session.rpc.options.update({ sandboxConfig: { enabled: true,
        allowDevToolAccess: true, userPolicy: { network: { allowOutbound: false } } } });
      const result = await session.rpc.tools.execute({ name: "bash", arguments: {
        command: 'printf "Bash=%s\\nPager=%s\\nPath=%s\\n" "$BASH_VERSION" "$GIT_PAGER" "$PATH"; git config --get color.ui; git config --get diff.algorithm',
        description: "Read-only environment verification",
      } });
      assert.equal(result.resultType, "success", result.textResultForLlm);
      assert(result.textResultForLlm.includes("Pager=cat\n"));
      assert(result.textResultForLlm.includes(`Path=${data}/shims:`));
      assert(result.textResultForLlm.includes("\nfalse\nhistogram\n"));
      assert(!result.textResultForLlm.includes("/installs/node/old"));
      assert.equal(result.toolTelemetry.properties.sandboxApplied, "true");
      assert.equal(result.toolTelemetry.properties.sandboxOptOutRequested, "false");
    } finally {
      clearTimeout(timer);
      await client.stop();
    }
  });
