const {
  ensureAbsoluteUrl,
  fetchText,
  normalizeResolveResult,
  tryHeadlessResolve,
  unique
} = require('../shared');

function extractVideoId(url) {
  const match = ensureAbsoluteUrl(url).match(/\/video\/([^/?#]+)/i);
  return match ? match[1] : '';
}

async function resolveAksor(input) {
  const url = ensureAbsoluteUrl(input.url);
  await fetchText(url);

  const directUrls = await tryHeadlessResolve({
    url,
    waitMs: 6000,
    evaluate: () => ({
      location: window.location.href,
      html: document.documentElement.outerHTML
    })
  });

  return normalizeResolveResult('aksor', url, {
    playerUrl: url,
    videoId: extractVideoId(url),
    directUrls: unique(directUrls),
    strategy: 'headless'
  });
}

module.exports = {
  resolveAksor
};
