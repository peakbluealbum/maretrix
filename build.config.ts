import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The custom URL scheme the app registers, read once from the Tauri config.
 *
 * `vite.config.ts` and `vitest.config.ts` both define `TAURI_SSO_SCHEME` from this, so the build and
 * the tests cannot drift apart the way the source and `tauri.conf.json` used to.
 */
const tauriConf = JSON.parse(
  readFileSync(resolve(__dirname, 'src-tauri/tauri.conf.json'), 'utf8')
) as { plugins?: { 'deep-link'?: { desktop?: { schemes?: string[] } } } };

export const tauriSsoScheme = tauriConf.plugins?.['deep-link']?.desktop?.schemes?.[0] ?? 'maretrix';

export default {
  base: '/',
};
