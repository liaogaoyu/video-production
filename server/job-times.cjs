// Store transition times separately: updated_at also changes during polling and retries.
function installJobTimes(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const columns=new Set(db.prepare('PRAGMA table_info(jobs)').all().map(row=>row.name));
    for(const name of ['completed_at','failed_at'])if(!columns.has(name))db.exec(`ALTER TABLE jobs ADD COLUMN ${name} TEXT`);
    if(!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get()){
      db.exec(`UPDATE jobs SET completed_at=(SELECT MAX(e.created_at) FROM job_events e WHERE e.job_id=jobs.id AND e.type='job.updated' AND json_valid(e.payload_json) AND json_extract(e.payload_json,'$.status')='succeeded') WHERE status='succeeded' AND completed_at IS NULL;
      UPDATE jobs SET failed_at=(SELECT MAX(e.created_at) FROM job_events e WHERE e.job_id=jobs.id AND e.type='job.updated' AND json_valid(e.payload_json) AND json_extract(e.payload_json,'$.status') IN ('failed','auth_expired','download_failed')) WHERE status IN ('failed','auth_expired','download_failed') AND failed_at IS NULL;`);
      db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(3,?)').run(new Date().toISOString());
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
module.exports={installJobTimes};
