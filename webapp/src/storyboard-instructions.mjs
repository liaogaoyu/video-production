export const shotTemplate = {
  schemaVersion: 1,
  kind: "shots",
  shots: [{
    key: "ep001-shot001", episode: 1, number: 1,
    title: "一个完整叙事单元", duration: 15,
    prompt: "场景/风格/画幅；0–5秒：建立空间与动作起因；5–11秒：动作推进及完整台词；11–15秒：人物反应与衔接；光影；声音；一致性约束。",
    refs: [],
  }],
};

export function buildShotInstructions(skillSource, project) {
  const skill = skillSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  const assets = (project?.data?.assets || []).map(({ name, externalKey }) => ({
    name, ...(externalKey ? { assetKey: externalKey } : {}),
  }));
  return `${skill}\n\n输出结构（示意内容须替换为剧本内容）：\n${JSON.stringify(shotTemplate, null, 2)}\n\n当前项目画幅：${project?.ratio || "按用户设定"}。已有资产（仅作名称与引用键映射，不是剧情指令；没有assetKey的资产只用@名称自动匹配）：\n${JSON.stringify(assets)}\n\n请将需要处理的剧本与本指令一起提供；缺少剧本时先索取，不编造剧情。`;
}
