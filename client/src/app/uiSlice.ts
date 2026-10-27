import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PresenceUser } from "../lib/types";

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error" | "success";
}

interface UiState {
  toasts: Toast[];
  presence: { workspaceId: string | null; users: PresenceUser[] };
  connection: "offline" | "connecting" | "live";
}

const initialState: UiState = { toasts: [], presence: { workspaceId: null, users: [] }, connection: "offline" };
let nextId = 1;

const ui = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
        if (state.toasts.length > 3) state.toasts.shift();
      },
      prepare(message: string, tone: Toast["tone"] = "info") {
        return { payload: { id: nextId++, message, tone } };
      },
    },
    dismissToast(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    setPresence(state, action: PayloadAction<UiState["presence"]>) {
      state.presence = action.payload;
    },
    setConnection(state, action: PayloadAction<UiState["connection"]>) {
      state.connection = action.payload;
    },
  },
});

export const { toast, dismissToast, setPresence, setConnection } = ui.actions;
export default ui.reducer;
