export interface ParsedCommand {
  command: string;
  args: string;
  raw: string;
}

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return {
      command: trimmed.toLowerCase(),
      args: "",
      raw: trimmed,
    };
  }

  const command = trimmed.substring(0, spaceIdx).toLowerCase();
  const args = trimmed.substring(spaceIdx + 1).trim();

  return {
    command,
    args,
    raw: trimmed,
  };
}
