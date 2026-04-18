const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { resolveMedia } = require('./src/resolvers');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const STATIC_ROOT = process.env.STATIC_ROOT ? path.resolve(process.env.STATIC_ROOT) : ROOT;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

const TEMPLATE_EXTENSIONS = new Set(['.html', '.json']);

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(text);
}

function renderTemplate(text, origin) {
  return text
    .replace(/\{BASE\}/g, origin)
    .replace(/\{YUMMY_TOKEN\}/g, process.env.YAMMY_TOKEN || process.env.YUMMY_TOKEN || '');
}

function sendFile(req, res, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (TEMPLATE_EXTENSIONS.has(ext)) {
      fs.readFile(filePath, 'utf8', (readError, text) => {
        if (readError) {
          sendJson(res, 500, { error: 'read_failed' });
          return;
        }
        const origin = `http://${req.headers.host || `127.0.0.1:${PORT}`}`;
        const rendered = renderTemplate(text, origin);
        res.writeHead(200, {
          'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=60',
          'content-length': Buffer.byteLength(rendered),
          'content-type': MIME_TYPES[ext]
        });
        res.end(rendered);
      });
      return;
    }

    res.writeHead(200, {
      'cache-control': 'public, max-age=300',
      'content-length': stats.size,
      'content-type': MIME_TYPES[ext] || 'application/octet-stream'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function getStaticPath(requestPath) {
  const pathname = requestPath === '/' ? '/app.html' : requestPath;
  const safe = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const absolute = path.join(STATIC_ROOT, safe);
  if (!absolute.startsWith(STATIC_ROOT)) return null;
  return absolute;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('invalid json body'));
      }
    });
    req.on('error', reject);
  });
}

async function handleResolve(req, res, requestUrl) {
  const input = req.method === 'POST'
    ? await readJson(req)
    : Object.fromEntries(requestUrl.searchParams.entries());
  const url = String(input.url || '').trim();
  const provider = String(input.provider || '').trim() || undefined;

  if (!url) {
    sendJson(res, 400, { error: 'url is required' });
    return;
  }

  try {
    const result = await resolveMedia({ provider, url });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, {
      error: 'resolve_failed',
      message: error && error.message ? error.message : String(error)
    });
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    res.end();
    return;
  }

  if (requestUrl.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === '/api/resolve') {
    await handleResolve(req, res, requestUrl);
    return;
  }

  const filePath = getStaticPath(requestUrl.pathname);
  if (!filePath) {
    sendJson(res, 400, { error: 'bad_path' });
    return;
  }
  sendFile(req, res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`YM server listening on http://${HOST}:${PORT}`);
  console.log(`Static root: ${STATIC_ROOT}`);
});
