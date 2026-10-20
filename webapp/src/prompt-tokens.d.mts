export function splitPromptMentions(
  value: string,
  names: string[],
): { text: string; mention: boolean }[];
export function promptDocument(
  value: string,
  assets: { id: string; name: string }[],
): import("@tiptap/core").JSONContent;
