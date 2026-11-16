const { ApiError } = require('./errors.cjs');

function registerBatchProduction(app, { db, repos }) {
  db.exec(`CREATE TABLE IF NOT EXISTS episode_publication_details (
    episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
    short_title TEXT NOT NULL,
    description TEXT NOT NULL,
    topics TEXT NOT NULL,
    cover_text TEXT NOT NULL,
    planned_at TEXT NOT NULL
  )`);
  const route = '/api/v1/projects/:id/episodes/:episodeId/publication-details';
  const read = db.prepare(`SELECT short_title AS shortTitle, description, topics, cover_text AS coverText,
    planned_at AS plannedAt FROM episode_publication_details WHERE episode_id=?`);
  function episodeId(request) {
    const { id, episodeId } = request.params;
    repos.content.mustProject(id);
    if (!db.prepare('SELECT id FROM episodes WHERE project_id=? AND id=?').get(id, episodeId)) {
      throw new ApiError(404, 'episode_missing', '分集不属于当前项目');
    }
    return episodeId;
  }
  app.get(route, async request => ({ details: read.get(episodeId(request)) || null }));
  app.put(route, async request => {
    const id = episodeId(request);
    const fields = [['shortTitle', 100], ['description', 2000], ['topics', 500], ['coverText', 100], ['plannedAt', 16]];
    const values = fields.map(([key, max]) => {
      const value = request.body?.[key] ?? '';
      if (typeof value !== 'string' || value.length > max) {
        throw new ApiError(400, 'invalid_publication_details', '发布资料格式无效或过长');
      }
      return value.trim();
    });
    const plannedAt = values[4];
    if (plannedAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(plannedAt)) {
      throw new ApiError(400, 'invalid_planned_time', '请输入有效的计划发布时间');
    }
    db.prepare(`INSERT INTO episode_publication_details VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(episode_id) DO UPDATE SET short_title=excluded.short_title,
      description=excluded.description, topics=excluded.topics, cover_text=excluded.cover_text,
      planned_at=excluded.planned_at`).run(id, ...values);
    return { details: read.get(id) };
  });
}

module.exports = { registerBatchProduction };
