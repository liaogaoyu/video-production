export function splitPromptMentions(
  value: string,
  names: string[],
): { text: string; mention: boolean }[];
