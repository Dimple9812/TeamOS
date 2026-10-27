import { useOutletContext } from "react-router-dom";
import type { User, WorkspaceDetails } from "../../lib/types";

export interface ShellContext {
  workspace: WorkspaceDetails;
  me: User;
  openNewProject: () => void;
}

export const useShell = () => useOutletContext<ShellContext>();

/** Member id → display name, for cards, lists and the activity feed. */
export const memberNames = (ws: WorkspaceDetails) => new Map(ws.members.map((m) => [m.userId, m.name]));
