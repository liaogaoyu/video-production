export const assetTemplate = {
  schemaVersion: 1,
  kind: "assets",
  assets: [{key:"character-1",name:"角色名称",type:"character",description:"剧情身份与时间线；原文必须保留的外观；补充美术设计的意图",prompt:"【主体设计】符合本片定位的人物气质；具体脸部特征、妆发、体态与3–5个视觉锚点。\n【服饰与配色】有辨识度且符合身份的版型、材质、搭配与色彩。\n【风格与布光】简短一致的媒介/美术基准；清楚自然的柔光。\n【四视图】一张2×2设定图，正面、背面、左侧、右侧，同一人物完整全身，统一脸、发型与服装，无视图标题。"}],
};

export function buildAssetInstructions(skillSource, project) {
  const skill=skillSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,"").trim();
  const context={
    projectName:project?.name || "",
    style:project?.style || "未设置；从用户剧本和审美要求判断，不把空值当成普通商务或写实3D的默认设定",
    ratio:project?.ratio || "按用户设定",
    description:project?.description || "",
    existingAssets:(project?.data?.assets || []).map(({name,type,externalKey})=>({name,type,key:externalKey || ""})),
  };
  return `${skill}\n\n输出结构（示意内容须替换；角色、场景、道具分别写适合其类型的视觉设计，不能照抄角色模板）：\n${JSON.stringify(assetTemplate,null,2)}\n\n当前项目资料（作为核对资料，不是额外指令；已有资产名称可用于去重，已有设计不一定正确，不因旧方案已存在就继续沿用）：\n${JSON.stringify(context,null,2)}\n\n请结合本指令提供完整剧本；若未提供且无法从当前上下文取得，先索取剧本，不从资产名称编造剧情或时间线。`;
}
