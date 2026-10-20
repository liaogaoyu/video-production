import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Mention from "@tiptap/extension-mention";
import { closeHistory } from "@tiptap/pm/history";
import { UndoRedo } from "@tiptap/extensions";
import { exitSuggestion, type SuggestionProps } from "@tiptap/suggestion";
import { promptDocument } from "./prompt-tokens.mjs";

type AssetOption = { id: string; name: string };
type Props = {
  assets: AssetOption[];
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
};
type Item = { id: string; label: string };

const AssetMention = Mention.extend({
  addKeyboardShortcuts() {
    const remove = (backward: boolean) => {
      const { state, view } = this.editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const node = backward
        ? selection.$from.nodeBefore
        : selection.$from.nodeAfter;
      if (node?.type.name !== this.name) return false;
      const start = selection.from - (backward ? node.nodeSize : 0);
      // A tag deletion is one undoable action, separate from typing or insertion.
      view.dispatch(
        closeHistory(state.tr)
          .delete(start, start + node.nodeSize)
          .scrollIntoView(),
      );
      return true;
    };
    return { Backspace: () => remove(true), Delete: () => remove(false) };
  },
});

export function PromptMentions({ assets, value = "", ...props }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const menuHost = useRef<HTMLDivElement>(null);
  const current = useRef({ assets, props });
  current.current = { assets, props };
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      AssetMention.configure({
        HTMLAttributes: { class: "asset-mention", contenteditable: "false" },
        deleteTriggerWithBackspace: true,
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
        suggestion: {
          allowedPrefixes: null,
          allowSpaces: true,
          items: ({ query }) =>
            current.current.assets
              .filter((asset) =>
                asset.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((asset) => ({ id: asset.id, label: asset.name })),
          render: () => {
            let active = 0;
            let state: SuggestionProps<Item>;
            const hide = () => menuHost.current?.replaceChildren();
            const draw = () => {
              const host = menuHost.current;
              if (!host || !root.current) return;
              host.replaceChildren();
              const rect = state.clientRect?.();
              if (!rect || !state.items.length) return;
              const bounds = root.current.getBoundingClientRect();
              host.style.left = `${Math.max(0, Math.min(rect.left - bounds.left, bounds.width - 240))}px`;
              const menuHeight = Math.min(240, state.items.length * 42 + 8);
              const top =
                rect.bottom + menuHeight + 8 > window.innerHeight &&
                rect.top > menuHeight
                  ? rect.top - bounds.top - menuHeight - 4
                  : rect.bottom - bounds.top + 4;
              host.style.top = `${top}px`;
              const list = document.createElement("div");
              list.className = "asset-mention-options";
              list.setAttribute("role", "listbox");
              list.setAttribute("aria-label", "选择项目资产");
              state.items.forEach((item, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.tabIndex = -1;
                button.setAttribute("role", "option");
                button.setAttribute("aria-selected", String(index === active));
                button.textContent = item.label;
                button.onmousedown = (event) => event.preventDefault();
                button.onclick = () => state.command(item);
                list.append(button);
              });
              host.append(list);
              list
                .querySelector('[aria-selected="true"]')
                ?.scrollIntoView({ block: "nearest" });
            };
            return {
              onStart: (next) => {
                state = next;
                active = 0;
                draw();
              },
              onUpdate: (next) => {
                state = next;
                active = 0;
                draw();
              },
              onKeyDown: ({ event, view }) => {
                if (event.key === "Escape") {
                  exitSuggestion(view);
                  hide();
                  return true;
                }
                if (!state?.items.length) return false;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  active =
                    (active +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      state.items.length) %
                    state.items.length;
                  draw();
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  state.command(state.items[active]);
                  return true;
                }
                return false;
              },
              onExit: hide,
            };
          },
        },
      }),
    ],
    content: promptDocument(value, assets),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "提示词",
        ...(props.id ? { id: props.id } : {}),
        ...(props["aria-describedby"]
          ? { "aria-describedby": props["aria-describedby"] }
          : {}),
        "aria-invalid": String(props["aria-invalid"] || false),
        "aria-required": String(props["aria-required"] || false),
      },
      // Pasting text hydrates known asset names into the same indivisible nodes.
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;
        editor?.commands.insertContent(
          promptDocument(text, current.current.assets).content || [],
        );
        return true;
      },
    },
    onUpdate: ({ editor }) =>
      current.current.props.onChange?.(
        editor.getText({ blockSeparator: "\n" }),
      ),
    onBlur: () => current.current.props.onBlur?.(),
  });
  useEffect(() => {
    if (editor && editor.getText({ blockSeparator: "\n" }) !== value) {
      editor.commands.setContent(promptDocument(value, assets), {
        emitUpdate: false,
      });
    }
  }, [editor, value, assets]);
  return (
    <div className="prompt-mention-editor" ref={root}>
      <EditorContent editor={editor} />
      <div className="asset-mention-menu" ref={menuHost} />
    </div>
  );
}
