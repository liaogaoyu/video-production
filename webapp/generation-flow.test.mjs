import test from 'node:test';
import assert from 'node:assert/strict';
import { generationFlow } from './src/generation-flow.mjs';
test('automatic preview and one-click submission share a quote; double clicks submit once', async () => {
  let quotes=0, confirms=0;
  const f=generationFlow({quote:async()=>({id:++quotes,expiresAt:100}),confirm:async(id)=>{confirms++;return id;},now:()=>1});
  const preview=f.getQuote();
  const a=f.submit(), b=f.submit();
  assert.equal(a,b);
  assert.deepEqual(await preview,{id:1,expiresAt:100});
  assert.equal(await a,1);assert.equal(quotes,1);assert.equal(confirms,1);
});
test('failed estimates cannot confirm; confirmation retry reuses quote; expired quotes refresh', async()=>{
  let calls=0, time=1, attempts=0;
  const f=generationFlow({quote:async()=>{if(++calls===1)throw Error('offline');return{id:calls,expiresAt:100};},confirm:async(id)=>{if(++attempts===1)throw Error('response lost');return id;},now:()=>time});
  await assert.rejects(f.submit(),/offline/);assert.equal(attempts,0);
  await assert.rejects(f.submit(),/response lost/);
  assert.equal(await f.submit(),2);assert.equal(calls,2);
  time=101;assert.equal(await f.submit(),3);
});
