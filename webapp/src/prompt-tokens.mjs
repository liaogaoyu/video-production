// Match the same name boundary as server/references.cjs, including names with spaces.
export function splitPromptMentions(value, names) {
  const source = String(value || "");
  const tokens = [...new Set(names)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const parts = [];
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== "@") continue;
    const name = tokens.find((name) => {
      const end = index + name.length + 1;
      return (
        source.startsWith(`@${name}`, index) &&
        (end === source.length || /[\s，。！？、；：,.!?:;]/.test(source[end]))
      );
    });
    if (!name) continue;
    if (start < index)
      parts.push({ text: source.slice(start, index), mention: false });
    start = index + name.length + 1;
    parts.push({ text: source.slice(index, start), mention: true });
    index = start - 1;
  }
  if (start < source.length)
    parts.push({ text: source.slice(start), mention: false });
  return parts;
}
