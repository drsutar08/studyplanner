// Whether this build must (or may) be updated, from app_config.app_update (see 20261116000000_app_update.sql).
// Pure logic, so e2e/appUpdate.test.mjs can run it in Node.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// 'force' (block the app), 'suggest' (dismissible prompt) or 'none'.
// No config, an unknown platform or no build number (web, Expo Go) always means 'none': never block by mistake.
export function updateState(config, platform, build) {
  const p = config && typeof config === 'object' ? config[platform] : null;
  const current = num(build);
  if (!p || !current) return 'none';
  if (num(p.min_build) > current) return 'force';
  if (num(p.latest_build) > current) return 'suggest';
  return 'none';
}

// The newest build the config knows about: a dismissed "Update available" comes back only for a newer one.
export const offeredBuild = (config, platform) => {
  const p = config && config[platform];
  return p ? Math.max(num(p.min_build), num(p.latest_build)) : 0;
};

// Where the Update button goes: the Play Store app first, then its web page. A store_url in the config wins
// (needed for iOS: the App Store link has an id only known after the app is listed).
export function storeLinks(config, platform, appId) {
  const custom = config && config[platform] && config[platform].store_url;
  if (custom) return [String(custom)];
  if (platform === 'android' && appId) {
    return [`market://details?id=${appId}`, `https://play.google.com/store/apps/details?id=${appId}`];
  }
  return [];
}
