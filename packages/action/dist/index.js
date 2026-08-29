// src/index.ts
import { randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// ../core/dist/docker-executor.js
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
var DockerExecutor = class {
  config;
  containerName = `readme-doctor-${randomBytes(6).toString("hex")}`;
  isCreated = false;
  constructor(config = {}) {
    this.config = {
      image: config.image ?? "node:24-bookworm-slim",
      allowNetwork: config.allowNetwork ?? false,
      memory: config.memory ?? "2g",
      cpus: config.cpus ?? "2",
      workspaceSize: config.workspaceSize ?? "1g",
      maxOutputBytes: config.maxOutputBytes ?? 1e6
    };
  }
  async setup(options) {
    const create = await runProcess("docker", createDockerCreateArgs(this.containerName, options.cwd, this.config), options.timeoutMs, this.config.maxOutputBytes);
    if (create.exitCode !== 0) {
      throw new Error(`Unable to create Docker sandbox: ${create.stderr || create.stdout}`);
    }
    this.isCreated = true;
    const start = await runProcess("docker", ["start", this.containerName], options.timeoutMs, this.config.maxOutputBytes);
    if (start.exitCode !== 0) {
      throw new Error(`Unable to start Docker sandbox: ${start.stderr || start.stdout}`);
    }
  }
  async execute(step, options) {
    const startedAt = Date.now();
    const result = await runProcess("docker", ["exec", this.containerName, shellForLanguage(step.language), "-ec", step.command], options.timeoutMs, this.config.maxOutputBytes);
    return {
      stepId: step.id,
      status: result.timedOut ? "timed_out" : result.exitCode === 0 ? "passed" : "failed",
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - startedAt
    };
  }
  async dispose() {
    if (!this.isCreated)
      return;
    await runProcess("docker", ["rm", "--force", this.containerName], 3e4, this.config.maxOutputBytes);
    this.isCreated = false;
  }
};
function shellForLanguage(language) {
  return language === "bash" || language === "zsh" ? language : "sh";
}
function createDockerCreateArgs(containerName, sourceDirectory, config) {
  return [
    "create",
    "--name",
    containerName,
    "--network",
    config.allowNetwork ? "bridge" : "none",
    "--cpus",
    config.cpus,
    "--memory",
    config.memory,
    "--pids-limit",
    "256",
    "--read-only",
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "--mount",
    `type=bind,source=${sourceDirectory},target=/source,readonly`,
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=64m",
    "--tmpfs",
    `/workspace:rw,nosuid,nodev,exec,size=${config.workspaceSize}`,
    "--workdir",
    "/workspace",
    config.image,
    "sh",
    "-lc",
    "cp -a /source/. /workspace && exec tail -f /dev/null"
  ];
}
function runProcess(executable, args, timeoutMs, maxOutputBytes) {
  return new Promise((resolve2, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const append = (current, chunk) => (current + chunk.toString()).slice(-maxOutputBytes);
    child.stdout.on("data", (chunk) => stdout = append(stdout, chunk));
    child.stderr.on("data", (chunk) => stderr = append(stderr, chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve2({ exitCode, stdout, stderr, timedOut });
    });
  });
}

// ../core/dist/executor.js
import { spawn as spawn2 } from "node:child_process";
var LocalShellExecutor = class {
  async execute(step, options) {
    const startedAt = Date.now();
    return new Promise((resolve2) => {
      const isWindows = process.platform === "win32";
      const executable = isWindows ? step.command : shellForLanguage2(step.language);
      const args = isWindows ? [] : ["-ec", step.command];
      const child = spawn2(executable, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: isWindows,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", (chunk) => stdout += chunk.toString());
      child.stderr.on("data", (chunk) => stderr += chunk.toString());
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve2({
          stepId: step.id,
          status: "failed",
          exitCode: null,
          stdout,
          stderr: `${stderr}${error.message}`,
          durationMs: Date.now() - startedAt
        });
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve2({
          stepId: step.id,
          status: timedOut ? "timed_out" : exitCode === 0 ? "passed" : "failed",
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt
        });
      });
    });
  }
};
function shellForLanguage2(language) {
  return language === "bash" || language === "zsh" ? language : "sh";
}
async function executePlan(plan, executor, options) {
  const results = [];
  await executor.setup?.(options);
  try {
    for (const step of plan.steps) {
      const result = await executor.execute(step, options);
      results.push(result);
      if (result.status === "timed_out" || result.status !== "passed" && !options.continueOnError)
        break;
    }
  } finally {
    await executor.dispose?.();
  }
  return results;
}

