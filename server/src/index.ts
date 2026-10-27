import { loadConfig } from "./config.js";
import { buildServer, createStore } from "./server.js";

const config = loadConfig();
const store = await createStore(config);
const server = buildServer(config, store);

server.http.listen(config.port, () => {
  console.log(
    `TeamOS API on :${config.port} (store: ${config.store}, ai: ${config.ai.provider}, origins: ${config.clientOrigins.join(", ")})`,
  );
});

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, closing connections…`);
    await server.close();
    process.exit(0);
  });
}
