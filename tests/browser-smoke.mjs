import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = process.env.TEST_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await server?.listen();
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 375, height: 667 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 760, hasTouch: viewport.width < 760 });
    const page = await context.newPage();
    if (viewport.width < 760) await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = query => query === '(pointer: coarse)'
        ? { matches: true, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
        : nativeMatchMedia(query);
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/kakasong/');
    await page.locator('#world').waitFor({ state: 'attached' });
    if (!await page.locator('.legal-cell').count()) {
      for (let h = 0; h < 3 && !await page.locator('.legal-cell').count(); h++) {
        await page.locator(`[data-hand="${h}"]`).click();
        for (let r = 0; r < 4 && !await page.locator('.legal-cell').count(); r++) await page.locator('#rotate').click();
      }
    }
    assert.ok(await page.locator('.legal-cell').count(), `initial placement is available at ${viewport.width}px; errors: ${errors.join('; ')}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page overflow');
    if (viewport.width < 760) {
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), viewport.height, `no vertical document scroll at ${viewport.width}×${viewport.height}`);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
      const legalBox = await page.locator('.legal-cell').first().boundingBox();
      await page.mouse.move(legalBox.x + legalBox.width / 2, legalBox.y + legalBox.height / 2);
      assert.equal(await page.locator('#touch-preview').isVisible(), true, 'touch preview follows pointer onto a legal placement');
      assert.equal(await page.locator('#placement-hint').innerText(), '松开手指放置');
      assert.equal(await page.locator('.board-tile').count(), 1, 'preview does not place the tile while dragging');
      await page.locator('#touch-preview').evaluate(el => el.click());
      assert.equal(await page.locator('.board-tile').count(), 2, 'tapping the preview places the tile');
      assert.ok(await page.locator('.workspace').evaluate(el => el.classList.contains('claiming')));
      await page.locator('#undo').click();
    }
    await page.locator('#rotate').click();
    if (!await page.locator('.legal-cell').count()) {
      for (let r = 0; r < 3 && !await page.locator('.legal-cell').count(); r++) await page.locator('#rotate').click();
    }
    if (!await page.locator('.legal-cell').count()) {
      for (let h = 0; h < 3 && !await page.locator('.legal-cell').count(); h++) {
        await page.locator(`[data-hand="${h}"]`).click();
        for (let r = 0; r < 4 && !await page.locator('.legal-cell').count(); r++) await page.locator('#rotate').click();
      }
    }
    if (viewport.width < 760) await page.locator('.legal-cell').first().evaluate(el => el.click());
    else await page.locator('.legal-cell').first().click();
    await page.locator('#undo').click();
    assert.equal(await page.locator('.board-tile').count(), 1);
    if (viewport.width < 760) await page.locator('.legal-cell').first().evaluate(el => el.click());
    else await page.locator('.legal-cell').first().click();
    if (await page.locator('[data-claim]').count()) await page.locator('[data-claim]').first().click();
    if (viewport.width >= 760) {
      await page.reload();
      await page.locator('#end-turn').click();
      assert.equal(await page.locator('.board-tile').count(), 2);
      await page.locator('#help').click();
      await page.getByRole('dialog').waitFor();
      await page.locator('.modal-close').click();
    }
    if (viewport.width < 760) {
      assert.ok(await page.locator('.workspace').evaluate(el => el.classList.contains('claiming')));
      assert.ok((await page.locator('.claim-button').first().boundingBox())?.height >= 40, 'mobile claim buttons have touch-sized targets');
      await page.locator('#undo').click();
      await page.locator('.legal-cell').first().evaluate(el => el.click());
      if (await page.locator('[data-claim]').count()) await page.locator('[data-claim]').first().click();
      await page.locator('#end-turn').click();
      assert.equal(await page.locator('.board-tile').count(), 2);
      await page.locator('#help').click();
      await page.getByRole('dialog').waitFor();
      await page.locator('.modal-close').click();
      await page.locator('#goals').evaluate(button => button.click());
      await page.getByRole('dialog').waitFor();
      assert.match(await page.locator('.modal').innerText(), /原野小愿望/);
      await page.locator('.modal-close').click();
    }
    await page.locator('#zoom-out').click();
    await page.locator('#recenter').click();
    // Exercise real pointer dragging on the board.
    const rect = await page.locator('#viewport').boundingBox();
    const before = await page.locator('#world').getAttribute('style');
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 35, rect.y + rect.height / 2 + 25, { steps: 8 });
    await page.mouse.up();
    assert.notEqual(await page.locator('#world').getAttribute('style'), before);
    await page.locator('#new-game').click();
    await page.locator('#confirm-restart').click();
    assert.equal(await page.locator('.board-tile').count(), 1);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}×${viewport.height}: placement, undo, claim, save recovery, turn, modal, zoom, drag, restart`);
    await context.close();
  }
} finally {
  await browser.close();
  await server?.close();
}
