const validCredits = (v) =>
  (typeof v === "number" || typeof v === "string") &&
  /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(String(v)) &&
  Number(v) <= 1000000;
function cliUsage(stdout, taskId) {
  let r;
  try {
    r = JSON.parse(stdout.trim());
  } catch {
    return null;
  }
  if (
    r.submit_id !== taskId ||
    r.gen_status !== "success" ||
    !validCredits(r.credit_count)
  )
    return null;
  return {
    source: "official_actual",
    taskId,
    credits: Number(r.credit_count),
    receiptId: "cli:" + taskId,
    checkedAt: new Date().toISOString(),
  };
}
async function webUsage(call, taskId) {
  const seenCursors = new Set(),
    records = new Map();
  let cursor = "";
  const deadline = Date.now() + 25000;
  for (let page = 0; page < 40; page++) {
    if (Date.now() > deadline) throw Error("消费流水查询超时，稍后重试");
    const r = await call({ cursor });
    if (!Array.isArray(r.records) || typeof r.hasMore !== "boolean")
      throw Error("消费流水格式不正确");
    for (const row of r.records) {
      if (row.submit_id !== taskId) continue;
      if (
        row.history_type !== 2 ||
        row.status !== "Checked" ||
        !row.history_id ||
        !validCredits(row.amount)
      )
        throw Error("消费流水待确认或包含冲正，待核账");
      const id = String(row.history_id),
        old = records.get(id);
      if (old && Number(old.amount) !== Number(row.amount))
        throw Error("消费流水数值冲突");
      records.set(id, row);
    }
    if (!r.hasMore) {
      if (records.size !== 1)
        throw Error(
          records.size
            ? "同任务有多条消费流水，待核账"
            : "尚未取得该任务实际扣费记录",
        );
      const row = [...records.values()][0];
      return {
        source: "official_actual",
        taskId,
        credits: Number(row.amount),
        receiptId: String(row.history_id),
        checkedAt: new Date().toISOString(),
      };
    }
    if (typeof r.cursor !== "string" || !r.cursor || seenCursors.has(r.cursor))
      throw Error("消费流水分页异常");
    seenCursors.add(r.cursor);
    cursor = r.cursor;
  }
  throw Error("消费流水超过查询上限，待核账");
}
module.exports = { cliUsage, webUsage, validCredits };
