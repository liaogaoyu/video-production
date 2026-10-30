const { AsyncLocalStorage } = require("node:async_hooks");
const { ApiError } = require("./errors.cjs");
const scope = new AsyncLocalStorage();
const current = () => scope.getStore()?.user;
function own(db, id, user = current()) {
  const p = db
    .prepare(
      "SELECT owner_user_id FROM projects WHERE id=? AND deleted_at IS NULL",
    )
    .get(id);
  if (!p || (user && user.role !== "admin" && p.owner_user_id !== user.id))
    throw new ApiError(404, "project_not_found", "项目不存在");
}
function checkRoute(db, request) {
  const user = request.appUser;
  if (!user || user.role === "admin") return;
  const route = request.routeOptions.url,
    path = request.url.split("?")[0];
  const safe =
    /^\/api\/v1\/(?:projects(?:\/|$)|assets\/|shots\/|jobs\/|batches\/|media\/|exports\/|imports$|events$|auth\/|me\/|model-offers$|recharge-instructions$|generation-quotes\/)/;
  if (!safe.test(path))
    throw new ApiError(403, "admin_required", "此操作仅限管理员");
  if (/\/(?:jobs\/batch|web-video-jobs|global-previews)$/.test(route))
    throw new ApiError(403, "quote_required", "请先获取并确认平台报价");
  let rows = [];
  const id = request.params?.id;
  if (route.startsWith("/api/v1/projects/:id")) rows = [{ project_id: id }];
  else {
    const table = route.match(
      /^\/api\/v1\/(assets|shots|jobs|media|exports)\/:id/,
    )?.[1];
    if (table)
      rows = db.prepare(`SELECT project_id FROM ${table} WHERE id=?`).all(id);
    if (route.startsWith("/api/v1/batches/:id"))
      rows = db
        .prepare("SELECT DISTINCT project_id FROM jobs WHERE batch_id=?")
        .all(id);
    if ((table || route.startsWith("/api/v1/batches/:id")) && !rows.length)
      throw new ApiError(404, "not_found", "记录不存在");
  }
  for (const r of rows) own(db, r.project_id, user);
  if (route === "/api/v1/jobs/:id/retry") {
    const j = db.prepare("SELECT status FROM jobs WHERE id=?").get(id);
    if (
      !["download_failed", "remote_running", "downloading"].includes(j?.status)
    )
      throw new ApiError(
        409,
        "new_quote_required",
        "重新生成需要新报价，请在分镜或资产中重新生成",
      );
  }
}
function filterEvents(db, events, user) {
  if (!user || user.role === "admin") return events;
  return events.filter((e) => {
    let p;
    try {
      p =
        typeof e.payload_json === "string"
          ? JSON.parse(e.payload_json)
          : typeof e.payload === "string"
            ? JSON.parse(e.payload)
            : e.payload || e;
    } catch {
      return false;
    }
    const id =
      p.projectId ||
      (p.jobId &&
        db.prepare("SELECT project_id FROM jobs WHERE id=?").get(p.jobId)
          ?.project_id);
    return (
      id &&
      db
        .prepare(
          "SELECT id FROM projects WHERE id=? AND owner_user_id=? AND deleted_at IS NULL",
        )
        .get(id, user.id)
    );
  });
}
module.exports = { scope, current, own, checkRoute, filterEvents };
