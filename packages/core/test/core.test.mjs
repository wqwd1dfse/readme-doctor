import assert from "node:assert/strict";
import test from "node:test";
import {
  createDockerCreateArgs,
  createPlan,
  parseMarkdown,
  renderMarkdownReport,
} from "../dist/index.js";

test("extracts shell and console commands with source lines", () => {
  const markdown = [
    "# Demo",
    "",
    "## Install",
    "",
    "```bash",
    "# prepare",
    "pnpm install",
    "",
    "pnpm build",
    "```",
    "",
    "```console",
    "$ node --version",
    "v24.0.0",
    "```",
  ].join("\n");

  const blocks = parseMarkdown(markdown);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].commands, [
    { value: "pnpm install", sourceLine: 7 },
    { value: "pnpm build", sourceLine: 9 },
  ]);
  assert.deepEqual(blocks[1].commands, [{ value: "node --version", sourceLine: 13 }]);

  const plan = createPlan("README.md", blocks);
  assert.deepEqual(
    plan.steps.map(({ command, sourceLine }) => ({ command, sourceLine })),
    [
      { command: "pnpm install", sourceLine: 7 },
      { command: "pnpm build", sourceLine: 9 },
      { command: "node --version", sourceLine: 13 },
    ],
  );
});

test("renders an auditable dry-run report", () => {
  const plan = createPlan("README.md", parseMarkdown("# Start\n\n```sh\nnode -v\n```"));
  const report = renderMarkdownReport(plan);
  assert.match(report, /planned/);
  assert.match(report, /node -v/);
  assert.match(report, /\| 4 \|/);
});

test("builds a locked-down Docker sandbox", () => {
  const args = createDockerCreateArgs("doctor-test", "C:\\repo", {
    image: "node:24-bookworm-slim",
    allowNetwork: false,
    memory: "2g",
    cpus: "2",
    workspaceSize: "1g",
    maxOutputBytes: 1_000_000,
  });

  assert.deepEqual(args.slice(0, 5), ["create", "--name", "doctor-test", "--network", "none"]);
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("no-new-privileges"));
  assert.ok(args.includes("ALL"));
  assert.ok(args.includes("type=bind,source=C:\\repo,target=/source,readonly"));
});
