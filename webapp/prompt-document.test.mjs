import test from "node:test";
import assert from "node:assert/strict";
import { getSchema, generateText } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Mention from "@tiptap/extension-mention";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { promptDocument } from "./src/prompt-tokens.mjs";
const extensions = [
  Document,
  Paragraph,
  Text,
  Mention.configure({
    deleteTriggerWithBackspace: true,
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
  }),
];
const assets = [
  { id: "palace", name: "宫廷·大殿" },
  { id: "hero", name: "青年 剑客" },
];
test("existing and pasted prompts become atomic reference nodes and serialize without changing text", () => {
  const input =
    "场景：@宫廷·大殿，@青年 剑客 走来。\n\n@未知 <script>原样文本</script>\n";
  const doc = promptDocument(input, assets);
  assert.equal(generateText(doc, extensions, { blockSeparator: "\n" }), input);
  const schema = getSchema(extensions);
  const node = schema.nodeFromJSON(doc);
  node.check();
  assert.equal(schema.nodes.mention.isAtom, true);
  assert.equal(schema.nodes.mention.isInline, true);
  const atoms = [];
  node.descendants((n) => {
    if (n.type.name === "mention") atoms.push(n);
  });
  assert.deepEqual(
    atoms.map((n) => n.attrs.id),
    ["palace", "hero"],
  );
  assert.ok(atoms.every((n) => n.nodeSize === 1 && n.childCount === 0));
});
test("deleting one mention node removes the full name and leaves neighboring text unchanged", () => {
  const schema = getSchema(extensions);
  const doc = schema.nodeFromJSON(promptDocument("前 @宫廷·大殿 后", assets));
  let position;
  doc.descendants((node, pos) => {
    if (node.type.name === "mention") position = pos;
  });
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, position + 1),
  });
  const result = state.apply(state.tr.delete(position, position + 1)).doc;
  assert.equal(
    generateText(result.toJSON(), extensions, { blockSeparator: "\n" }),
    "前  后",
  );
});
