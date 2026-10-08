import { test, expect } from '@playwright/test';

test('reloading the dashboard restores the pending approval from the desktop', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).bebo = {
      status: async () => ({ connected: true }), onTalk: () => () => {}, onStopped: () => () => {}, setAvatarState: async () => {},
      taskState: async () => ({ prompt: 'Open my document', source: 'desktop', busy: false, acting: false, listening: false, hasError: false, message: '', approvalExpires: Date.now() + 100000,
        pending: { id: 'restore-approval', step: 3, action: { type: 'tool', reason: 'Review the chosen document before opening it', text: 'C:\\Documents\\note.txt', x: 0, y: 0 } } }),
      onTaskState: () => () => {},
    };
  });
  await page.goto('/');
  await expect(page.getByText('Review the chosen document before opening it', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Review the chosen document before opening it', { exact: true })).toBeVisible();
});

test('damaged preferences and unavailable storage do not prevent the dashboard opening', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('bebo-history', '{"broken":true}');
    localStorage.setItem('bebo-shortcuts', '[null,42]');
    localStorage.setItem('bebo-avatar-edition', '{"invalid":true}');
    Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
  });
  await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); expect(errors).toEqual([]);
});

test('a registered phone still reconnects when storage is full', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bebo-phone-session', 'existing-phone-registration');
    Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
  });
  await page.route('**/api/state', route => {
    expect(route.request().headers().authorization).toBe('Bearer existing-phone-registration');
    return route.fulfill({ json: { connected: true, prompt: '', mood: 'idle', color: 'ember', energy: 'calm', busy: false, acting: false, pending: null, message: '', hasError: false } });
  });
  await page.goto('/?phone=1');
  await expect(page.getByText('Desktop connected', { exact: true })).toBeVisible();
});

test('an interrupted phone command releases the controls without retrying the operation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bebo-phone-session', 'registered');
    const timeout = AbortSignal.timeout.bind(AbortSignal); AbortSignal.timeout = ms => timeout(ms === 90000 ? 100 : ms);
    const originalFetch = window.fetch.bind(window); (window as any).controlCalls = 0;
    window.fetch = (input, init) => {
      if (String(input) !== '/api/control') return originalFetch(input, init);
      (window as any).controlCalls++;
      return new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }));
    };
  });
  await page.route('**/api/state', route => route.fulfill({ json: { connected: true, prompt: '', mood: 'idle', color: 'ember', energy: 'calm', busy: false, acting: false, pending: null, message: '', hasError: false } }));
  await page.goto('/?phone=1'); await page.getByRole('button', { name: 'Type instead' }).click();
  await page.getByLabel('A little request for your desktop').fill('A request with an interrupted reply.');
  await page.getByRole('button', { name: 'Send phone request' }).click();
  await expect(page.getByRole('alert')).toContainText('Check Bebo’s status before sending the request again');
  await expect(page.getByRole('button', { name: 'Send phone request' })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).controlCalls)).toBe(1);
});
