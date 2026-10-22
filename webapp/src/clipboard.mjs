/** Prefer the Clipboard API; HTTP deployments copy synchronously inside the active dialog. */
export async function copyText(
  text,
  anchor,
  {
    document: doc = globalThis.document,
    navigator: nav = globalThis.navigator,
    timeoutMs = 2000,
  } = {},
) {
  if (nav?.clipboard?.writeText) {
    let timer;
    try {
      await Promise.race([
        nav.clipboard.writeText(text),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("复制超时")), timeoutMs);
        }),
      ]);
      return;
    } catch {
      // Permission denial or a missing secure context must still allow the HTTP fallback.
    } finally {
      clearTimeout(timer);
    }
  }
  const previous = doc.activeElement;
  const host =
    anchor?.closest('[role="dialog"], [role="alertdialog"]') ||
    previous?.closest?.('[role="dialog"], [role="alertdialog"]') ||
    doc.body;
  const selection = doc.getSelection?.();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : [];
  const start = previous?.selectionStart,
    end = previous?.selectionEnd;
  const field = doc.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  let wrote = false;
  const onCopy = (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    wrote = true;
  };
  host.append(field);
  doc.addEventListener("copy", onCopy, true);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    if (doc.activeElement !== field || !doc.execCommand("copy") || !wrote) {
      throw Error("浏览器未允许复制，请允许此网站使用剪贴板后重试");
    }
  } finally {
    doc.removeEventListener("copy", onCopy, true);
    field.remove();
    if (previous?.isConnected !== false) {
      previous?.focus?.({ preventScroll: true });
      if (typeof start === "number") previous.setSelectionRange?.(start, end);
    }
    if (selection && ranges.length) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