// ../core/dist/types.js
var SUPPORTED_SHELL_LANGUAGES = ["bash", "sh", "shell", "zsh", "console", "terminal"];

// ../core/dist/parse-markdown.js
var isShellLanguage = (value) => SUPPORTED_SHELL_LANGUAGES.includes(value);
function parseMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let heading = null;
  let ignoreNext = false;
  let nonExecutableFenceMarker = null;
  let fence = null;
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (!fence) {
      if (nonExecutableFenceMarker) {
        const closingPattern2 = nonExecutableFenceMarker === "`" ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/;
        if (closingPattern2.test(line))
          nonExecutableFenceMarker = null;
        return;
      }
      if (/<!--\s*readme-doctor:\s*ignore-next\s*-->/i.test(line)) {
        ignoreNext = true;
        return;
      }
      const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
      if (headingMatch)
        heading = headingMatch[1] ?? null;
      const opening = line.match(/^\s*(`{3,}|~{3,})\s*([^\s{]*)/);
      const language = opening?.[2]?.toLowerCase() ?? "";
      if (opening?.[1] && isShellLanguage(language)) {
        if (ignoreNext) {
          ignoreNext = false;
          nonExecutableFenceMarker = opening[1][0] ?? "`";
          return;
        }
        fence = { marker: opening[1][0] ?? "`", language, startLine: lineNumber, lines: [] };
      } else if (opening?.[1]) {
        nonExecutableFenceMarker = opening[1][0] ?? "`";
      }
      return;
    }
    const closingPattern = fence.marker === "`" ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/;
    if (closingPattern.test(line)) {
      const commands = extractCommands(fence.language, fence.lines, fence.startLine + 1);
      const script = extractScript(fence.language, fence.lines, commands);
      if (commands.length > 0 && script.value.length > 0) {
        blocks.push({
          id: `block-${blocks.length + 1}`,
          language: fence.language,
          heading,
          startLine: fence.startLine,
          endLine: lineNumber,
          script: script.value,
          sourceLine: script.sourceLine,
          commands
        });
      }
      fence = null;
      return;
    }
    fence.lines.push(line);
  });
  return blocks;
}
function extractCommands(language, lines, firstLine) {
  if (language === "console" || language === "terminal") {
    return lines.map((line, index) => ({ value: line.replace(/^\s*\$\s+/, "").trim(), sourceLine: firstLine + index, isCommand: /^\s*\$\s+/.test(line) })).filter(({ value, isCommand }) => isCommand && value.length > 0).map(({ value, sourceLine }) => ({ value, sourceLine }));
  }
  return lines.map((line, index) => ({ value: line.trim(), sourceLine: firstLine + index })).filter(({ value }) => value.length > 0 && !value.startsWith("#"));
}
function extractScript(language, lines, commands) {
  if (language === "console" || language === "terminal") {
    return {
      value: commands.map(({ value }) => value).join("\n"),
      sourceLine: commands[0]?.sourceLine ?? 0
    };
  }
  const first = lines.findIndex((line) => line.trim().length > 0);
  let last = lines.length - 1;
  while (last >= 0 && lines[last]?.trim().length === 0)
    last -= 1;
  return {
    value: first < 0 ? "" : lines.slice(first, last + 1).join("\n"),
    sourceLine: commands[0]?.sourceLine ?? 0
  };
}

// ../core/dist/planner.js
function createPlan(sourcePath, blocks) {
  const steps = blocks.map((block) => ({
    id: `${block.id}-step-1`,
    blockId: block.id,
    command: block.script,
    sourceLine: block.sourceLine,
    heading: block.heading,
    language: block.language
  }));
  return { sourcePath, steps };
}

