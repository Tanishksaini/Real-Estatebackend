const http = require("http");
const path = require("path");
const fs = require("fs");

const { app } = require("./app");
const { connectDb } = require("./config/db");

async function main() {
  const port = Number(process.env.PORT || 4000);

  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  const uploadAbs = path.resolve(process.cwd(), uploadDir);
  if (!fs.existsSync(uploadAbs)) fs.mkdirSync(uploadAbs, { recursive: true });

  await connectDb();

  const server = http.createServer(app);
  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

