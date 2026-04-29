import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { AgentsConfig } from "./types.js";

const CONFIG_NAME = ".orche.json";
const CONFIG_LOCAL_NAME = ".orche.local.json";
const CONFIG_PRESET_PREFIX = ".orche.";
const CONFIG_PRESET_SUFFIX = ".json";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function listPresets(cwd: string): string[] {
  const files = readdirSync(cwd);
  return files
    .filter(f => f.startsWith(CONFIG_PRESET_PREFIX) && f.endsWith(CONFIG_PRESET_SUFFIX) && f !== CONFIG_NAME && f !== CONFIG_LOCAL_NAME)
    .map(f => f.slice(CONFIG_PRESET_PREFIX.length, -CONFIG_PRESET_SUFFIX.length));
}

export function loadConfig(cwd: string, preset?: string): AgentsConfig {
  if (preset) {
    const presetPath = path.join(cwd, `${CONFIG_PRESET_PREFIX}${preset}${CONFIG_PRESET_SUFFIX}`);
    if (!existsSync(presetPath)) {
      const available = listPresets(cwd);
      const list = available.length > 0
        ? `\navailable presets: ${available.join(", ")}`
        : "\nno preset files found in current directory";
      throw new ConfigError(`preset "${preset}" not found (looked for ${CONFIG_PRESET_PREFIX}${preset}${CONFIG_PRESET_SUFFIX})${list}`);
    }
    const raw = readFileSync(presetPath, "utf-8");
    return JSON.parse(raw) as AgentsConfig;
  }

  const localPath = path.join(cwd, CONFIG_LOCAL_NAME);
  const configPath = path.join(cwd, CONFIG_NAME);

  if (existsSync(localPath)) {
    const raw = readFileSync(localPath, "utf-8");
    return JSON.parse(raw) as AgentsConfig;
  }

  if (!existsSync(configPath)) {
    throw new ConfigError(`no ${CONFIG_NAME} found in ${cwd}`);
  }
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as AgentsConfig;
}

export function parsePresetFlag(args: string[]): string | undefined {
  const idx = args.indexOf("-p");
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  const long = args.find(a => a.startsWith("--preset="));
  if (long) return long.split("=")[1];
  return undefined;
}