// ../core/dist/report.js
function renderMarkdownReport(plan, results) {
  const byStep = new Map(results?.map((result) => [result.stepId, result]) ?? []);
  const lines = ["# Readme Doctor report", "", `Source: \`${plan.sourcePath}\``, ""];
  if (plan.steps.length === 0) {
    lines.push("No executable shell examples found.");
    return lines.join("\n");
  }
  lines.push("| Status | Line | Section | Command |", "| --- | ---: | --- | --- |");
  for (const step of plan.steps) {
    const result = byStep.get(step.id);
    const status = !results ? "planned" : result?.status ?? "skipped";
    const icon = status === "passed" ? "\u2705" : status === "planned" ? "\u{1F4DD}" : status === "skipped" ? "\u23ED\uFE0F" : "\u274C";
    lines.push(`| ${icon} ${status} | ${step.sourceLine} | ${escapeCell(step.heading ?? "\u2014")} | \`${escapeCell(step.command)}\` |`);
  }
  return lines.join("\n");
}
function escapeCell(value) {
  return value.replace(/\|/g, "\\|").replace(/`/g, "\\`").replace(/\r?\n/g, "<br>");
}

// src/github.ts
var COMMENT_MARKER = "<!-- readme-doctor-report -->";
function buildPullRequestComment(report) {
  const footer = "_Generated by Readme Doctor. This comment is updated on each run._";
  const available = 6e4 - COMMENT_MARKER.length - footer.length - 16;
  const truncated = report.length > available ? `${report.slice(0, available)}

\u2026 report truncated` : report;
  return `${COMMENT_MARKER}
${truncated}

${footer}`;
}
async function upsertPullRequestComment(options) {
  const request = options.fetchImpl ?? fetch;
  const base = `${options.apiUrl}/repos/${options.repository}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${options.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
  const commentsResponse = await request(
    `${base}/issues/${options.pullRequestNumber}/comments?per_page=100`,
    { headers }
  );
  if (!commentsResponse.ok) {
    throw new Error(`Unable to list pull request comments: ${commentsResponse.status} ${await commentsResponse.text()}`);
  }
  const comments = await commentsResponse.json();
  const existing = comments.find(
    (comment) => comment.user?.type === "Bot" && comment.body?.includes(COMMENT_MARKER)
  );
  const endpoint = existing ? `${base}/issues/comments/${existing.id}` : `${base}/issues/${options.pullRequestNumber}/comments`;
  const response = await request(endpoint, {
    method: existing ? "PATCH" : "POST",
    headers,
    body: JSON.stringify({ body: options.body })
  });
  if (!response.ok) {
    throw new Error(`Unable to ${existing ? "update" : "create"} pull request comment: ${response.status} ${await response.text()}`);
  }
  return existing ? "updated" : "created";
}

// src/index.ts
var getInput = (name, fallback = "") => process.env[`INPUT_${name.toUpperCase()}`]?.trim() || fallback;
var parseBooleanInput = (name, fallback) => getInput(name, String(fallback)).toLowerCase() === "true";
async function main() {
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
  const results = shouldRun ? await executePlan(
    plan,
    useLocalExecutor ? new LocalShellExecutor() : new DockerExecutor({
      allowNetwork,
      image: getInput("IMAGE", "node:24-bookworm-slim")
    }),
    { cwd: workingDirectory, timeoutMs, continueOnError }
  ) : void 0;
  const report = renderMarkdownReport(plan, results);
  const passed = !emptyPlanFailed && (results ? results.every((result) => result.status === "passed") : true);
  console.log(report);
  await writeSummary(report);
  await writeOutputs(passed, report);
  emitAnnotations(plan, results ?? []);
  await maybeComment(report);
  if (!passed) process.exitCode = 1;
}
async function writeSummary(report) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}
`);
  }
}
async function writeOutputs(passed, report) {
  if (!process.env.GITHUB_OUTPUT) return;
  const delimiter = `README_DOCTOR_${randomUUID()}`;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `passed=${passed}
report<<${delimiter}
${report}
${delimiter}
`
  );
}
function emitAnnotations(plan, results) {
  const steps = new Map(plan.steps.map((step) => [step.id, step]));
  for (const result of results) {
    if (result.status === "passed") continue;
    const step = steps.get(result.stepId);
    if (!step) continue;
    const message = result.stderr.trim() || result.stdout.trim() || `Command ${result.status}`;
    console.log(
      `::error file=${escapeProperty(plan.sourcePath)},line=${step.sourceLine},title=Readme Doctor::${escapeData(`${step.command}: ${message}`)}`
    );
  }
}
async function maybeComment(report) {
  if (!parseBooleanInput("COMMENT", true)) return;
  const token = getInput("TOKEN");
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !eventPath) {
    console.log("::notice title=Readme Doctor::PR comment skipped because token or event context is unavailable.");
    return;
  }
  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const pullRequestNumber = event.pull_request?.number;
  const repository = process.env.GITHUB_REPOSITORY || event.repository?.full_name;
  if (!pullRequestNumber || !repository) return;
  try {
    const outcome = await upsertPullRequestComment({
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
      repository,
      pullRequestNumber,
      token,
      body: buildPullRequestComment(report)
    });
    console.log(`Readme Doctor ${outcome} pull request comment.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Readme Doctor comment skipped::${escapeData(message)}`);
  }
}
function escapeData(value) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(value) {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error title=Readme Doctor infrastructure error::${escapeData(message)}`);
  process.exitCode = 2;
});
