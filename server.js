// Servidor: sirve el juego y reenvía los datos de cada sala entre los jugadores.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const html = fs.readFileSync(path.join(__dirname, 'juego.html'));

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.end('ok'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });
const rooms = new Map();
let counter = 0;
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const merge = (a, b) => {
  for (const k of Object.keys(b)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (!(k in a) && Object.keys(a).length >= 20) continue;
    a[k] = b[k];
  }
};

wss.on('connection', (ws, req) => {
  const name = (new URL(req.url, 'http://x').searchParams.get('room') || '').slice(0, 40);
  if (!/^[\w-]{3,40}$/.test(name)) { ws.close(); return; }
  let room = rooms.get(name);
  if (!room) { room = new Map(); rooms.set(name, room); }
  if (room.size >= 8) { ws.close(); return; }

  const id = 'p' + (++counter).toString(36) + Math.random().toString(36).slice(2, 6);
  const me = { ws, presence: {} };
  room.set(id, me);
  send(ws, { t: 'hi', id, peers: [...room].filter(([k]) => k !== id).map(([k, v]) => ({ peer: k, presence: v.presence })) });
  for (const [k, v] of room) if (k !== id) send(v.ws, { t: 'j', peer: id });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t !== 'p' || !m.d || typeof m.d !== 'object' || Array.isArray(m.d)) return;
    merge(me.presence, m.d);
    for (const [k, v] of room) if (k !== id) send(v.ws, { t: 'u', peer: id, d: m.d });
  });
  ws.on('close', () => {
    room.delete(id);
    for (const [, v] of room) send(v.ws, { t: 'l', peer: id });
    if (!room.size) rooms.delete(name);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log('Haxball en http://localhost:' + PORT));
