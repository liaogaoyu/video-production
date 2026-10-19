const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync, backup } = require("node:sqlite");
const { openServices } = require("../server/context.cjs");
const { restoreDesktopWorkspace } = require("../server/desktop-migration.cjs");

async function main() {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf("--source");
  if (sourceIndex < 0 || !args[sourceIndex+1]) throw new Error("用法：node scripts/restore-desktop.cjs --source <旧客户端数据目录> [--apply]；应用前请停止 API 和 Worker");
  const sourceRoot = fs.realpathSync(args[sourceIndex+1]);
  const sourceFile = path.join(sourceRoot,"storydock.sqlite");
  const source = new DatabaseSync(sourceFile,{readOnly:true});
  let target;
  try {
    if (!args.includes("--apply")) {
      const row = source.prepare("SELECT value_json FROM app_state WHERE key='workspace'").get();
      if (!row) throw new Error("旧数据库没有项目数据");
      const workspace = JSON.parse(row.value_json);
      console.log(JSON.stringify({dryRun:true,projects:workspace.projects.map(p=>({id:p.id,name:p.name,assets:p.data.assets.length,shots:p.data.shots.length,jobs:p.data.jobs.length,videos:p.data.jobs.filter(j=>j.video).length}))},null,2));
      return;
    }
    target = openServices();
    const backupRoot=path.join(target.paths.backups,`desktop-migration-${new Date().toISOString().replace(/[:.]/g,"-")}`);
    fs.mkdirSync(backupRoot,{recursive:true,mode:0o700});
    const snapshotFile=path.join(backupRoot,"desktop.sqlite");
    await backup(source,snapshotFile);
    await backup(target.db,path.join(backupRoot,"server-before.sqlite"));
    fs.chmodSync(snapshotFile,0o600);fs.chmodSync(path.join(backupRoot,"server-before.sqlite"),0o600);
    const snapshot=new DatabaseSync(snapshotFile,{readOnly:true});
    let workspace;
    try{workspace=JSON.parse(snapshot.prepare("SELECT value_json FROM app_state WHERE key='workspace'").get().value_json);}finally{snapshot.close();}
    const report=restoreDesktopWorkspace({services:target,workspace,sourceKey:sourceFile,allowedRoots:[sourceRoot],staticRoot:path.resolve(__dirname,"..")});
    fs.writeFileSync(path.join(backupRoot,"report.json"),JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify({backupRoot,...report},null,2));
  } finally {source.close();target?.db.close();}
}

if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});

module.exports={main};
