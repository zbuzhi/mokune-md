export function validateUpdateConfig(config) {
  if (typeof config.enabled !== 'boolean') throw Error('Update enabled must be a boolean');
  if (!config.enabled) return null;
  let url; try { url = new URL(config.feedURL); } catch { throw Error('Invalid update feed URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Update feed requires HTTPS without credentials or fragment');
  if (typeof config.publicKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(config.publicKey) || Buffer.from(config.publicKey, 'base64').length !== 32) throw Error('A 32-byte Sparkle Ed25519 public key is required');
  return {feedURL:url.href,publicKey:config.publicKey};
}
