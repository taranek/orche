import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, listPresets, parsePresetFlag, ConfigError } from "./config.js";

function makeTmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "orche-test-"));
}

function writeJSON(dir: string, name: string, data: unknown): void {
  writeFileSync(path.join(dir, name), JSON.stringify(data));
}

const baseConfig = { layout: { name: "main", command: "echo hi" } };
const mobileConfig = { layout: { name: "mobile", command: "echo mobile" } };
const debugConfig = { layout: { name: "debug", command: "echo debug" } };

describe("parsePresetFlag", () => {
  it("parses -p flag", () => {
    expect(parsePresetFlag(["-p", "mobile"])).toBe("mobile");
  });

  it("parses --preset= flag", () => {
    expect(parsePresetFlag(["--preset=debug"])).toBe("debug");
  });

  it("returns undefined when no preset flag", () => {
    expect(parsePresetFlag(["fix-auth", "--tmux"])).toBeUndefined();
  });

  it("returns undefined when -p has no value", () => {
    expect(parsePresetFlag(["-p"])).toBeUndefined();
  });

  it("ignores -p when it is the last arg", () => {
    expect(parsePresetFlag(["start", "-p"])).toBeUndefined();
  });
});

describe("loadConfig", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("loads .orche.json", () => {
    writeJSON(tmp, ".orche.json", baseConfig);
    const config = loadConfig(tmp);
    expect(config.layout).toEqual(baseConfig.layout);
  });

  it("prefers .orche.local.json over .orche.json", () => {
    writeJSON(tmp, ".orche.json", baseConfig);
    writeJSON(tmp, ".orche.local.json", mobileConfig);
    const config = loadConfig(tmp);
    expect(config.layout).toEqual(mobileConfig.layout);
  });

  it("throws ConfigError when no config found", () => {
    expect(() => loadConfig(tmp)).toThrow(ConfigError);
    expect(() => loadConfig(tmp)).toThrow(".orche.json");
  });

  it("loads a preset config", () => {
    writeJSON(tmp, ".orche.mobile.json", mobileConfig);
    const config = loadConfig(tmp, "mobile");
    expect(config.layout).toEqual(mobileConfig.layout);
  });

  it("throws ConfigError for missing preset", () => {
    expect(() => loadConfig(tmp, "nonexistent")).toThrow(ConfigError);
    expect(() => loadConfig(tmp, "nonexistent")).toThrow('preset "nonexistent" not found');
  });

  it("lists available presets in error when preset not found", () => {
    writeJSON(tmp, ".orche.mobile.json", mobileConfig);
    writeJSON(tmp, ".orche.debug.json", debugConfig);
    try {
      loadConfig(tmp, "nonexistent");
      expect.unreachable("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("available presets:");
      expect(msg).toContain("mobile");
      expect(msg).toContain("debug");
    }
  });

  it("shows 'no preset files found' when none exist", () => {
    try {
      loadConfig(tmp, "nonexistent");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("no preset files found");
    }
  });

  it("preset flag ignores .orche.local.json", () => {
    writeJSON(tmp, ".orche.local.json", baseConfig);
    writeJSON(tmp, ".orche.mobile.json", mobileConfig);
    const config = loadConfig(tmp, "mobile");
    expect(config.layout).toEqual(mobileConfig.layout);
  });
});

describe("listPresets", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty array when no presets", () => {
    expect(listPresets(tmp)).toEqual([]);
  });

  it("lists preset names without .orche. prefix and .json suffix", () => {
    writeJSON(tmp, ".orche.mobile.json", {});
    writeJSON(tmp, ".orche.debug.json", {});
    writeJSON(tmp, ".orche.test.json", {});
    const presets = listPresets(tmp).sort();
    expect(presets).toEqual(["debug", "mobile", "test"]);
  });

  it("excludes .orche.json and .orche.local.json", () => {
    writeJSON(tmp, ".orche.json", {});
    writeJSON(tmp, ".orche.local.json", {});
    writeJSON(tmp, ".orche.mobile.json", {});
    expect(listPresets(tmp)).toEqual(["mobile"]);
  });

  it("ignores non-orche json files", () => {
    writeJSON(tmp, "package.json", {});
    writeJSON(tmp, "tsconfig.json", {});
    writeJSON(tmp, ".orche.mobile.json", {});
    expect(listPresets(tmp)).toEqual(["mobile"]);
  });
});
