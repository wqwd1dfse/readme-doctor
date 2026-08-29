import type { ExecutionPlan, ExecutionResult } from "./types.js";

export function renderMarkdownReport(plan: ExecutionPlan, results?: ExecutionResult[]): string {
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
    const icon = status === "passed" ? "✅" : status === "planned" ? "📝" : status === "skipped" ? "⏭️" : "❌";
    lines.push(
      `| ${icon} ${status} | ${step.sourceLine} | ${escapeCell(step.heading ?? "—")} | \`${escapeCell(step.command)}\` |`,
    );
  }

  return lines.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/`/g, "\\`").replace(/\r?\n/g, "<br>");
}
