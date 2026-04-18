const DEFAULT_HEADERS = {
  'accept-language': 'ru,en-US;q=0.9,en;q=0.8',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
};

const TEMPLATE_EXTENSIONS = new Set(['.html', '.json']);

function getBinding(env, name) {
  if (env && typeof env === 'object' && name in env) return env[name];
  if (typeof globalThis[name] !== 'undefined') return globalThis[name];
  return undefined;
}

function getAssetsBinding(env) {
  return getBinding(env, 'ASSETS');
}

function getToken(env) {
  return String(getBinding(env, 'YAMMY_TOKEN') || getBinding(env, 'YUMMY_TOKEN') || '').trim();
}

function sendJson(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    }
  });
}

function renderTemplate(text, origin, env) {
  return String(text)
    .replace(/\{BASE\}/g, origin)
    .replace(/\{YUMMY_TOKEN\}/g, getToken(env));
}

function extname(pathname) {
  const match = String(pathname || '').match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function ensureAbsoluteUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  return value;
}

async function fetchText(url, options = {}) {
  const response = await fetch(ensureAbsoluteUrl(url), {
    redirect: 'follow',
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {})
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    url: response.url,
    body: await response.text()
  };
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function collectMediaUrls(value, out = []) {
  if (!value) return out;

  if (typeof value === 'string') {
    const text = value.trim();
    if ((/^https?:\/\//i.test(text) || /^\/\//.test(text) || /^\//.test(text))
      && (/\.(m3u8|mp4|mpd)(\?|$)/i.test(text) || /manifest|master\.m3u8|index\.m3u8|stream/i.test(text))) {
      out.push(ensureAbsoluteUrl(text));
    }
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectMediaUrls(item, out));
    return out;
  }

  if (typeof value === 'object') {
    Object.keys(value).forEach(key => collectMediaUrls(value[key], out));
  }

  return out;
}

function unique(list) {
  return Array.from(new Set((list || []).filter(Boolean)));
}

function normalizeResolveResult(provider, sourceUrl, payload) {
  return {
    provider,
    sourceUrl,
    resolvedAt: new Date().toISOString(),
    ...payload
  };
}

function detectProvider(url) {
  const value = String(url || '');
  if (/kodik(player)?\./i.test(value)) return 'kodik';
  if (/aksor\.tv/i.test(value)) return 'aksor';
  if (/alloha/i.test(value)) return 'alloha';
  return '';
}

function parseInlineString(html, name) {
  const match = html.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)";`, 'i'));
  return match ? match[1] : '';
}

function parseInlineJsonString(html, name) {
  const raw = parseInlineString(html, name);
  return raw ? parseJsonLoose(raw) : null;
}

function parseInlineSingleQuoted(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : '';
}

function decodeKodikPath(value) {
  const shifted = String(value || '').replace(/[a-zA-Z]/g, char => {
    const limit = char <= 'Z' ? 90 : 122;
    const code = char.charCodeAt(0) + 18;
    return String.fromCharCode(limit >= code ? code : code - 26);
  });

  return atob(shifted);
}

function collectKodikLinks(payload) {
  const direct = [];
  const byQuality = payload && payload.links && typeof payload.links === 'object' ? payload.links : {};

  Object.keys(byQuality)
    .sort((left, right) => Number(right) - Number(left))
    .forEach(quality => {
      const variants = Array.isArray(byQuality[quality]) ? byQuality[quality] : [];
      variants.forEach(item => {
        const raw = item && item.src ? String(item.src) : '';
        if (!raw) return;
        const resolved = raw.includes('//') ? raw : decodeKodikPath(raw);
        const absolute = ensureAbsoluteUrl(resolved);
        if (absolute) direct.push(absolute);
      });
    });

  if (payload && payload.link) {
    const absolute = ensureAbsoluteUrl(payload.link);
    if (absolute) direct.unshift(absolute);
  }

  return unique(direct);
}

function parseKodikPageState(html) {
  const urlParams = parseInlineJsonString(html, 'urlParams') || {};
  return {
    type: parseInlineSingleQuoted(html, /vInfo\.type\s*=\s*'([^']*)'/i) || parseInlineString(html, 'type'),
    videoId: parseInlineSingleQuoted(html, /vInfo\.id\s*=\s*'([^']*)'/i) || parseInlineString(html, 'videoId'),
    videoHash: parseInlineSingleQuoted(html, /vInfo\.hash\s*=\s*'([^']*)'/i),
    translationId: parseInlineSingleQuoted(html, /var\s+translationId\s*=\s*([0-9]+)/i) || parseInlineString(html, 'translationId'),
    translationTitle: parseInlineString(html, 'translationTitle'),
    domain: parseInlineString(html, 'domain') || urlParams.d || '',
    dSign: parseInlineString(html, 'd_sign') || urlParams.d_sign || '',
    pd: parseInlineString(html, 'pd') || urlParams.pd || '',
    pdSign: parseInlineString(html, 'pd_sign') || urlParams.pd_sign || '',
    ref: parseInlineString(html, 'ref') || urlParams.ref || '',
    refSign: parseInlineString(html, 'ref_sign') || urlParams.ref_sign || '',
    urlParams
  };
}

