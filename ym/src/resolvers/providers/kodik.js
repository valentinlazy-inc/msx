const {
  collectMediaUrls,
  ensureAbsoluteUrl,
  fetchText,
  normalizeResolveResult,
  parseJsonLoose,
  unique
} = require('../shared');

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

  return Buffer.from(shifted, 'base64').toString('utf8');
}

function toAbsoluteMediaUrl(url) {
  if (!url) return '';
  return ensureAbsoluteUrl(url);
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
        const absolute = toAbsoluteMediaUrl(resolved);
        if (absolute) direct.push(absolute);
      });
    });

  if (payload && payload.link) {
    const absolute = toAbsoluteMediaUrl(payload.link);
    if (absolute) direct.unshift(absolute);
  }

  return unique(direct);
}

function parsePageState(html) {
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

async function resolveKodik(input) {
  const url = ensureAbsoluteUrl(input.url);
  const page = await fetchText(url);
  const pageState = parsePageState(page.body);

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

module.exports = {
  resolveKodik
};
