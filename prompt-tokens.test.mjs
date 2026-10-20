import test from "node:test";
import assert from "node:assert/strict";
import { splitPromptMentions } from "./webapp/src/prompt-tokens.mjs";
test("mention decorations preserve text and match complete known asset names", () => {
  const text = "场景：@宫廷·内殿，@少年甲 看向 @少年。@a [1]！@未知 @少年乙";
  const parts = splitPromptMentions(text, [
    "少年",
    "少年甲",
    "宫廷·内殿",
    "a [1]",
  ]);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.deepEqual(
    parts.filter((p) => p.mention).map((p) => p.text),
    ["@宫廷·内殿", "@少年甲", "@少年", "@a [1]"],
  );
});
test("repeated names, newlines and HTML remain unmodified", () => {
  const text = "@宫廷\n<script>@宫廷</script> @宫廷 ";
  const parts = splitPromptMentions(text, ["宫廷"]);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.equal(parts.filter((p) => p.mention).length, 2);
  assert.deepEqual(splitPromptMentions("", []), []);
});
