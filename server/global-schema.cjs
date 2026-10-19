function installGlobalSchema(db) {
 db.exec(`
 CREATE TABLE IF NOT EXISTS global_accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,profile TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 1,authorized INTEGER NOT NULL DEFAULT 0,identity_hash TEXT,is_vip INTEGER,vip_level TEXT,expires_at TEXT,error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS global_auth(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,status TEXT NOT NULL,url TEXT,expires_at TEXT,nonce TEXT,ciphertext TEXT,error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS global_canvases(local_project_id TEXT NOT NULL,account_id TEXT NOT NULL,remote_id TEXT NOT NULL UNIQUE,ready INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(local_project_id,account_id));
 CREATE TABLE IF NOT EXISTS global_materials(account_id TEXT NOT NULL,canvas_id TEXT NOT NULL,sha256 TEXT NOT NULL,resource_id TEXT NOT NULL,ready INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account_id,canvas_id,sha256));
 CREATE TABLE IF NOT EXISTS global_previews(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,account_id TEXT NOT NULL,status TEXT NOT NULL,input_json TEXT NOT NULL,input_hash TEXT NOT NULL,quote_json TEXT,total INTEGER,error TEXT NOT NULL DEFAULT '',batch_id TEXT,lease_owner TEXT,lease_until TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS global_runs(job_id TEXT PRIMARY KEY,preview_id TEXT NOT NULL,canvas_id TEXT NOT NULL,node_id TEXT NOT NULL UNIQUE,update_id TEXT NOT NULL,submit_id TEXT NOT NULL UNIQUE,generation_json TEXT NOT NULL,resource_id TEXT,run_attempted INTEGER NOT NULL DEFAULT 0,request_id TEXT);
 CREATE TABLE IF NOT EXISTS global_runtime(key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
 INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(2,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 `);
}
module.exports={installGlobalSchema};
