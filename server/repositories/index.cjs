const { createContentRepository } = require("./content.cjs");
const { createJobRepository, createAccountRepository } = require("./jobs.cjs");

function createRepositories({ db, media, secrets }) {
  function record(type, payload) {
    db.prepare("INSERT INTO job_events(job_id, type, payload_json, created_at) VALUES(?,?,?,?)")
      .run(payload.jobId || null, type, JSON.stringify(payload), new Date().toISOString());
  }
  const content = createContentRepository(db, { media, record });
  const jobs = createJobRepository(db, { record });
  const accounts = createAccountRepository(db, { secrets, record });
  return { content, jobs, accounts, record };
}

module.exports = { createRepositories };
