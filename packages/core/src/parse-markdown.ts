import {
  SUPPORTED_SHELL_LANGUAGES,
  type CommandBlock,
  type ShellLanguage,
} from "./types.js";

const isShellLanguage = (value: string): value is ShellLanguage =>
  SUPPORTED_SHELL_LANGUAGES.includes(value as ShellLanguage);

export function parseMarkdown(markdown: string): CommandBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: CommandBlock[] = [];
  let heading: string | null = null;
  let ignoreNext = false;
  let nonExecutableFenceMarker: string | null = null;
  let fence: { marker: string; language: ShellLanguage; startLine: number; lines: string[] } | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (!fence) {
      if (nonExecutableFenceMarker) {
        const closingPattern = nonExecutableFenceMarker === "`" ? /^\s*`{3,}\s*$/ : /^\s*~{3,}\s*$/;
        if (closingPattern.test(line)) nonExecutableFenceMarker = null;
        return;
      }

      if (/<!--\s*readme-doctor:\s*ignore-next\s*-->/i.test(line)) {
        ignoreNext = true;
        return;
      }
      const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
      if (headingMatch) heading = headingMatch[1] ?? null;

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
          commands,
        });
      }
      fence = null;
      return;
    }

    fence.lines.push(line);
  });

  return blocks;
}

function extractCommands(language: ShellLanguage, lines: string[], firstLine: number) {
  if (language === "console" || language === "terminal") {
    return lines
      .map((line, index) => ({ value: line.replace(/^\s*\$\s+/, "").trim(), sourceLine: firstLine + index, isCommand: /^\s*\$\s+/.test(line) }))
      .filter(({ value, isCommand }) => isCommand && value.length > 0)
      .map(({ value, sourceLine }) => ({ value, sourceLine }));
  }

  return lines
    .map((line, index) => ({ value: line.trim(), sourceLine: firstLine + index }))
    .filter(({ value }) => value.length > 0 && !value.startsWith("#"));
}

function extractScript(
  language: ShellLanguage,
  lines: string[],
  commands: Array<{ value: string; sourceLine: number }>,
) {
  if (language === "console" || language === "terminal") {
    return {
      value: commands.map(({ value }) => value).join("\n"),
      sourceLine: commands[0]?.sourceLine ?? 0,
    };
  }

  const first = lines.findIndex((line) => line.trim().length > 0);
  let last = lines.length - 1;
  while (last >= 0 && lines[last]?.trim().length === 0) last -= 1;
  return {
    value: first < 0 ? "" : lines.slice(first, last + 1).join("\n"),
    sourceLine: commands[0]?.sourceLine ?? 0,
  };
}
