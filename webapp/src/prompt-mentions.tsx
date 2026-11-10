import { memo, useEffect, useRef } from "react";
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

type EditorBag = {
  assets: AssetOption[];
  onChange?: (value: string) => void;
  onBlur?: () => void;
  editor: ReturnType<typeof useEditor> | null;
};

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

function createExtensions(getBag: () => EditorBag) {
  return [
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
          getBag()
            .assets.filter((asset) =>
              asset.name.toLowerCase().includes(query.toLowerCase()),
            )
            .map((asset) => ({ id: asset.id, label: asset.name })),
        render: () => {
          let active = 0;
          let state: SuggestionProps<Item>;
          let root: HTMLDivElement | null = null;
          let menuHost: HTMLDivElement | null = null;
          const hide = () => menuHost?.replaceChildren();
          const draw = () => {
            if (!menuHost || !root) return;
            menuHost.replaceChildren();
            const rect = state.clientRect?.();
            if (!rect || !state.items.length) return;
            const bounds = root.getBoundingClientRect();
            menuHost.style.left = `${Math.max(0, Math.min(rect.left - bounds.left, bounds.width - 240))}px`;
            const menuHeight = Math.min(240, state.items.length * 42 + 8);
            const top =
              rect.bottom + menuHeight + 8 > window.innerHeight &&
              rect.top > menuHeight
                ? rect.top - bounds.top - menuHeight - 4
                : rect.bottom - bounds.top + 4;
            menuHost.style.top = `${top}px`;
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
            menuHost.append(list);
            list
              .querySelector('[aria-selected="true"]')
              ?.scrollIntoView({ block: "nearest" });
          };
          return {
            onStart: (next) => {
              state = next;
              active = 0;
              root = getBag().editor
                ? (document.querySelector(
                    ".prompt-mention-editor",
                  ) as HTMLDivElement | null)
                : null;
              // Prefer the nearest host from the active editor DOM.
              const viewDom = getBag().editor?.view?.dom as HTMLElement | undefined;
              root =
                (viewDom?.closest(".prompt-mention-editor") as HTMLDivElement) ||
                root;
              menuHost =
                (root?.querySelector(
                  ".asset-mention-menu",
                ) as HTMLDivElement | null) || null;
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
  ];
}

function editorText(editor: {
  isDestroyed: boolean;
  isFocused?: boolean;
  getText: (opts: { blockSeparator: string }) => string;
} | null) {
  if (!editor || editor.isDestroyed) return null;
  try {
    return editor.getText({ blockSeparator: "\n" });
  } catch {
    return null;
  }
}

function PromptMentionsView({ assets, value = "", ...props }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const menuHost = useRef<HTMLDivElement>(null);
  const bag = useRef<EditorBag>({
    assets,
    onChange: props.onChange,
    onBlur: props.onBlur,
    editor: null,
  });
  bag.current.assets = assets;
  bag.current.onChange = props.onChange;
  bag.current.onBlur = props.onBlur;

  // Keep TipTap option identities stable across parent re-renders; otherwise
  // compareOptions fails and setOptions() steals focus every jobs poll.
  const stable = useRef<{
    extensions: ReturnType<typeof createExtensions>;
    content: ReturnType<typeof promptDocument>;
    editorProps: {
      attributes: Record<string, string>;
      handlePaste: (
        view: unknown,
        event: ClipboardEvent,
      ) => boolean;
    };
  } | null>(null);
  if (!stable.current) {
    stable.current = {
      extensions: createExtensions(() => bag.current),
      content: promptDocument(value, assets),
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "提示词",
        },
        handlePaste: (_view, event) => {
          const text = event.clipboardData?.getData("text/plain");
          if (!text) return false;
          const ed = bag.current.editor;
          if (!ed || ed.isDestroyed) return false;
          ed.commands.insertContent(
            promptDocument(text, bag.current.assets).content || [],
          );
          return true;
        },
      },
    };
  }

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: stable.current.extensions,
      content: stable.current.content,
      editorProps: stable.current.editorProps,
      onUpdate: ({ editor: ed }) => {
        if (ed.isDestroyed) return;
        const next = ed.getText({ blockSeparator: "\n" });
        bag.current.onChange?.(next);
      },
      onBlur: () => bag.current.onBlur?.(),
    },
    [],
  );
  bag.current.editor = editor;

  const assetKey = assets.map((asset) => `${asset.id}:${asset.name}`).join("|");
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isFocused) return;
    const currentText = editorText(editor);
    if (currentText == null || currentText === value) return;
    try {
      editor.commands.setContent(promptDocument(value, assets), {
        emitUpdate: false,
      });
    } catch {
      // Ignore mid-destroy races when switching shots.
    }
  }, [editor, value, assetKey, assets]);

  return (
    <div className="prompt-mention-editor" ref={root}>
      <EditorContent editor={editor} />
      <div className="asset-mention-menu" ref={menuHost} />
    </div>
  );
}

function sameAssets(a: AssetOption[], b: AssetOption[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name) return false;
  }
  return true;
}

export const PromptMentions = memo(PromptMentionsView, (prev, next) => {
  return (
    prev.value === next.value &&
    sameAssets(prev.assets, next.assets) &&
    prev.id === next.id &&
    prev["aria-describedby"] === next["aria-describedby"] &&
    prev["aria-invalid"] === next["aria-invalid"] &&
    prev["aria-required"] === next["aria-required"]
    // onChange/onBlur intentionally ignored: stored in refs
  );
});
