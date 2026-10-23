// Detect explicit cast instructions, not arbitrary semantic intent. Scene usage
// belongs in description; this check only inspects the image prompt at import.
function findScenePeopleClause(prompt) {
  for (const clause of String(prompt || '').split(/[，,。；;\n]/)) {
    const content = clause
      .replace(/(?:不出现|不绘制|不新增|不加入|不添加|不画|不含|禁止|不要|不得|避免|没有|无)[^，,。；;\n]*/g, '')
      .replace(/(?:观众|工作人员|人员|摊主|顾客|市民|表演者)(?:工作区|操作区|活动空间|通道|座位|席位|入口|出口|区|席)/g, '');
    if (/(?:表演者|观众|市民|摊主|顾客|主播|企业代表|求职者|指导人员|咨询人员|工作人员|路人|演员|人群|人影|人物|青年|老人|小孩|男人|女人|男孩|女孩)/.test(content)) {
      return clause.trim();
    }
  }
  return '';
}
module.exports = { findScenePeopleClause };
