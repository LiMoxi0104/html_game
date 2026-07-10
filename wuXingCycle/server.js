// 本地静态服务器（仅用于本地开发/调试）。运行：node server.js，访问 http://localhost:5173
// 支持 .html/.js/.css/.json/.png 等 mime，保证 fetch 加载 config/*.json 正常。
const http = require("http");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || 5173;
const root = __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".md": "text/markdown; charset=utf-8"
};

http.createServer((req, res) => {
  let urlPath = req.url === "/" ? "/index.html" : req.url;
  urlPath = urlPath.split("?")[0];
  const filePath = path.join(root, path.normalize(urlPath));
  // 防目录穿越
  if (!filePath.startsWith(root)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found: " + urlPath); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => console.log(`[wuXingCycle] 本地服务已启动：http://localhost:${port}`));
