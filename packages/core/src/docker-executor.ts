import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type {
  CommandExecutor,
  ExecuteOptions,
  ExecutionResult,
  ExecutionStep,
} from "./types.js";

export interface DockerExecutorConfig {
  image?: string;
  allowNetwork?: boolean;
  memory?: string;
  cpus?: string;
  workspaceSize?: string;
  maxOutputBytes?: number;
}

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export class DockerExecutor implements CommandExecutor {
  private readonly config: Required<DockerExecutorConfig>;
  private readonly containerName = `readme-doctor-${randomBytes(6).toString("hex")}`;
  private isCreated = false;

  constructor(config: DockerExecutorConfig = {}) {
    this.config = {
      image: config.image ?? "node:24-bookworm-slim",
      allowNetwork: config.allowNetwork ?? false,
      memory: config.memory ?? "2g",
      cpus: config.cpus ?? "2",
      workspaceSize: config.workspaceSize ?? "1g",
      maxOutputBytes: config.maxOutputBytes ?? 1_000_000,
    };
  }

  async setup(options: ExecuteOptions): Promise<void> {
    const create = await runProcess(
      "docker",
      createDockerCreateArgs(this.containerName, options.cwd, this.config),
      options.timeoutMs,
      this.config.maxOutputBytes,
    );
    if (create.exitCode !== 0) {
      throw new Error(`Unable to create Docker sandbox: ${create.stderr || create.stdout}`);
    }
    this.isCreated = true;

    const start = await runProcess(
      "docker",
      ["start", this.containerName],
      options.timeoutMs,
      this.config.maxOutputBytes,
    );
    if (start.exitCode !== 0) {
      throw new Error(`Unable to start Docker sandbox: ${start.stderr || start.stdout}`);
    }
  }

  async execute(step: ExecutionStep, options: ExecuteOptions): Promise<ExecutionResult> {
    const startedAt = Date.now();
    const result = await runProcess(
      "docker",
      ["exec", this.containerName, shellForLanguage(step.language), "-ec", step.command],
      options.timeoutMs,
      this.config.maxOutputBytes,
    );

    return {
      stepId: step.id,
      status: result.timedOut ? "timed_out" : result.exitCode === 0 ? "passed" : "failed",
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - startedAt,
    };
  }

  async dispose(): Promise<void> {
    if (!this.isCreated) return;
    await runProcess("docker", ["rm", "--force", this.containerName], 30_000, this.config.maxOutputBytes);
    this.isCreated = false;
  }
}

function shellForLanguage(language: ExecutionStep["language"]): string {
  return language === "bash" || language === "zsh" ? language : "sh";
}

export function createDockerCreateArgs(
  containerName: string,
  sourceDirectory: string,
  config: Required<DockerExecutorConfig>,
): string[] {
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
    "cp -a /source/. /workspace && exec tail -f /dev/null",
  ];
}

function runProcess(
  executable: string,
  args: string[],
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const append = (current: string, chunk: Buffer) =>
      (current + chunk.toString()).slice(-maxOutputBytes);
    child.stdout.on("data", (chunk: Buffer) => (stdout = append(stdout, chunk)));
    child.stderr.on("data", (chunk: Buffer) => (stderr = append(stderr, chunk)));

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
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}
