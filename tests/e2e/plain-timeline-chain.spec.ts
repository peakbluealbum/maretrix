import { test, expect } from './fixtures/test';
import { createRoom, sendText } from './fixtures/continuwuity';
import { AppShell } from './pages/AppShell';
import { homeserverBaseUrl, loginAsFreshUser } from './fixtures/session';

/**
 * The one measurement the 1.1.1 timeline work has been missing: the height chain of the plain list,
 * taken from the real app rather than from a hand-built fixture.
 *
 * Five candidate builds went out against a symptom nobody had measured, so this spec prints the
 * chain and, more importantly, asserts that the plain path is rendering at all — on an iOS UA the
 * path is chosen by UA sniffing, and a false here means every CSS fix was aimed at the wrong
 * renderer.
 */
type Chain = {
  plainPath: boolean;
  rows: number;
  scroller: number;
  content: number;
  wrapper: number;
  wrapperParent: number;
  viewport: number;
  column: number;
  columnMinHeight: string;
  scrollerHeight: string;
  scrollerPosition: string;
};

test.describe('plain timeline height chain', () => {
  test('reports the chain from the real app', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const storageStatePath = testInfo.project.use.storageState as string;
    const hsBaseUrl = await homeserverBaseUrl(storageStatePath);
    const tag = `plain-${process.pid}-${Date.now().toString(36)}`;
    const app = new AppShell(page);
    const user = await loginAsFreshUser(page, hsBaseUrl, `${tag}-u`);

    const room = await createRoom(hsBaseUrl, user.accessToken, {
      name: `${tag} Room`,
      preset: 'private_chat',
    });
    for (let i = 0; i < 3; i += 1) {
      await sendText(hsBaseUrl, user.accessToken, room, `${tag}-m${i}`, i);
    }

    // Force the plain path regardless of UA: the point is the layout, not the sniffing.
    await page.goto('/?plainlist=1');
    await app.openRoom(`${tag} Room`);

    const chain = await page.evaluate((): Chain => {
      const s = document.querySelector<HTMLElement>('#timeline-scroller');
      const w = s?.parentElement ?? null;
      const p = w?.parentElement ?? null;
      const col = (s?.firstElementChild as HTMLElement | null) ?? null;
      const scrollerCss = s ? getComputedStyle(s) : null;
      const colCss = col ? getComputedStyle(col) : null;

      return {
        plainPath: document.querySelector('[data-testid="timeline-plain"]') !== null,
        rows: document.querySelectorAll('[data-message-id]').length,
        scroller: s?.clientHeight ?? -1,
        content: s?.scrollHeight ?? -1,
        wrapper: w?.clientHeight ?? -1,
        wrapperParent: p?.clientHeight ?? -1,
        viewport: window.innerHeight,
        column: col?.clientHeight ?? -1,
        columnMinHeight: colCss?.minHeight ?? '',
        scrollerHeight: scrollerCss?.height ?? '',
        scrollerPosition: scrollerCss?.position ?? '',
      };
    });

    // Printed so a failure carries the numbers rather than a screenshot.
    console.warn(`PLAIN_CHAIN ${JSON.stringify(chain)}`);
    expect(chain.plainPath, `plain path not rendering: ${JSON.stringify(chain)}`).toBe(true);
  });
});
