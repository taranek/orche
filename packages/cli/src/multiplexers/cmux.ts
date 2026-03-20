import { execSync } from "node:child_process";
import type { Multiplexer } from "../multiplexer.js";

const DEBUG = !!process.env.ORCHE_DEBUG;

function log(...args: unknown[]): void {
  if (DEBUG) console.error("[cmux]", ...args);
}

function run(cmd: string): string {
  log("$", cmd);
  const out = execSync(cmd).toString().trim();
  log("→", out.length > 200 ? out.slice(0, 200) + "…" : out);
  return out;
}

export class CmuxMultiplexer implements Multiplexer {
  readonly name = "cmux";

  // Track surfaces we created so layout can target them
  private surfaces: string[] = [];

  createSession(_name: string, cwd: string): void {
    const initial = process.env.CMUX_SURFACE_ID;
    log("createSession initial surface:", initial);
    if (initial) {
      this.surfaces = [initial];
      this.sendCommand(initial, `cd "${cwd}"`);
    } else {
      log("warning: CMUX_SURFACE_ID not set — are you running inside cmux?");
    }
  }

  killSession(_name: string): void {
    // No-op — we didn't create a workspace
  }

  attach(_name: string): void {
    // cmux is a native macOS app — already visible
  }

  getActivePaneId(_session: string): string {
    const id = this.surfaces[this.surfaces.length - 1] ?? "";
    log("getActivePaneId →", id);
    return id;
  }

  listPaneIds(_session: string): string[] {
    log("listPaneIds →", this.surfaces);
    return [...this.surfaces];
  }

  splitPane(
    _target: string,
    direction: "horizontal" | "vertical",
    _sizePercent: number,
    cwd: string
  ): void {
    const cmuxDir = direction === "horizontal" ? "right" : "down";
    // new-split returns "OK surface:<ref> workspace:<ref>"
    const output = run(`cmux new-split ${cmuxDir}`);

    const match = output.match(/surface:(\S+)/);
    if (match) {
      const newRef = `surface:${match[1]}`;
      log("splitPane new surface:", newRef);
      this.surfaces.push(newRef);
      // cd into worktree on the new surface
      this.sendCommand(newRef, `cd "${cwd}"`);
    } else {
      log("warning: could not parse surface from new-split output:", output);
    }
    log("splitPane surfaces now:", this.surfaces);
  }

  focusPane(_paneId: string): void {
    // no-op — cmux auto-focuses after split
  }

  renamePaneTitle(paneId: string, name: string): void {
    try {
      execSync(`cmux rename-tab --surface ${paneId} "${name}"`, { stdio: "ignore" });
    } catch {
      // ignore
    }
  }

  sendCommand(target: string, command: string): void {
    if (!command || !target) {
      log("sendCommand skipped — target:", target, "command:", command);
      return;
    }
    log("sendCommand →", target, command);
    execSync(
      `cmux send --surface ${target} "${command.replace(/"/g, '\\"')}"`,
      { stdio: "ignore" }
    );
    execSync(`cmux send-key --surface ${target} enter`, { stdio: "ignore" });
  }

  isInsideSession(): boolean {
    return !!process.env.CMUX_WORKSPACE_ID;
  }

  detectFirstPane(): string | undefined {
    // Return the first surface in the workspace (where the agent typically runs)
    // NOT the current surface (which is where `orche review` was called)
    try {
      const output = run(`cmux tree --json`);
      const tree = JSON.parse(output);
      // Walk the tree to find the first terminal surface
      const first = this.findFirstSurface(tree);
      if (first) return first;
    } catch {
      // fallback
    }
    return process.env.CMUX_SURFACE_ID ?? undefined;
  }

  private findFirstSurface(node: unknown): string | null {
    if (!node || typeof node !== 'object') return null;
    const obj = node as Record<string, unknown>;
    if (obj.surface_ref && typeof obj.surface_ref === 'string') {
      // Skip the current surface
      if (obj.surface_ref !== `surface:${process.env.CMUX_SURFACE_ID}`) {
        return obj.surface_ref as string;
      }
    }
    // Recurse into arrays and objects
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          const found = this.findFirstSurface(item);
          if (found) return found;
        }
      } else if (val && typeof val === 'object') {
        const found = this.findFirstSurface(val);
        if (found) return found;
      }
    }
    return null;
  }
}
