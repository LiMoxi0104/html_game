const http = require('http'), fs = require('fs'), path = require('path');
const port = process.env.PORT || 5173;
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.md':'text/markdown','.json':'application/json'};
http.createServer((req,res)=>{
  let p = req.url === '/' ? '/index.html' : req.url;
  p = p.split('?')[0];
  const fp = path.join(__dirname, p);
  fs.readFile(fp, (e, data)=>{
    if(e){ res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(fp)] || 'application/octet-stream'});
    res.end(data);
  });
}).listen(port, ()=>console.log('serving on '+port));
