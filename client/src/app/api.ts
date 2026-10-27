import { createApi, fetchBaseQuery, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { applyMove } from "../lib/board";
import type {
  Activity, AiSource, Comment, Member, Priority, Project, ProjectSummary, Role, Standup, SuggestedTask, Task, TaskStatus, User,
  WorkspaceDetails, WorkspaceSummary,
} from "../lib/types";
import { toast } from "./uiSlice";

/** The server's error body: { error, message, ...extra }. */
export interface ApiErrorBody {
  error: string;
  message: string;
  task?: Task;
}

export function errorMessage(err: unknown): string {
  const e = err as FetchBaseQueryError | undefined;
  if (!e) return "Something went wrong.";
  if (e.status === "FETCH_ERROR") return "Can't reach the server. Check your connection and try again.";
  const data = e.data as ApiErrorBody | undefined;
  if (data?.message) return data.message;
  return typeof e.status === "number" && e.status >= 500 ? "The server is starting up or busy. Try again in a moment." : "Request failed.";
}
export const errorCode = (err: unknown) => ((err as FetchBaseQueryError | undefined)?.data as ApiErrorBody | undefined)?.error;

export type TaskPatch = Partial<Pick<Task, "title" | "description" | "status" | "priority" | "assigneeId" | "dueDate" | "labels">>;

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api", credentials: "include" }),
  tagTypes: ["Me", "Workspaces", "Workspace", "Projects", "Tasks", "Comments", "Activity", "Standup"],
  endpoints: (b) => ({
    // ---------- Auth ----------
    me: b.query<User | null, void>({
      query: () => "/auth/me",
      transformResponse: (r: { user: User }) => r.user,
      providesTags: ["Me"],
    }),
    login: b.mutation<{ user: User }, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      invalidatesTags: ["Me", "Workspaces"],
    }),
    signup: b.mutation<{ user: User; workspaceId: string }, { name: string; email: string; password: string }>({
      query: (body) => ({ url: "/auth/signup", method: "POST", body }),
      invalidatesTags: ["Me", "Workspaces"],
    }),
    demo: b.mutation<{ user: User; workspaceId: string; projectId: string }, void>({
      query: () => ({ url: "/auth/demo", method: "POST" }),
      invalidatesTags: ["Me", "Workspaces"],
    }),
    logout: b.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
    }),

    // ---------- Workspaces ----------
    workspaces: b.query<WorkspaceSummary[], void>({
      query: () => "/workspaces",
      transformResponse: (r: { workspaces: WorkspaceSummary[] }) => r.workspaces,
      providesTags: ["Workspaces"],
    }),
    workspace: b.query<WorkspaceDetails, string>({
      query: (id) => `/workspaces/${id}`,
      transformResponse: (r: { workspace: WorkspaceDetails }) => r.workspace,
      providesTags: (_r, _e, id) => [{ type: "Workspace", id }],
    }),
    createWorkspace: b.mutation<WorkspaceDetails, string>({
      query: (name) => ({ url: "/workspaces", method: "POST", body: { name } }),
      transformResponse: (r: { workspace: WorkspaceDetails }) => r.workspace,
      invalidatesTags: ["Workspaces"],
    }),
    renameWorkspace: b.mutation<WorkspaceDetails, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/workspaces/${id}`, method: "PATCH", body: { name } }),
      transformResponse: (r: { workspace: WorkspaceDetails }) => r.workspace,
      invalidatesTags: (_r, _e, { id }) => ["Workspaces", { type: "Workspace", id }],
    }),
    rotateInvite: b.mutation<WorkspaceDetails, string>({
      query: (id) => ({ url: `/workspaces/${id}/invite/rotate`, method: "POST" }),
      transformResponse: (r: { workspace: WorkspaceDetails }) => r.workspace,
      invalidatesTags: (_r, _e, id) => [{ type: "Workspace", id }],
    }),
    invitePreview: b.query<{ workspace: { id: string; name: string; memberCount: number }; alreadyMember: boolean }, string>({
      query: (code) => `/invites/${code}`,
    }),
    joinWorkspace: b.mutation<WorkspaceDetails, string>({
      query: (code) => ({ url: "/workspaces/join", method: "POST", body: { code } }),
      transformResponse: (r: { workspace: WorkspaceDetails }) => r.workspace,
      invalidatesTags: ["Workspaces"],
    }),
    setMemberRole: b.mutation<WorkspaceDetails, { workspaceId: string; userId: string; role: Exclude<Role, "owner"> }>({
      query: ({ workspaceId, userId, role }) => ({ url: `/workspaces/${workspaceId}/members/${userId}`, method: "PATCH", body: { role } }),
      transformResponse: (r: { workspace: WorkspaceDetails }) => r.workspace,
      invalidatesTags: (_r, _e, { workspaceId }) => [{ type: "Workspace", id: workspaceId }],
    }),
    removeMember: b.mutation<void, { workspaceId: string; userId: string }>({
      query: ({ workspaceId, userId }) => ({ url: `/workspaces/${workspaceId}/members/${userId}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { workspaceId }) => ["Workspaces", { type: "Workspace", id: workspaceId }],
    }),

    // ---------- Projects ----------
    projects: b.query<Project[], string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/projects`,
      transformResponse: (r: { projects: Project[] }) => r.projects,
      providesTags: (_r, _e, id) => [{ type: "Projects", id }],
    }),
    createProject: b.mutation<Project, { workspaceId: string; name: string; description?: string }>({
      query: ({ workspaceId, ...body }) => ({ url: `/workspaces/${workspaceId}/projects`, method: "POST", body }),
      transformResponse: (r: { project: Project }) => r.project,
      invalidatesTags: (_r, _e, { workspaceId }) => [{ type: "Projects", id: workspaceId }, "Workspaces"],
    }),
    updateProject: b.mutation<Project, { id: string; workspaceId: string; name?: string; description?: string }>({
      query: ({ id, workspaceId: _w, ...body }) => ({ url: `/projects/${id}`, method: "PATCH", body }),
      transformResponse: (r: { project: Project }) => r.project,
      invalidatesTags: (_r, _e, { workspaceId }) => [{ type: "Projects", id: workspaceId }],
    }),
    deleteProject: b.mutation<void, { id: string; workspaceId: string }>({
      query: ({ id }) => ({ url: `/projects/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { workspaceId }) => [{ type: "Projects", id: workspaceId }, "Workspaces"],
    }),

    // ---------- Tasks ----------
    tasks: b.query<Task[], string>({
      query: (projectId) => `/projects/${projectId}/tasks`,
      transformResponse: (r: { tasks: Task[] }) => r.tasks,
      providesTags: (_r, _e, id) => [{ type: "Tasks", id }],
    }),
    createTask: b.mutation<Task, { projectId: string; title: string; status?: TaskStatus; priority?: Priority; assigneeId?: string | null; dueDate?: string | null }>({
      query: ({ projectId, ...body }) => ({ url: `/projects/${projectId}/tasks`, method: "POST", body }),
      transformResponse: (r: { task: Task }) => r.task,
      async onQueryStarted({ projectId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(api.util.updateQueryData("tasks", projectId, (draft) => (draft.some((t) => t.id === data.id) ? draft : [...draft, data])));
        } catch (e) {
          dispatch(toast(errorMessage((e as { error: unknown }).error), "error"));
        }
      },
    }),
    bulkCreateTasks: b.mutation<Task[], { projectId: string; goal?: string; tasks: { title: string; description: string; priority: Priority; dueDate: string | null }[] }>({
      query: ({ projectId, ...body }) => ({ url: `/projects/${projectId}/tasks/bulk`, method: "POST", body }),
      transformResponse: (r: { tasks: Task[] }) => r.tasks,
      async onQueryStarted({ projectId }, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(api.util.updateQueryData("tasks", projectId, (draft) => [...draft.filter((t) => !data.some((d) => d.id === t.id)), ...data]));
      },
    }),
    /** Optimistic edit; a 409 means someone else saved first, so we show their version instead. */
    updateTask: b.mutation<Task, { task: Task; patch: TaskPatch }>({
      query: ({ task, patch }) => ({ url: `/tasks/${task.id}`, method: "PATCH", body: { ...patch, version: task.version } }),
      transformResponse: (r: { task: Task }) => r.task,
      async onQueryStarted({ task, patch }, { dispatch, queryFulfilled }) {
        const undo = dispatch(
          api.util.updateQueryData("tasks", task.projectId, (draft) => {
            const t = draft.find((x) => x.id === task.id);
            if (t) Object.assign(t, patch);
          }),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(api.util.updateQueryData("tasks", task.projectId, (draft) => draft.map((t) => (t.id === data.id && data.version >= t.version ? data : t))));
        } catch (e) {
          const err = (e as { error: FetchBaseQueryError }).error;
          const body = err?.data as ApiErrorBody | undefined;
          if (body?.error === "STALE" && body.task) {
            dispatch(api.util.updateQueryData("tasks", task.projectId, (draft) => draft.map((t) => (t.id === body.task!.id ? body.task! : t))));
            dispatch(toast("Someone else changed this task just now — showing their latest version.", "info"));
          } else {
            undo.undo();
            dispatch(toast(errorMessage(err), "error"));
          }
        }
      },
    }),
    moveTask: b.mutation<Task, { task: Task; status: TaskStatus; prevId: string | null; nextId: string | null }>({
      query: ({ task, status, prevId, nextId }) => ({ url: `/tasks/${task.id}/move`, method: "POST", body: { status, prevId, nextId } }),
      transformResponse: (r: { task: Task }) => r.task,
      async onQueryStarted({ task, status, prevId, nextId }, { dispatch, queryFulfilled }) {
        const undo = dispatch(api.util.updateQueryData("tasks", task.projectId, (draft) => applyMove(draft, task.id, status, prevId, nextId)));
        try {
          const { data } = await queryFulfilled;
          dispatch(api.util.updateQueryData("tasks", task.projectId, (draft) => draft.map((t) => (t.id === data.id && data.version >= t.version ? data : t))));
        } catch (e) {
          undo.undo();
          dispatch(toast(errorMessage((e as { error: unknown }).error), "error"));
        }
      },
    }),
    deleteTask: b.mutation<void, Task>({
      query: (task) => ({ url: `/tasks/${task.id}`, method: "DELETE" }),
      async onQueryStarted(task, { dispatch, queryFulfilled }) {
        const undo = dispatch(api.util.updateQueryData("tasks", task.projectId, (draft) => draft.filter((t) => t.id !== task.id)));
        try {
          await queryFulfilled;
        } catch (e) {
          undo.undo();
          dispatch(toast(errorMessage((e as { error: unknown }).error), "error"));
        }
      },
    }),

    // ---------- Comments & activity ----------
    comments: b.query<Comment[], string>({
      query: (taskId) => `/tasks/${taskId}/comments`,
      transformResponse: (r: { comments: Comment[] }) => r.comments,
      providesTags: (_r, _e, id) => [{ type: "Comments", id }],
    }),
    addComment: b.mutation<Comment, { taskId: string; body: string }>({
      query: ({ taskId, body }) => ({ url: `/tasks/${taskId}/comments`, method: "POST", body: { body } }),
      transformResponse: (r: { comment: Comment }) => r.comment,
      async onQueryStarted({ taskId }, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(api.util.updateQueryData("comments", taskId, (draft) => (draft.some((c) => c.id === data.id) ? draft : [...draft, data])));
      },
    }),
    deleteComment: b.mutation<void, Comment>({
      query: (c) => ({ url: `/comments/${c.id}`, method: "DELETE" }),
      async onQueryStarted(c, { dispatch, queryFulfilled }) {
        const undo = dispatch(api.util.updateQueryData("comments", c.taskId, (draft) => draft.filter((x) => x.id !== c.id)));
        try {
          await queryFulfilled;
        } catch (e) {
          undo.undo();
          dispatch(toast(errorMessage((e as { error: unknown }).error), "error"));
        }
      },
    }),
    activity: b.query<Activity[], { workspaceId: string; projectId?: string; taskId?: string; limit?: number }>({
      query: ({ workspaceId, ...q }) => ({ url: `/workspaces/${workspaceId}/activity`, params: q }),
      transformResponse: (r: { activity: Activity[] }) => r.activity,
      providesTags: (_r, _e, { workspaceId }) => [{ type: "Activity", id: workspaceId }],
    }),

    // ---------- AI ----------
    aiStatus: b.query<{ provider: "anthropic" | "openai" | "template"; model: string | null }, void>({
      query: () => "/ai/status",
    }),
    breakdown: b.mutation<{ tasks: SuggestedTask[]; source: AiSource; note: string | null }, { projectId: string; goal: string }>({
      query: ({ projectId, goal }) => ({ url: `/projects/${projectId}/ai/breakdown`, method: "POST", body: { goal } }),
    }),
    summary: b.query<ProjectSummary, { projectId: string; today: string }>({
      query: ({ projectId, today }) => ({ url: `/projects/${projectId}/ai/summary`, params: { today } }),
      transformResponse: (r: { summary: ProjectSummary }) => r.summary,
      keepUnusedDataFor: 0,
    }),
    standup: b.query<Standup, { workspaceId: string; today: string }>({
      query: ({ workspaceId, today }) => ({ url: `/workspaces/${workspaceId}/ai/standup`, params: { today } }),
      transformResponse: (r: { standup: Standup }) => r.standup,
      providesTags: (_r, _e, { workspaceId }) => [{ type: "Standup", id: workspaceId }],
    }),
  }),
});

export type { Member };
export const {
  useMeQuery, useLoginMutation, useSignupMutation, useDemoMutation, useLogoutMutation,
  useWorkspacesQuery, useWorkspaceQuery, useCreateWorkspaceMutation, useRenameWorkspaceMutation, useRotateInviteMutation,
  useInvitePreviewQuery, useJoinWorkspaceMutation, useSetMemberRoleMutation, useRemoveMemberMutation,
  useProjectsQuery, useCreateProjectMutation, useUpdateProjectMutation, useDeleteProjectMutation,
  useTasksQuery, useCreateTaskMutation, useBulkCreateTasksMutation, useUpdateTaskMutation, useMoveTaskMutation, useDeleteTaskMutation,
  useCommentsQuery, useAddCommentMutation, useDeleteCommentMutation, useActivityQuery,
  useAiStatusQuery, useBreakdownMutation, useLazySummaryQuery, useStandupQuery,
} = api;
