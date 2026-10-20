import { useRef, useState, useLayoutEffect, type ComponentProps } from "react";
import { Mentions } from "antd";
import { splitPromptMentions } from "./prompt-tokens.mjs";

type Props = Omit<ComponentProps<typeof Mentions>, "options"> & {
  assets: { name: string }[];
};

/** Keep the native textarea for selection, undo and IME; decorate its exact text behind it. */
export function PromptMentions({ assets, value = "", ...props }: Props) {
  const mirror = useRef<HTMLDivElement>(null);
  const [composing, setComposing] = useState(false);
  useLayoutEffect(() => {
    const textarea = mirror.current?.parentElement?.querySelector("textarea");
    if (!textarea) return;
    const sync = () => {
      if (!mirror.current) return;
      // clientWidth excludes a native scrollbar, keeping long wrapped lines aligned.
      mirror.current.style.width = `${textarea.clientWidth}px`;
      mirror.current.scrollTop = textarea.scrollTop;
    };
    const observer = new ResizeObserver(sync);
    observer.observe(textarea);
    sync();
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className={`prompt-mention-editor${composing ? " is-composing" : ""}`}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => setComposing(false)}
      onScrollCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement && mirror.current) {
          mirror.current.scrollTop = event.target.scrollTop;
          mirror.current.scrollLeft = event.target.scrollLeft;
        }
      }}
    >
      <div className="prompt-mention-mirror" aria-hidden="true" ref={mirror}>
        {splitPromptMentions(
          value,
          assets.map((asset) => asset.name),
        ).map((part, index) =>
          part.mention ? <mark key={index}>{part.text}</mark> : part.text,
        )}
        {"\n"}
      </div>
      <Mentions
        {...props}
        value={value}
        autoSize={{ minRows: 10, maxRows: 18 }}
        options={assets.map((asset) => ({
          value: asset.name,
          label: asset.name,
        }))}
      />
    </div>
  );
}
