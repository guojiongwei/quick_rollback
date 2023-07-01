import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';

const server = http.createServer((req, res) => {
  // 获取请求的路径
  const { pathname } = url.parse(req.url, true);
  // 获取请求的方法
  const method = req.method.toLowerCase();

  // 如果请求的是根路径，就返回rollback.html
  if(pathname === '/' && method === 'get') {
    res.writeHead(200, { 'Content-Type': 'text/html' }, 'utf-8')
    res.end(fs.readFileSync(path.resolve('./rollback.html'), 'utf-8'))
  }

  // 如果请求的是history，就返回history.json的内容
  if(pathname === '/history' && method === 'get') {
    res.writeHead(200, { 'Content-Type': 'application/json' }, 'utf-8')
    res.end(JSON.stringify({
      code: 200,
      mssage: '操作成功',
      data: JSON.parse(fs.readFileSync(path.resolve('./history.json'), 'utf-8'))
    }))
  }

  // 如果请求的是rollback，就将对应版本的html内容写入到dist/index.html中
  if(pathname === '/rollback' && method === 'get') {
    res.writeHead(200, { 'Content-Type': 'application/json' }, 'utf-8')
    const { query } = url.parse(req.url, true);
    const { id } = query;
    const history = JSON.parse(fs.readFileSync(path.resolve('./history.json'), 'utf-8'));
    const html = history.list.find(item => item.id === id).html;
    fs.writeFileSync(path.resolve('./dist/index.html'), html);
    res.end(JSON.stringify({
      code: 200,
      mssage: '操作成功',
      data: {}
    }));
  }
})

server.listen(3001, () => {
  console.log('server is running on http://localhost:3001')
});