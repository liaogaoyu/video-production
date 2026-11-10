const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openServices}=require('./server/context.cjs');
const {createHttpApp}=require('./server/api.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sd-storyboard-')),s=openServices({cwd:__dirname,env:{STORYDOCK_ROOT:root,STORYDOCK_MASTER_KEY:path.join(root,'key')}});const p=s.repos.content.createProject({name:'Episodes'}).project;return {s,p,c:s.repos.content,close(){s.db.close();fs.rmSync(root,{recursive:true,force:true});}};}
const body=()=>({schemaVersion:2,kind:'storyboard',episodes:[{key:'ep-1',title:'重逢',shots:[{key:'leaf',title:'枫叶',duration:15,prompt:'第一行\n第二行'},{key:'bench',title:'长椅',duration:14,prompt:'空长椅'}]}]});
test('batch deletion is atomic, project scoped and safe to retry', async () => {
  const f = fixture();
  const app = await createHttpApp(f.s);
  try {
    const importShots = project => f.c.importShots(project.id, { ...body(), mode: 'commit' }).created.map(shot => shot.id);
    const [first, second] = importShots(f.p);
    const [foreign] = importShots(f.c.createProject({ name: '另一个项目' }).project);
    const remove = ids => app.inject({ method: 'POST', url: `/api/v1/projects/${f.p.id}/shots/delete`, payload: { ids } });
    assert.equal((await remove([first, foreign])).statusCode, 404);
    assert.deepEqual(f.c.graph(f.p.id).shots.map(shot => shot.id), [first, second]);
    assert.deepEqual((await remove([first, second, first])).json(), { deleted: 2 });
    assert.deepEqual((await remove([first, second])).json(), { deleted: 0 });
  } finally {
    await app.close();
    f.close();
  }
});
test('script import and episode deletion use the same episode data exposed to the editor', async () => {
  const f = fixture();
  const app = await createHttpApp(f.s);
  try {
    const base = `/api/v1/projects/${f.p.id}`;
    const payload = { schemaVersion: 1, kind: 'script', synopsis: '整剧梗概', episodes: [
      { key: 'ep-01', title: '重逢', summary: '分集摘要', body: '第一场', status: 'ready' },
    ] };
    const preview = await app.inject({ method: 'POST', url: base + '/script/import', payload });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(f.c.graph(f.p.id).episodes.length, 0);
    const saved = await app.inject({ method: 'POST', url: base + '/script/import', payload: { ...payload, mode: 'commit' } });
    assert.equal(saved.statusCode, 200, saved.body);
    const { id } = saved.json().episodes[0];
    const project = require('./server/present.cjs').presentProject(f.c.graph(f.p.id));
    assert.equal(project.synopsis, payload.synopsis);
    assert.deepEqual(project.data.episodes[0], { id, ...payload.episodes[0], number: 1, revision: 1 });
    assert.equal((await app.inject({ method: 'DELETE', url: base + '/episodes/' + id })).statusCode, 200);
    assert.equal(f.c.graph(f.p.id).episodes.length, 0);
  } finally {
    await app.close();
    f.close();
  }
});
test('v2 dry run does not write, repeated imports update stable shot IDs and preserve unmentioned shots',()=>{const f=fixture();try{const b=body();assert.equal(f.c.importShots(f.p.id,b).preview.length,2);assert.equal(f.c.graph(f.p.id).episodes.length,0);let r=f.c.importShots(f.p.id,{...b,mode:'commit'});const original=r.created[0].id,episode=r.episodes[0].id;assert.equal(f.c.graph(f.p.id).shots[0].episode_id,episode);b.episodes[0].shots.reverse();b.episodes[0].shots[1].prompt='修改\n仍然换行';r=f.c.importShots(f.p.id,{...b,mode:'commit'});assert.equal(r.created.length,0);assert.equal(r.updated.length,2);assert.equal(f.c.graph(f.p.id).shots[1].id,original);b.episodes[0].shots.pop();f.c.importShots(f.p.id,{...b,mode:'commit'});assert.equal(f.c.graph(f.p.id).shots.length,2);}finally{f.close();}});
test('v2 invalid input is rejected atomically and duplicate keys include their path',()=>{const f=fixture();try{const b=body();b.episodes.push({key:'ep-2',title:'bad',shots:[{key:'leaf',title:'dup',duration:15,prompt:'x'}]});assert.throws(()=>f.c.importShots(f.p.id,{...b,mode:'commit'}),/episodes\[1\].shots\[0\]/);assert.equal(f.c.graph(f.p.id).shots.length,0);assert.equal(f.c.graph(f.p.id).episodes.length,0);}finally{f.close();}});
test('inserting in the middle retains IDs and renumbers only the same episode',()=>{const f=fixture();try{const r=f.c.importShots(f.p.id,{...body(),mode:'commit'}),e2=f.c.createEpisode(f.p.id,{title:'第二集'});f.c.createShot({projectId:f.p.id,episodeId:e2.id,title:'other',prompt:'other',number:1,duration:15});const added=f.c.insertShot(f.p.id,{episodeId:r.episodes[0].id,afterId:r.created[0].id,title:'insert',duration:15,prompt:'insert'});const graph=f.c.graph(f.p.id);assert.deepEqual(graph.shots.slice(0,3).map(s=>s.id),[r.created[0].id,added.id,r.created[1].id]);assert.deepEqual(graph.shots.map(s=>s.number),[1,2,3,1]);}finally{f.close();}});
test('legacy numeric episodes migrate to stable IDs without rewriting shot revisions',()=>{const f=fixture();try{const a=f.c.createShot({projectId:f.p.id,episode:4,number:2,title:'old',duration:5,prompt:'old'});f.s.db.prepare('UPDATE shots SET episode_id=NULL WHERE id=?').run(a.id);require('./server/storyboard.cjs').installStoryboard(f.s.db);const shot=f.c.graph(f.p.id).shots[0];assert.ok(shot.episode_id);assert.equal(shot.revision,1);assert.equal(f.c.graph(f.p.id).episodes[0].number,4);}finally{f.close();}});
test('episode IDs from another project cannot receive shots',()=>{const f=fixture();try{const p2=f.c.createProject({name:'other'}).project,e=f.c.createEpisode(p2.id,{title:'secret'});assert.throws(()=>f.c.createShot({projectId:f.p.id,episodeId:e.id,number:1,title:'bad',prompt:'bad',duration:15}),/分集不属于/);}finally{f.close();}});
