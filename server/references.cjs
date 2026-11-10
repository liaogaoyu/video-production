const { ApiError } = require("./errors.cjs");
const { bindPromptReferences } = require("../jimeng-cli.cjs");
const { withVideoReferenceGuidance } = require("../video-reference-guidance.cjs");

const SEPARATOR = /[\s，。！？、；：,.!?:;]/;

function findMentions(prompt, assets) {
  const source = String(prompt || "");
  const found = [];
  const seen = new Set();
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
    if(!seen.has(exact[0].id)){found.push(exact[0]);seen.add(exact[0].id);}
    index += exact[0].name.length + 1;
  }
  return found;
}

function freezePrompt(prompt, names) {
  return {
    promptOriginal: String(prompt || ""),
    promptSubmitted: withVideoReferenceGuidance(bindPromptReferences(prompt, names), names),
  };
}

function uniqueAssetReferences(references = []) {
  const seen = new Set();
  return references.filter((reference, index) => {
    const key = reference.assetId || reference.asset_id || reference.mediaId || reference.media_id || reference.name || `position:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function compactVideoReferences(input) {
  const original = input.references || [];
  const references = uniqueAssetReferences(original).map((reference,index)=>({...reference,index:index+1}));
  if (references.length === original.length) return input;
  if (typeof input.promptOriginal !== 'string') throw new ApiError(400,'legacy_reference_binding','旧任务参考图重复且缺少原始提示词，请从分镜重新生成');
  return {...input,...freezePrompt(input.promptOriginal,references.map(r=>r.name)),references};
}
module.exports = { findMentions, freezePrompt, uniqueAssetReferences, compactVideoReferences };
