/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const API = process.env.API_URL ?? "http://localhost:4000";
const proxy = {
  "/api": API,
  "/socket.io": { target: API, ws: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
  build: {
    rollupOptions: {
      output: {
        // Drag-and-drop and the socket client load with the app, not with the landing page.
        manualChunks(id) {
          if (id.includes("@dnd-kit")) return "dnd";
          if (id.includes("socket.io") || id.includes("engine.io")) return "realtime";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
