import { spawn } from "node:child_process";
import type {
  CommandExecutor,
  ExecuteOptions,
  ExecutionPlan,
  ExecutionResult,
  ExecutionStep,
} from "./types.js";

export class LocalShellExecutor implements CommandExecutor {
  async execute(step: ExecutionStep, options: ExecuteOptions): Promise<ExecutionResult> {
    const startedAt = Date.now();

    return new Promise((resolve) => {
      const isWindows = process.platform === "win32";
      const executable = isWindows ? step.command : shellForLanguage(step.language);
      const args = isWindows ? [] : ["-ec", step.command];
      const child = spawn(executable, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: isWindows,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          stepId: step.id,
          status: "failed",
          exitCode: null,
          stdout,
          stderr: `${stderr}${error.message}`,
          durationMs: Date.now() - startedAt,
        });
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({
          stepId: step.id,
          status: timedOut ? "timed_out" : exitCode === 0 ? "passed" : "failed",
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
        });
      });
    });
  }
}

function shellForLanguage(language: ExecutionStep["language"]): string {
  return language === "bash" || language === "zsh" ? language : "sh";
}

export async function executePlan(
  plan: ExecutionPlan,
  executor: CommandExecutor,
  options: ExecuteOptions,
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  await executor.setup?.(options);
  try {
    for (const step of plan.steps) {
      const result = await executor.execute(step, options);
      results.push(result);
      if (result.status === "timed_out" || (result.status !== "passed" && !options.continueOnError)) break;
    }
  } finally {
    await executor.dispose?.();
  }

  return results;
}
