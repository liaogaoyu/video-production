import { createContext, useContext } from "react";
import type { Project, User } from "./types";
export interface Workspace {
  projects: Project[];
  project?: Project;
  reload: () => Promise<void>;
  refreshProject: () => Promise<void>;
  go: (page: string, project?: string) => void;
  user: User | null;
  setUser: (u: User) => void;
}
export const WorkspaceContext = createContext<Workspace>(null!);
export const useWorkspace = () => useContext(WorkspaceContext);
