const { resolveAksor } = require('./providers/aksor');
const { resolveAlloha } = require('./providers/alloha');
const { resolveKodik } = require('./providers/kodik');

function detectProvider(url) {
  const value = String(url || '');
  if (/kodik(player)?\./i.test(value)) return 'kodik';
  if (/aksor\.tv/i.test(value)) return 'aksor';
  if (/alloha/i.test(value)) return 'alloha';
  return '';
}

async function resolveMedia(input) {
  const provider = input.provider || detectProvider(input.url);

  if (provider === 'kodik') return resolveKodik(input);
  if (provider === 'aksor') return resolveAksor(input);
  if (provider === 'alloha') return resolveAlloha(input);

  throw new Error(`unsupported provider for ${input.url}`);
}

module.exports = {
  detectProvider,
  resolveMedia
};
