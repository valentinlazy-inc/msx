const {
  ensureAbsoluteUrl,
  normalizeResolveResult,
  tryHeadlessResolve,
  unique
} = require('../shared');

async function resolveAlloha(input) {
  const url = ensureAbsoluteUrl(input.url);
  const directUrls = await tryHeadlessResolve({
    url,
    waitMs: 7000,
    evaluate: () => ({
      location: window.location.href,
      html: document.documentElement.outerHTML
    })
  });

  return normalizeResolveResult('alloha', url, {
    playerUrl: url,
    directUrls: unique(directUrls),
    strategy: 'headless'
  });
}

module.exports = {
  resolveAlloha
};
