import http from "http";
import app from "./index.js";
import setupSockets from "./sockets/index.js";

const PORT = process.env.PORT || 5000;

// Create HTTP server ONCE
const server = http.createServer(app);

(async () => {
  await setupSockets(server, app);

  server.listen(PORT, () => {
    console.log(`🚀 Server + Socket.IO running on port ${PORT}`);
  });
})();
