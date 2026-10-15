import { commandEnvironment } from "./command-environment.mjs";

export default {
  id: "command-environment",
  async setup(ctx) {
    await ctx.shell.hook("create.before", (event) => {
      Object.assign(event.env, commandEnvironment({ ...process.env, ...event.env }));
      event.shell = "/bin/bash";
    });
  },
};
