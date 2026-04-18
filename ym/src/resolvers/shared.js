const DEFAULT_HEADERS = {
  'accept-language': 'ru,en-US;q=0.9,en;q=0.8',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
};

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
    if (/^https?:\/\//i.test(text) || /^\/\//.test(text) || /^\//.test(text)) {
      if (/\.(m3u8|mp4|mpd)(\?|$)/i.test(text) || /manifest|master\.m3u8|index\.m3u8|stream/i.test(text)) {
        out.push(ensureAbsoluteUrl(text));
      }
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

async function tryHeadlessResolve(config) {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (error) {
    throw new Error('playwright is required for headless resolving. Run npm install first.');
  }

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: DEFAULT_HEADERS['user-agent']
  });
  const page = await context.newPage();
  const found = [];

  function push(url) {
    const normalized = ensureAbsoluteUrl(url);
    if (!normalized) return;
    if (/\.(m3u8|mp4|mpd)(\?|$)/i.test(normalized) || /manifest|master\.m3u8|index\.m3u8|stream/i.test(normalized)) {
      found.push(normalized);
    }
  }

  page.on('request', request => push(request.url()));
  page.on('response', async response => {
    push(response.url());
    const type = response.headers()['content-type'] || '';
    if (/json|javascript|text/i.test(type)) {
      try {
        const text = await response.text();
        collectMediaUrls(parseJsonLoose(text) || text, found);
      } catch (error) {
      }
    }
  });

  await page.goto(ensureAbsoluteUrl(config.url), {
    timeout: config.timeout || 45000,
    waitUntil: 'domcontentloaded'
  });

  if (config.evaluate) {
    try {
      const extra = await page.evaluate(config.evaluate);
      collectMediaUrls(extra, found);
    } catch (error) {
    }
  }

  await page.waitForTimeout(config.waitMs || 5000);
  await browser.close();

  const directUrls = unique(found);
  if (!directUrls.length) throw new Error('no direct media URLs found');
  return directUrls;
}

module.exports = {
  collectMediaUrls,
  ensureAbsoluteUrl,
  fetchText,
  normalizeResolveResult,
  parseJsonLoose,
  tryHeadlessResolve,
  unique
};
