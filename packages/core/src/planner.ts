import type { CommandBlock, ExecutionPlan } from "./types.js";

export function createPlan(sourcePath: string, blocks: CommandBlock[]): ExecutionPlan {
  const steps = blocks.flatMap((block) =>
    block.commands.map((command, index) => ({
      id: `${block.id}-step-${index + 1}`,
      blockId: block.id,
      command: command.value,
      sourceLine: command.sourceLine,
      heading: block.heading,
    })),
  );

  return { sourcePath, steps };
}
