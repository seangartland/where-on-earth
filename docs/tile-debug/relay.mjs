// local CONNECT relay -> egress proxy with auth, so Chrome fetches for real
import http from 'node:http'; import net from 'node:net';
const up = new URL(process.env.HTTPS_PROXY);
const auth = 'Basic ' + Buffer.from(decodeURIComponent(up.username) + ':' + decodeURIComponent(up.password)).toString('base64');
const s = http.createServer((req, res) => { res.writeHead(501); res.end(); });
s.on('connect', (req, cs, head) => {
  const u = net.connect(+up.port, up.hostname, () => {
    u.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${auth}\r\n\r\n`);
    u.once('data', (d) => { cs.write(d); if (head.length) u.write(head); u.pipe(cs); cs.pipe(u); });
  });
  u.on('error', () => cs.destroy()); cs.on('error', () => u.destroy());
});
s.listen(18888, '127.0.0.1', () => console.log('relay up'));
