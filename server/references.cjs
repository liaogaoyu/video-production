const { ApiError } = require("./errors.cjs");
const { bindPromptReferences } = require("../jimeng-cli.cjs");

const SEPARATOR = /[\s，。！？、；：,.!?:;]/;

function findMentions(prompt, assets) {
  const source = String(prompt || "");
  const found = [];
  let index = 0;
  while (index < source.length) {
    if (source[index] !== "@") {
      index += 1;
      continue;
    }
    const candidates = assets.filter((asset) => {
      const token = `@${asset.name}`;
      if (!source.startsWith(token, index)) return false;
      const next = source[index + token.length] || "";
      return !next || SEPARATOR.test(next);
    });
    if (!candidates.length) {
      index += 1;
      continue;
    }
    const longest = Math.max(...candidates.map((asset) => asset.name.length));
    const exact = candidates.filter((asset) => asset.name.length === longest);
    if (exact.length > 1) {
      throw new ApiError(409, "ambiguous_reference", `资产名“${exact[0].name}”对应多个资产，请确认后再继续`);
    }
    found.push(exact[0]);
    index += exact[0].name.length + 1;
  }
  return found;
}

function freezePrompt(prompt, names) {
  return {
    promptOriginal: String(prompt || ""),
    promptSubmitted: bindPromptReferences(prompt, names),
  };
}

module.exports = { findMentions, freezePrompt };
