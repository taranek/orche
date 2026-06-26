import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildLayout } from "./layout.js";
import type { Multiplexer } from "./multiplexer.js";
import type { PaneConfig, SplitConfig } from "./types.js";

interface SplitCall {
  target: string;
  direction: "horizontal" | "vertical";
}

/**
 * A fake multiplexer that mimics cmux: each split creates a fresh surface that
 * becomes the active pane (cmux auto-focuses the new split). It records every
 * splitPane target so tests can assert which surface each split was anchored to.
 */
class FakeMux implements Multiplexer {
  readonly name = "fake";
  panes: string[] = ["p0"];
  splitCalls: SplitCall[] = [];
  commands: { target: string; command: string }[] = [];

  createSession(): void {}
  killSession(): void {}
  attach(): void {}

  getActivePaneId(): string {
    return this.panes[this.panes.length - 1];
  }

  listPaneIds(): string[] {
    return [...this.panes];
  }

  splitPane(target: string, direction: "horizontal" | "vertical"): void {
    this.splitCalls.push({ target, direction });
    this.panes.push(`p${this.panes.length}`);
  }

  focusPane(): void {}
  renamePaneTitle(): void {}
  sendCommand(target: string, command: string): void {
    this.commands.push({ target, command });
  }

  isInsideSession(): boolean {
    return false;
  }
  detectFirstPane(): string | undefined {
    return undefined;
  }
}

describe("buildLayout", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "orche-layout-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("chains flat sibling splits off the previous sibling (left-to-right order)", () => {
    const mux = new FakeMux();
    const layout: SplitConfig = {
      direction: "horizontal",
      panes: [
        { name: "a", command: "cmd-a" },
        { name: "b", command: "cmd-b" },
        { name: "c", command: "cmd-c" },
      ],
    };

    buildLayout(mux, "sess", layout, tmp);

    // Two splits to produce three columns, each anchored to the prior sibling
    // (NOT all anchored to the first pane) so they render a|b|c in order.
    expect(mux.splitCalls).toEqual([
      { target: "p0", direction: "horizontal" },
      { target: "p1", direction: "horizontal" },
    ]);
  });

  it("anchors a nested split's children to that branch's surface", () => {
    const mux = new FakeMux();
    // vertical[ agent, horizontal[db, be, fe] ]
    const layout: SplitConfig = {
      direction: "vertical",
      panes: [
        { name: "agent", command: "claude" },
        {
          direction: "horizontal",
          panes: [
            { name: "db", command: "db-up" },
            { name: "be", command: "be-up" },
            { name: "fe", command: "fe-up" },
          ],
        } as SplitConfig,
      ],
    };

    buildLayout(mux, "sess", layout, tmp);

    // 1 vertical split (agent | branch) + 2 horizontal splits for the columns.
    expect(mux.splitCalls).toEqual([
      { target: "p0", direction: "vertical" },
      { target: "p1", direction: "horizontal" },
      { target: "p2", direction: "horizontal" },
    ]);

    const session = JSON.parse(
      readFileSync(path.join(tmp, ".orche", "session.json"), "utf8")
    );
    expect(session.panes).toEqual({
      agent: "p0",
      db: "p1",
      be: "p2",
      fe: "p3",
    });
  });

  it("records a single pane with no splits", () => {
    const mux = new FakeMux();
    const layout: PaneConfig = { name: "solo", command: "echo hi" };

    buildLayout(mux, "sess", layout, tmp);

    expect(mux.splitCalls).toEqual([]);
    const session = JSON.parse(
      readFileSync(path.join(tmp, ".orche", "session.json"), "utf8")
    );
    expect(session.panes).toEqual({ solo: "p0" });
  });
});
