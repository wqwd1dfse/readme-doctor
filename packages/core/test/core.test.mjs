import assert from "node:assert/strict";
import test from "node:test";
import {
  createDockerCreateArgs,
  createPlan,
  executePlan,
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
      { command: "# prepare\npnpm install\n\npnpm build", sourceLine: 7 },
      { command: "node --version", sourceLine: 13 },
    ],
  );
});

test("preserves block state, supports terminal fences, and skips opted-out examples", () => {
  const markdown = [
    "```zsh",
    "cd packages/core",
    "export MODE=test",
    "node -e \"console.log(process.cwd())\"",
    "```",
    "<!-- readme-doctor: ignore-next -->",
    "```bash",
    "rm -rf example-only",
    "```",
    "```terminal",
    "$ node --version",
    "v24.0.0",
    "$ npm --version",
    "11.0.0",
    "```",
  ].join("\n");

  const plan = createPlan("README.md", parseMarkdown(markdown));
  assert.equal(plan.steps.length, 2);
  assert.match(plan.steps[0].command, /cd packages\/core\nexport MODE=test/);
  assert.equal(plan.steps[1].command, "node --version\nnpm --version");
});

test("does not apply control markers shown inside non-executable fences", () => {
  const markdown = [
    "```html",
    "<!-- readme-doctor: ignore-next -->",
    "```",
    "```sh",
    "node --version",
    "```",
  ].join("\n");

  const plan = createPlan("README.md", parseMarkdown(markdown));
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].command, "node --version");
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

test("continues after failures when requested but always stops after timeouts", async () => {
  const plan = createPlan("README.md", parseMarkdown("```sh\nfalse\n```\n```sh\necho ok\n```"));
  const executor = {
    async execute(step) {
      return {
        stepId: step.id,
        status: step.command === "false" ? "failed" : "passed",
        exitCode: step.command === "false" ? 1 : 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
      };
    },
  };
  const continued = await executePlan(plan, executor, {
    cwd: ".",
    timeoutMs: 1000,
    continueOnError: true,
  });
  assert.equal(continued.length, 2);

  const timedOut = await executePlan(plan, {
    async execute(step) {
      return { stepId: step.id, status: "timed_out", exitCode: null, stdout: "", stderr: "", durationMs: 1 };
    },
  }, { cwd: ".", timeoutMs: 1000, continueOnError: true });
  assert.equal(timedOut.length, 1);
});
