// Reading-only layout: insert line breaks at known section/beat boundaries outside dialogue.
export function formatPromptForReading(value) {
  const text = String(value || '');
  if (text.includes('\n')) return text;
  let output = '', quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!quote && i > 0 && /[。；;\s”」"]/.test(text[i - 1]) && /^(?:【(?:场景|本镜参考|首帧|镜头|时间轴|光影|声音|结束)|(?:场景|风格|画幅|光影|运镜|声音|BGM\/环境声\/音效|衔接与一致性约束)[:：]|\d+(?:\.\d+)?\s*[–—-]\s*\d+(?:\.\d+)?\s*秒[:：])/.test(text.slice(i))) {
      output += '\n';
    }
    output += ch;
    if (quote) {
      if (ch === quote && text[i - 1] !== '\\') quote = '';
    } else if (ch === '“') quote = '”';
    else if (ch === '「') quote = '」';
    else if (ch === '"') quote = '"';
  }
  return output;
}
