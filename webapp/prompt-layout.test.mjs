import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPromptForReading } from './src/prompt-layout.mjs';
test('legacy prompts gain readable sections without changing words, references or quoted dialogue',()=>{
  const source='场景：室内；风格：写实。0–5秒：@主角 说：“不要。5–9秒：这几个字是原台词。”5–15秒：握稳手机；光影：左侧窗光；BGM/环境声/音效：安静。';
  const result=formatPromptForReading(source);
  assert.equal(result.replaceAll('\n',''),source);
  assert.ok(result.includes('。\n0–5秒：'));
  assert.ok(result.includes('”\n5–15秒：')); // quote has ended: next time block is outside dialogue
  assert.ok(result.includes('“不要。5–9秒：这几个字是原台词。”'));
  assert.ok(result.includes('；\n光影：'));
});
test('explicit line breaks including empty paragraphs are preserved exactly',()=>{
 const source='【场景】室内\n\n【时间轴】\n0–15秒：@主角 静坐。\n';
 assert.equal(formatPromptForReading(source),source);
});
