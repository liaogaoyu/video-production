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

// Keep the wire format plain text; only the editor represents references as atoms.
export function promptDocument(value, assets) {
  const names = assets.map((asset) => asset.name);
  return {
    type: "doc",
    content: String(value || "")
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        content: splitPromptMentions(line, names)
          .map((part) => {
            if (!part.mention) {
              return part.text ? { type: "text", text: part.text } : null;
            }
            const asset = assets.find((item) => `@${item.name}` === part.text);
            if (!asset) {
              return part.text ? { type: "text", text: part.text } : null;
            }
            return {
              type: "mention",
              attrs: {
                id: asset.id,
                label: part.text.slice(1),
              },
            };
          })
          .filter(Boolean),
      })),
  };
}
