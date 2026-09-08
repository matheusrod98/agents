import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEventBus,
  DefaultPackageManager,
  DefaultResourceLoader,
  getAgentDir,
  type ExtensionContext,
  type SettingsManager,
} from "@earendil-works/pi-coding-agent";

export const CHILD_IDENTITY_EVENT = "recursive-subagents:child-runtime";

function headlessContext<T extends ExtensionContext>(context: T): T {
  const unavailable = () => {
    throw new Error(
      "This child extension requested interactive UI. Use ask_parent to describe the needed interaction; the parent can handle it or escalate to the user. No approval or answer was supplied.",
    );
  };
  return {
    ...context,
    hasUI: false,
    ui: {
      ...context.ui,
      select: async () => unavailable(),
      confirm: async () => unavailable(),
      input: async () => unavailable(),
      editor: async () => unavailable(),
      custom: async () => unavailable(),
      onTerminalInput: () => unavailable(),
    },
  };
}

/** Select already-installed resources by native package provenance, never rediscover every parent UI. */
export async function childResources(
  cwd: string,
  settingsManager: SettingsManager,
  instructions: string,
) {
  const configPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "child-extensions.json",
  );
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (
    !Array.isArray(config.sources) ||
    config.sources.some(
      (source: unknown) => typeof source !== "string" || !source.trim(),
    )
  ) {
    throw new Error(
      `Invalid child extension sources in ${configPath}. Expected an array of package sources or local paths.`,
    );
  }
  const packages = new DefaultPackageManager({
    cwd,
    agentDir: getAgentDir(),
    settingsManager,
  });
  const resources = await packages.resolve(async () => "error");
  const selected = new Set<string>();
  for (const source of config.sources as string[]) {
    const matches = resources.extensions.filter(
      (resource) =>
        resource.enabled &&
        (resource.metadata.source === source ||
          resource.path === resolve(cwd, source)),
    );
    if (!matches.length)
      throw new Error(
        `Child extension ${source} is not an enabled installed resource in ${cwd}. Add it to Pi configuration or remove it from ${configPath}.`,
      );
    for (const resource of matches) selected.add(resource.path);
  }
  const eventBus = createEventBus();
  eventBus.on(CHILD_IDENTITY_EVENT, (identity) => {
    if (identity && typeof identity === "object" && "child" in identity)
      identity.child = true;
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    settingsManager,
    eventBus,
    noExtensions: true,
    additionalExtensionPaths: [...selected],
    appendSystemPrompt: [instructions],
    extensionsOverride: (loaded) => {
      // Preserve native print-mode hasUI=false. Guard only dialog attempts, not work tools or their results.
      for (const extension of loaded.extensions) {
        for (const tool of extension.tools.values()) {
          const execute = tool.definition.execute;
          tool.definition = {
            ...tool.definition,
            execute: (id, params, signal, update, ctx) =>
              execute(id, params, signal, update, headlessContext(ctx)),
          };
        }
        for (const [event, handlers] of extension.handlers) {
          extension.handlers.set(
            event,
            handlers.map(
              (handler) => (event, ctx) =>
                handler(
                  event,
                  ctx && typeof ctx === "object" && "ui" in ctx
                    ? headlessContext(ctx as ExtensionContext)
                    : ctx,
                ),
            ),
          );
        }
      }
      return loaded;
    },
  });
  await loader.reload();
  const errors = loader.getExtensions().errors;
  if (errors.length)
    throw new Error(
      `Child extension loading failed:\n${errors.map((error) => `${error.path}: ${error.error}`).join("\n")}`,
    );
  return { loader, eventBus };
}
