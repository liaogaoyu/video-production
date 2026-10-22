import test from "node:test";
import assert from "node:assert/strict";
import { copyText } from "./src/clipboard.mjs";
function environment({
  reportSuccess = true,
  fireCopy = true,
  writeData = true,
} = {}) {
  const listeners = new Map(),
    clipboard = { value: "old" },
    dialog = {
      append(field) {
        field.host = this;
      },
    };
  const doc = {
    activeElement: null,
    body: {
      append() {
        throw Error("copy escaped the modal");
      },
    },
    createElement() {
      return {
        style: {},
        focus() {
          doc.activeElement = this;
        },
        select() {},
        setSelectionRange() {},
        remove() {
          this.removed = true;
        },
      };
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    execCommand() {
      if (fireCopy)
        listeners.get("copy")?.({
          clipboardData: writeData
            ? {
                setData(type, value) {
                  assert.equal(type, "text/plain");
                  clipboard.value = value;
                },
              }
            : null,
          preventDefault() {},
        });
      return reportSuccess;
    },
  };
  const anchor = {
    isConnected: true,
    closest() {
      return dialog;
    },
    focus() {
      doc.activeElement = this;
    },
  };
  doc.activeElement = anchor;
  return { doc, anchor, clipboard, listeners };
}
test("HTTP copy writes explicit plain text within the modal and restores focus", async () => {
  const e = environment();
  await copyText('指令\n{"kind":"shots"}', e.anchor, {
    document: e.doc,
    navigator: {},
  });
  assert.equal(e.clipboard.value, '指令\n{"kind":"shots"}');
  assert.equal(e.doc.activeElement, e.anchor);
  assert.equal(e.listeners.size, 0);
});
test("never report success just because execCommand returned true", async () => {
  for (const options of [
    { fireCopy: false },
    { writeData: false },
    { reportSuccess: false },
  ]) {
    const e = environment(options);
    await assert.rejects(
      copyText("new", e.anchor, { document: e.doc, navigator: {} }),
      /未允许复制/,
    );
    assert.equal(e.listeners.size, 0);
    assert.equal(e.doc.activeElement, e.anchor);
  }
});
test("modern Clipboard API is preferred and permission failure falls back", async () => {
  let copied;
  await copyText("modern", null, {
    navigator: {
      clipboard: {
        async writeText(text) {
          copied = text;
        },
      },
    },
    document: {},
  });
  assert.equal(copied, "modern");
  const e = environment();
  await copyText("fallback", e.anchor, {
    navigator: {
      clipboard: {
        async writeText() {
          throw Error("permission");
        },
      },
    },
    document: e.doc,
  });
  assert.equal(e.clipboard.value, "fallback");
});
test("unresponsive modern clipboard falls back without hanging", async () => {
  const e = environment();
  await copyText("timeout fallback", e.anchor, {
    navigator: {
      clipboard: {
        writeText() {
          return new Promise(() => {});
        },
      },
    },
    document: e.doc,
    timeoutMs: 5,
  });
  assert.equal(e.clipboard.value, "timeout fallback");
});
