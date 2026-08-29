import type { CommandBlock, ExecutionPlan } from "./types.js";

export function createPlan(sourcePath: string, blocks: CommandBlock[]): ExecutionPlan {
  const steps = blocks.map((block) =>
    ({
      id: `${block.id}-step-1`,
      blockId: block.id,
      command: block.script,
      sourceLine: block.sourceLine,
      heading: block.heading,
      language: block.language,
    }),
  );

  return { sourcePath, steps };
}
