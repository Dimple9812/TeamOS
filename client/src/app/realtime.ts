import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { upsertTask } from "../lib/board";
import type { Activity, Comment, PresenceUser, Project, Task } from "../lib/types";
import { api } from "./api";
import { useAppDispatch } from "./hooks";
import { store, type AppDispatch } from "./store";
import { setConnection, setPresence, toast } from "./uiSlice";

/** Where the socket server lives. Empty = same origin (the dev/preview proxy). */
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "";

let socket: Socket | null = null;
let joined: string | null = null;
let viewing: string | null = null;

/** Debounced so a burst of task events refreshes the project counts and standup once. */
const refreshDerived = (() => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (dispatch: AppDispatch, workspaceId: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => dispatch(api.util.invalidateTags([{ type: "Projects", id: workspaceId }, { type: "Standup", id: workspaceId }])), 800);
  };
})();

function applyActivity(dispatch: AppDispatch, a: Activity) {
  // Prepend to every cached activity list this event belongs to (workspace feed, project feed, task history).
  for (const args of api.util.selectCachedArgsForQuery(store.getState(), "activity")) {
    if (args.workspaceId !== a.workspaceId) continue;
    if (args.projectId && args.projectId !== a.projectId) continue;
    if (args.taskId && args.taskId !== a.taskId) continue;
    dispatch(
      api.util.updateQueryData("activity", args, (draft) => (draft.some((x) => x.id === a.id) ? draft : [a, ...draft].slice(0, args.limit ?? 40))),
    );
  }
}

function connect(dispatch: AppDispatch) {
  if (socket) return socket;
  dispatch(setConnection("connecting"));
  socket = io(SOCKET_URL || undefined, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    // A fresh short-lived token on every (re)connect.
    auth: (cb) => {
      fetch("/api/auth/socket-token", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { token: "" }))
        .then((r) => cb({ token: r.token }))
        .catch(() => cb({ token: "" }));
    },
  });

  let firstConnect = true;
  socket.on("connect", () => {
    dispatch(setConnection("live"));
    if (joined) {
      socket!.emit("workspace:join", { workspaceId: joined });
      if (viewing) socket!.emit("presence:view", { projectId: viewing });
    }
    // After a reconnect, refetch anything we may have missed while offline.
    if (!firstConnect) dispatch(api.util.invalidateTags(["Tasks", "Comments", "Activity", "Projects", "Workspace"]));
    firstConnect = false;
  });
  socket.on("disconnect", () => dispatch(setConnection("connecting")));
  socket.on("connect_error", () => dispatch(setConnection("offline")));

  socket.on("task:upsert", ({ task }: { task: Task }) => {
    dispatch(api.util.updateQueryData("tasks", task.projectId, (draft) => upsertTask(draft, task)));
    refreshDerived(dispatch, task.workspaceId);
  });
  socket.on("task:delete", ({ taskId, projectId }: { taskId: string; projectId: string }) => {
    dispatch(api.util.updateQueryData("tasks", projectId, (draft) => draft.filter((t) => t.id !== taskId)));
    if (joined) refreshDerived(dispatch, joined);
  });
  socket.on("comment:new", ({ comment }: { comment: Comment }) => {
    dispatch(api.util.updateQueryData("comments", comment.taskId, (draft) => (draft.some((c) => c.id === comment.id) ? draft : [...draft, comment])));
  });
  socket.on("comment:delete", ({ commentId, taskId }: { commentId: string; taskId: string }) => {
    dispatch(api.util.updateQueryData("comments", taskId, (draft) => draft.filter((c) => c.id !== commentId)));
  });
  socket.on("activity:new", ({ activity }: { activity: Activity }) => applyActivity(dispatch, activity));
  socket.on("project:upsert", ({ project }: { project: Project }) => {
    dispatch(
      api.util.updateQueryData("projects", project.workspaceId, (draft) => {
        const i = draft.findIndex((p) => p.id === project.id);
        if (i === -1) draft.push(project);
        else draft[i] = { ...draft[i], ...project };
      }),
    );
  });
  socket.on("project:delete", ({ projectId, workspaceId }: { projectId: string; workspaceId: string }) => {
    dispatch(api.util.updateQueryData("projects", workspaceId, (draft) => draft.filter((p) => p.id !== projectId)));
  });
  socket.on("workspace:changed", ({ workspaceId }: { workspaceId: string }) => {
    dispatch(api.util.invalidateTags([{ type: "Workspace", id: workspaceId }, "Workspaces"]));
  });
  socket.on("workspace:removed", ({ workspaceId }: { workspaceId: string }) => {
    dispatch(toast("You were removed from this workspace.", "info"));
    dispatch(api.util.invalidateTags([{ type: "Workspace", id: workspaceId }, "Workspaces"]));
  });
  socket.on("presence", (p: { workspaceId: string; users: PresenceUser[] }) => {
    if (p.workspaceId === joined) dispatch(setPresence(p));
  });
  return socket;
}

/** Keeps one socket per tab, joined to the open workspace and reporting which project is on screen. */
export function useRealtime(workspaceId: string | undefined, projectId: string | null) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!workspaceId) return;
    const s = connect(dispatch);
    joined = workspaceId;
    dispatch(setPresence({ workspaceId, users: [] }));
    if (s.connected) s.emit("workspace:join", { workspaceId });
    return () => {
      if (joined === workspaceId) {
        s.emit("workspace:leave");
        joined = null;
      }
    };
  }, [workspaceId, dispatch]);

  useEffect(() => {
    viewing = projectId;
    if (socket?.connected && joined) socket.emit("presence:view", { projectId });
  }, [projectId, workspaceId]);
}

export function disconnectRealtime() {
  socket?.close();
  socket = null;
  joined = null;
  viewing = null;
  store.dispatch(setConnection("offline"));
}
