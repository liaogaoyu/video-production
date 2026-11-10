import type { Project, User } from "./types";

export interface Workspace {
  projects: Project[];
  project?: Project;
  reload: () => Promise<void>;
  refreshProject: () => Promise<void>;
  go: (page: string, project?: string, episode?: string) => void;
  episodeId: string;
  user: User | null;
  setUser: (u: User) => void;
}

let workspace: Workspace | null = null;
const listeners = new Set<() => void>();

export function getWorkspace() {
  return workspace;
}

export function subscribeWorkspace(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/** Synchronous publish so children can read workspace in the same render. */
export function publishWorkspace(next: Workspace) {
  workspace = next;
}

export function notifyWorkspace() {
  listeners.forEach((listener) => listener());
}
