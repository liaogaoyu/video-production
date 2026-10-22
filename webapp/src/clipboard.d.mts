export function copyText(
  text: string,
  anchor?: HTMLElement | null,
  environment?: {
    document?: Document;
    navigator?: Navigator;
    timeoutMs?: number;
  },
): Promise<void>;
