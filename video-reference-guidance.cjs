function withVideoReferenceGuidance(prompt, references) {
  const source = String(prompt || '');
  if (!references?.length) return source;
  return `${source}\n\n【参考图使用规则】\n人物参考控制脸、体型与服装；道具参考控制外形、比例与材质；场景参考控制建筑与空间关系，镜头构图以本条分镜为准。若参考图为四视图或多格设定，四格是同一资产的不同角度；群体参考按分镜人数使用，不将每格重复成一组。视频始终为完整单幅画面，不复现拼图边框，不因多视图额外复制人物或道具。`;
}
module.exports = { withVideoReferenceGuidance };
