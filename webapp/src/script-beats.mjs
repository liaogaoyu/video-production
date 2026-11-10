/** Parse lightweight beat headings from episode script body. */
export function parseBeats(body) {
  const lines = String(body || "").split(/\n/);
  const beats = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = /^(?:#{1,3}\s+|(?:第\s*\d+\s*场[:：\s-]*))(.+)$/.exec(line.trim());
    if (heading) {
      beats.push({
        title: heading[1].trim() || line.trim(),
        index: beats.length + 1,
        offset,
      });
    }
    offset += line.length + 1;
  }
  return beats;
}
