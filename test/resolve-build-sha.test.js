import { realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveBuildSha } from "../scripts/resolve-build-sha.js";

describe("resolveBuildSha", () => {
  it("prefers a valid GITHUB_SHA", () => {
    expect(resolveBuildSha({ env: { GITHUB_SHA: "ABCDEF1234567890" } })).toBe("abcdef1");
  });

  it("rejects a short or non-hex env sha", () => {
    expect(resolveBuildSha({ env: { GITHUB_SHA: "abc" } })).toBe("local");
    expect(resolveBuildSha({ env: { GITHUB_SHA: "zzzzzzz" } })).toBe("local");
  });

  it("reads git when the toplevel is this root", () => {
    const root = "/proj";
    const exec = (args) => {
      expect(args[0]).toBe("git");
      expect(args[1]).toBe("-C");
      expect(args[2]).toBe(root);
      if (args[3] === "rev-parse" && args[4] === "--show-toplevel") return "/proj\n";
      if (args[3] === "rev-parse" && args[4] === "HEAD") return "deadbeefcafebabe\n";
      return "";
    };
    expect(resolveBuildSha({ env: {}, root, exec, realpath: (path) => path })).toBe("deadbee");
  });

  it("returns local when git points at a different tree", () => {
    const exec = (args) => (args.includes("--show-toplevel") ? "/other\n" : "abc1234abc\n");
    expect(resolveBuildSha({
      env: {},
      root: "/proj",
      exec,
      realpath: (path) => path,
    })).toBe("local");
  });

  it("does not throw when git is missing", () => {
    const exec = () => {
      throw new Error("no git");
    };
    expect(resolveBuildSha({ env: {}, root: "/proj", exec, realpath: realpathSync })).toBe("local");
  });
});
