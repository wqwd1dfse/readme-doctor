export const SUPPORTED_SHELL_LANGUAGES = ["bash", "sh", "shell", "zsh", "console", "terminal"] as const;

export type ShellLanguage = (typeof SUPPORTED_SHELL_LANGUAGES)[number];

export interface ParsedCommand {
  value: string;
  sourceLine: number;
}

export interface CommandBlock {
  id: string;
  language: ShellLanguage;
  heading: string | null;
  startLine: number;
  endLine: number;
  script: string;
  sourceLine: number;
  commands: ParsedCommand[];
}

export interface ExecutionStep {
  id: string;
  blockId: string;
  command: string;
  sourceLine: number;
  heading: string | null;
  language: ShellLanguage;
}

export interface ExecutionPlan {
  sourcePath: string;
  steps: ExecutionStep[];
}

export type ExecutionStatus = "passed" | "failed" | "timed_out" | "skipped";

export interface ExecutionResult {
  stepId: string;
  status: ExecutionStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ExecuteOptions {
  cwd: string;
  timeoutMs: number;
  continueOnError?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface CommandExecutor {
  setup?(options: ExecuteOptions): Promise<void>;
  execute(step: ExecutionStep, options: ExecuteOptions): Promise<ExecutionResult>;
  dispose?(): Promise<void>;
}