async function resolveKodik(url) {
  const page = await fetchText(url);
  const pageState = parseKodikPageState(page.body);

  if (!pageState.type || !pageState.videoId || !pageState.videoHash) {
    throw new Error('failed to extract Kodik player state');
  }

  const requestBody = new URLSearchParams({
    d: pageState.domain,
    d_sign: pageState.dSign,
    pd: pageState.pd,
    pd_sign: pageState.pdSign,
    ref: pageState.ref,
    ref_sign: pageState.refSign,
    bad_user: 'false',
    cdn_is_working: 'true',
    type: pageState.type,
    id: pageState.videoId,
    hash: pageState.videoHash
  });

  const ftorUrl = new URL('/ftor', page.url || url).toString();
  const response = await fetchText(ftorUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: new URL(page.url || url).origin,
      referer: page.url || url,
      'x-requested-with': 'XMLHttpRequest'
    },
    body: requestBody
  });

  if (!response.ok) {
    throw new Error(`kodik /ftor failed with ${response.status}`);
  }

  const payload = parseJsonLoose(response.body);
  if (!payload || typeof payload !== 'object') {
    throw new Error('kodik /ftor returned invalid json');
  }

  const directUrls = unique([
    ...collectKodikLinks(payload),
    ...collectMediaUrls(payload)
  ]);

  if (!directUrls.length) {
    throw new Error('kodik /ftor returned no direct media urls');
  }

  return normalizeResolveResult('kodik', url, {
    playerUrl: url,
    directUrls,
    type: pageState.type,
    videoId: pageState.videoId,
    videoHash: pageState.videoHash,
    translationId: pageState.translationId,
    translationTitle: pageState.translationTitle,
    urlParams: pageState.urlParams,
    strategy: 'ftor'
  });
}

async function resolveHtmlMedia(provider, url) {
  const page = await fetchText(url);
  const directUrls = unique(collectMediaUrls(page.body));
  if (!directUrls.length) {
    throw new Error(`${provider} requires a browser runtime; worker can only resolve direct media present in HTML`);
  }
  return normalizeResolveResult(provider, url, {
    playerUrl: url,
    directUrls,
    strategy: 'html'
  });
}

async function resolveMedia(input) {
  const url = ensureAbsoluteUrl(input.url);
  const provider = input.provider || detectProvider(url);

  if (provider === 'kodik') return resolveKodik(url);
  if (provider === 'aksor') return resolveHtmlMedia('aksor', url);
  if (provider === 'alloha') return resolveHtmlMedia('alloha', url);

  throw new Error(`unsupported provider for ${url}`);
}

async function readJson(request) {
  if (request.method !== 'POST') return {};
  return await request.json();
}

async function handleResolve(request) {
  const requestUrl = new URL(request.url);
  const input = request.method === 'POST'
    ? await readJson(request)
    : Object.fromEntries(requestUrl.searchParams.entries());
  const url = String(input.url || '').trim();
  const provider = String(input.provider || '').trim() || undefined;

  if (!url) {
    return sendJson({ error: 'url is required' }, 400);
  }

  try {
    const result = await resolveMedia({ provider, url });
    return sendJson(result, 200);
  } catch (error) {
    return sendJson({
      error: 'resolve_failed',
      message: error && error.message ? error.message : String(error)
    }, 502);
  }
}

async function handleStatic(request, env) {
  const assets = getAssetsBinding(env);
  if (!assets || typeof assets.fetch !== 'function') {
    return sendJson({
      error: 'assets_binding_required',
      message: 'Cloudflare Workers ASSETS binding is required to serve static files'
    }, 500);
  }

  const url = new URL(request.url);
  if (url.pathname === '/') url.pathname = '/app.html';

  const assetRequest = new Request(url.toString(), request);
  const assetResponse = await assets.fetch(assetRequest);
  const extension = extname(url.pathname);

  if (!assetResponse.ok || !TEMPLATE_EXTENSIONS.has(extension)) {
    return assetResponse;
  }

  const rendered = renderTemplate(await assetResponse.text(), url.origin, env);
  const headers = new Headers(assetResponse.headers);
  headers.set('content-length', String(rendered.length));
  headers.set('cache-control', extension === '.html' ? 'no-store' : 'public, max-age=60');

  return new Response(rendered, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });
}

async function handleRequest(request, env) {
  const requestUrl = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type'
      }
    });
  }

  if (requestUrl.pathname === '/api/health') {
    return sendJson({ ok: true }, 200);
  }

  if (requestUrl.pathname === '/api/resolve') {
    return handleResolve(request);
  }

  return handleStatic(request, env);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  }
};
