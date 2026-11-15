import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type as osType } from '@tauri-apps/plugin-os';
import {
  buildTauriSsoRedirectUrl,
  isTauriSsoCallbackTarget,
  parseTauriOidcCallback,
  parseTauriSsoCallback,
  rememberTauriSsoNonce,
  takeTauriSsoNonce,
} from './SSOTauri';

/**
 * The scheme the app registers, read from the Tauri config the same way the build reads it. Hard-coding
 * `sable:` here is how the login ended up pointing at a scheme no platform resolved.
 */
const tauriConf = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../src-tauri/tauri.conf.json'), 'utf8')
) as { plugins?: { 'deep-link'?: { desktop?: { schemes?: string[] } } } };
const SSO_SCHEME = tauriConf.plugins?.['deep-link']?.desktop?.schemes?.[0] ?? 'maretrix';
const SSO_PROTOCOL = `${SSO_SCHEME}:`;

vi.mock('@tauri-apps/plugin-os', () => ({
  type: vi.fn<() => string>(() => 'android'),
}));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(osType).mockReturnValue('android');
  localStorage.clear();
});

describe('buildTauriSsoRedirectUrl', () => {
  it('uses the registered deep-link callback in production desktop builds', () => {
    vi.stubEnv('DEV', false);
    vi.mocked(osType).mockReturnValue('linux');

    const url = new URL(buildTauriSsoRedirectUrl('https://hs.example'));

    expect(url.protocol).toBe(SSO_PROTOCOL);
    expect(url.hostname).toBe('login');
    expect(url.pathname).toBe('/lp/sso-callback');
    expect(url.searchParams.get('server')).toBe('https://hs.example');
    const nonce = url.searchParams.get('sso_nonce');
    expect(nonce).toBeTruthy();
    expect(takeTauriSsoNonce()).toBe(nonce);
    expect(takeTauriSsoNonce()).toBeUndefined();
  });

  it('embeds the server and stores the same nonce it puts in the url', () => {
    const url = new URL(buildTauriSsoRedirectUrl('https://hs.example'));
    expect(url.searchParams.get('server')).toBe('https://hs.example');
    const nonce = url.searchParams.get('sso_nonce');
    expect(nonce).toBeTruthy();
    expect(takeTauriSsoNonce()).toBe(nonce);
  });

  it('omits the server when none is provided but still sets a nonce', () => {
    const url = new URL(buildTauriSsoRedirectUrl());
    expect(url.searchParams.get('server')).toBeNull();
    expect(url.searchParams.get('sso_nonce')).toBeTruthy();
  });

  it('builds the url without resolving against a non-special base', () => {
    expect(buildTauriSsoRedirectUrl()).toMatch(
      new RegExp(`^${SSO_SCHEME}:\\/\\/login\\/lp\\/sso-callback\\?`)
    );
  });
});

describe('the registered scheme', () => {
  it('is the one tauri.conf.json advertises, not a hard-coded one', () => {
    expect(SSO_SCHEME).toBeTruthy();
    expect(tauriConf.plugins?.['deep-link']?.desktop?.schemes).toContain(SSO_SCHEME);
    expect(new URL(buildTauriSsoRedirectUrl()).protocol).toBe(SSO_PROTOCOL);
  });
});

describe('takeTauriSsoNonce', () => {
  it('returns the stored nonce once, then undefined', () => {
    rememberTauriSsoNonce('abc');
    expect(takeTauriSsoNonce()).toBe('abc');
    expect(takeTauriSsoNonce()).toBeUndefined();
  });
});

describe('parseTauriSsoCallback', () => {
  it('round-trips loginToken, server and nonce from a built redirect', () => {
    const redirect = buildTauriSsoRedirectUrl('https://hs.example');
    const nonce = takeTauriSsoNonce();
    expect(parseTauriSsoCallback(`${redirect}&loginToken=tok_123`)).toEqual({
      loginToken: 'tok_123',
      server: 'https://hs.example',
      nonce,
    });
  });

  it('rejects the wrong protocol', () => {
    expect(parseTauriSsoCallback('https://login/lp/sso-callback?loginToken=x')).toBeUndefined();
  });

  it('rejects a missing loginToken', () => {
    expect(parseTauriSsoCallback('maretrix://login/lp/sso-callback?server=x')).toBeUndefined();
  });
});

describe('isTauriSsoCallbackTarget', () => {
  it('accepts the authority shape', () => {
    expect(isTauriSsoCallbackTarget('login', '/lp/sso-callback')).toBe(true);
  });

  it('accepts the opaque-path shape Chromium below 130 produces', () => {
    expect(isTauriSsoCallbackTarget('', '//login/lp/sso-callback')).toBe(true);
  });

  it('rejects another host and another opaque path', () => {
    expect(isTauriSsoCallbackTarget('evil', '/lp/sso-callback')).toBe(false);
    expect(isTauriSsoCallbackTarget('', '//evil/lp/sso-callback')).toBe(false);
  });
});

describe('parseTauriOidcCallback', () => {
  it('parses code and state from single-slash format', () => {
    expect(parseTauriOidcCallback('com.daiwascarlet.maretrix:/login?code=c1&state=s1')).toEqual({
      code: 'c1',
      state: 's1',
    });
  });

  it('parses code and state from authority/hostname format (com.daiwascarlet.maretrix://login)', () => {
    expect(parseTauriOidcCallback('com.daiwascarlet.maretrix://login?code=c1&state=s1')).toEqual({
      code: 'c1',
      state: 's1',
    });
  });

  it('rejects the wrong path', () => {
    expect(parseTauriOidcCallback('com.daiwascarlet.maretrix:/other?code=c1&state=s1')).toBeUndefined();
    expect(parseTauriOidcCallback('com.daiwascarlet.maretrix://other?code=c1&state=s1')).toBeUndefined();
  });

  it('rejects a different protocol', () => {
    expect(parseTauriOidcCallback('maretrix://login?code=c1&state=s1')).toBeUndefined();
    expect(parseTauriOidcCallback('https://login?code=c1&state=s1')).toBeUndefined();
  });

  it('rejects an unrelated hostname with a login path', () => {
    expect(parseTauriOidcCallback('com.daiwascarlet.maretrix://evil/login?code=c1&state=s1')).toBeUndefined();
  });
});
