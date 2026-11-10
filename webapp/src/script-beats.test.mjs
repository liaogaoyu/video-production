import test from "node:test";
import assert from "node:assert/strict";
import { parseBeats } from "./script-beats.mjs";

test("parseBeats reads markdown and 场 headings", () => {
  const body = "开场旁白\n## 咖啡馆\n对白\n第 2 场：枫叶小径\n走路\n";
  const beats = parseBeats(body);
  assert.equal(beats.length, 2);
  assert.equal(beats[0].title, "咖啡馆");
  assert.equal(beats[1].title, "枫叶小径");
  assert.ok(beats[0].offset < beats[1].offset);
});
