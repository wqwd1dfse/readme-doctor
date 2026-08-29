#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DockerExecutor,
  LocalShellExecutor,
  createPlan,
  executePlan,
  parseMarkdown,
  renderMarkdownReport,
} from "@readme-doctor/core";

const args = process.argv.slice(2);
const command = args[0];
const sourcePath = resolve(args.find((arg, index) => index > 0 && !arg.startsWith("--")) ?? "README.md");
const shouldRun = args.includes("--run");
const useLocalExecutor = args.includes("--executor=local");
const allowNetwork = args.includes("--network");
const imageArg = args.find((arg) => arg.startsWith("--image="));
const image = imageArg?.slice("--image=".length);

if (command !== "check") {
  console.error("Usage: readme-doctor check [README.md] [--run] [--network] [--image=node:24-bookworm-slim] [--executor=local]");
  process.exitCode = 2;
} else {
  try {
    const markdown = await readFile(sourcePath, "utf8");
    const plan = createPlan(sourcePath, parseMarkdown(markdown));

    if (!shouldRun) {
      console.log(renderMarkdownReport(plan));
    } else {
      const executor = useLocalExecutor
        ? new LocalShellExecutor()
        : new DockerExecutor({ allowNetwork, image });
      const results = await executePlan(plan, executor, {
        cwd: dirname(sourcePath),
        timeoutMs: 120_000,
      });
      console.log(renderMarkdownReport(plan, results));
      if (results.some((result) => result.status !== "passed")) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
