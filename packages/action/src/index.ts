import { randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DockerExecutor,
  LocalShellExecutor,
  createPlan,
  executePlan,
  parseMarkdown,
  renderMarkdownReport,
  type ExecutionPlan,
  type ExecutionResult,
} from "@readme-doctor/core";
import { buildPullRequestComment, upsertPullRequestComment } from "./github.js";

interface GitHubEvent {
  pull_request?: { number?: number };
  repository?: { full_name?: string };
}

const getInput = (name: string, fallback = "") =>
  process.env[`INPUT_${name.toUpperCase()}`]?.trim() || fallback;

const parseBooleanInput = (name: string, fallback: boolean) =>
  getInput(name, String(fallback)).toLowerCase() === "true";

async function main(): Promise<void> {
  const fileInput = getInput("FILE", "README.md");
  const workingDirectory = resolve(getInput("WORKING-DIRECTORY", "."));
  const sourcePath = resolve(workingDirectory, fileInput);
  const shouldRun = parseBooleanInput("RUN", true);
  const useLocalExecutor = getInput("EXECUTOR", "docker").toLowerCase() === "local";
  const allowNetwork = parseBooleanInput("NETWORK", false);
  const continueOnError = parseBooleanInput("CONTINUE-ON-ERROR", false);
  const failOnEmpty = parseBooleanInput("FAIL-ON-EMPTY", false);
  const timeoutMs = Number.parseInt(getInput("TIMEOUT-MS", "120000"), 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeout-ms must be a positive integer");
  }

  const markdown = await readFile(sourcePath, "utf8");
  const plan = createPlan(fileInput, parseMarkdown(markdown));
  const emptyPlanFailed = failOnEmpty && plan.steps.length === 0;
  const results = shouldRun
    ? await executePlan(
        plan,
        useLocalExecutor
          ? new LocalShellExecutor()
          : new DockerExecutor({
              allowNetwork,
              image: getInput("IMAGE", "node:24-bookworm-slim"),
            }),
        { cwd: workingDirectory, timeoutMs, continueOnError },
      )
    : undefined;
  const report = renderMarkdownReport(plan, results);
  const passed = !emptyPlanFailed && (results ? results.every((result) => result.status === "passed") : true);

  console.log(report);
  await writeSummary(report);
  await writeOutputs(passed, report);
  emitAnnotations(plan, results ?? []);
  await maybeComment(report);

  if (!passed) process.exitCode = 1;
}

async function writeSummary(report: string): Promise<void> {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
}

async function writeOutputs(passed: boolean, report: string): Promise<void> {
  if (!process.env.GITHUB_OUTPUT) return;
  const delimiter = `README_DOCTOR_${randomUUID()}`;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `passed=${passed}\nreport<<${delimiter}\n${report}\n${delimiter}\n`,
  );
}

function emitAnnotations(plan: ExecutionPlan, results: ExecutionResult[]): void {
  const steps = new Map(plan.steps.map((step) => [step.id, step]));
  for (const result of results) {
    if (result.status === "passed") continue;
    const step = steps.get(result.stepId);
    if (!step) continue;
    const message = result.stderr.trim() || result.stdout.trim() || `Command ${result.status}`;
    console.log(
      `::error file=${escapeProperty(plan.sourcePath)},line=${step.sourceLine},title=Readme Doctor::${escapeData(`${step.command}: ${message}`)}`,
    );
  }
}

async function maybeComment(report: string): Promise<void> {
  if (!parseBooleanInput("COMMENT", true)) return;
  const token = getInput("TOKEN");
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !eventPath) {
    console.log("::notice title=Readme Doctor::PR comment skipped because token or event context is unavailable.");
    return;
  }

  const event = JSON.parse(await readFile(eventPath, "utf8")) as GitHubEvent;
  const pullRequestNumber = event.pull_request?.number;
  const repository = process.env.GITHUB_REPOSITORY || event.repository?.full_name;
  if (!pullRequestNumber || !repository) return;

  try {
    const outcome = await upsertPullRequestComment({
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
      repository,
      pullRequestNumber,
      token,
      body: buildPullRequestComment(report),
    });
    console.log(`Readme Doctor ${outcome} pull request comment.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Readme Doctor comment skipped::${escapeData(message)}`);
  }
}

function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error title=Readme Doctor infrastructure error::${escapeData(message)}`);
  process.exitCode = 2;
});
