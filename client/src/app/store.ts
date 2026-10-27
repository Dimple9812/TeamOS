import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import ui from "./uiSlice";

export const makeStore = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer, ui },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

export const store = makeStore();
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
