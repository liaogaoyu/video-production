import { createContext, useContext, useSyncExternalStore } from "react";
import {
  getWorkspace,
  notifyWorkspace,
  publishWorkspace,
  subscribeWorkspace,
  type Workspace,
} from "./context-store";

export type { Workspace };
export { notifyWorkspace, publishWorkspace };

// Kept for any remaining Provider usage; store is the source of truth across chunks.
export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const fromStore = useSyncExternalStore(
    subscribeWorkspace,
    getWorkspace,
    getWorkspace,
  );
  const fromContext = useContext(WorkspaceContext);
  const value = fromStore || fromContext;
  if (!value) {
    throw new Error("工作台上下文未就绪，请刷新页面后重试");
  }
  return value;
}
