import { test, expect } from '@playwright/test';

test('original character animates, reacts, and survives navigation without duplicate renderers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const avatar = page.locator('.bebo-avatar');
  await expect(avatar.locator('svg')).toHaveCount(1);
  await expect(avatar).toHaveAttribute('data-motion', 'full');
  const first = await avatar.locator('svg').innerHTML();
  await expect.poll(() => avatar.locator('svg').innerHTML()).not.toBe(first);
  await page.getByRole('button', { name: 'Boop', exact: true }).click();
  await expect(avatar).toHaveAttribute('data-mood', 'boop');
  await expect(page.locator('.avatar-readout')).toContainText('Hey! That tickles.');
  await page.getByRole('button', { name: 'Dance', exact: true }).click();
  await expect(avatar).toHaveAttribute('data-mood', 'dance');
  await expect(page.locator('.task-panel')).toHaveCount(0);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Personalize', exact: true }).click();
    await page.getByRole('button', { name: 'Preview thinking', exact: true }).click();
    await expect(avatar).toHaveAttribute('data-mood', 'thinking');
    await expect(avatar.locator('svg')).toHaveCount(1);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
  }
  await expect(avatar.locator('svg')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('calm mode stops the engine, persists, and still shows distinct expressions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Personalize', exact: true }).click();
  await page.getByRole('button', { name: 'Calm', exact: true }).click();
  const avatar = page.locator('.bebo-avatar');
  await expect(avatar).toHaveAttribute('data-motion', 'still');
  await page.getByRole('button', { name: 'Preview listening', exact: true }).click();
  await page.mouse.move(0, 0);
  const listening = await avatar.locator('svg').innerHTML();
  await page.waitForTimeout(300);
  expect(await avatar.locator('svg').innerHTML()).toBe(listening);
  await page.getByRole('button', { name: 'Preview a tiny breather', exact: true }).click();
  await expect(avatar).toHaveAttribute('data-mood', 'sleeping');
  expect(await avatar.locator('svg').innerHTML()).not.toBe(listening);
  await page.reload();
  await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-motion', 'still');
  await page.getByRole('button', { name: 'Personalize', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calm', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('live requests drive listening, thinking, approval, working, completion and failure', async ({ page }) => {
  // A controllable native bridge exercises the UI lifecycle without a microphone,
  // provider request, or desktop input. Native IPC is checked separately.
  await page.addInitScript(() => {
    const w = window as any;
    localStorage.setItem('bebo-sound', 'false');
    w.bridgeCalls = [];
    const deferred = (name: string) => new Promise((resolve, reject) => { w[name] = { resolve, reject }; });
    w.bebo = {
      status: async () => ({ connected: true }),
      listen: () => deferred('voice'), plan: () => deferred('plan'), approve: () => deferred('action'),
      stop: async () => {}, onTalk: () => () => {}, onStopped: () => () => {},
      setAvatarState: async (mood: string) => { w.bridgeCalls.push(mood); },
    };
  });
  await page.goto('/');
  const avatar = page.locator('.bebo-avatar');
  await page.getByRole('button', { name: 'Talk to Bebo', exact: true }).click();
  await expect(avatar).toHaveAttribute('data-mood', 'listening');
  await page.evaluate(() => (window as any).voice.resolve('Open Calculator'));
  await expect(avatar).toHaveAttribute('data-mood', 'thinking');
  await expect(page.getByRole('button', { name: 'Boop', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).plan.resolve({ id: 'one', step: 1, action: { type: 'click', x: 50, y: 50, text: '', reason: 'Open Calculator' } }));
  await expect(avatar).toHaveAttribute('data-mood', 'approval');
  await page.getByRole('button', { name: 'Allow this step', exact: true }).click();
  await expect(avatar).toHaveAttribute('data-mood', 'working');
  await page.evaluate(() => (window as any).action.resolve({ id: 'two', step: 2, action: { type: 'done', reason: 'Test completed', text: '', x: 0, y: 0 } }));
  await expect(avatar).toHaveAttribute('data-mood', 'success');
  await page.getByRole('button', { name: 'Stop task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Ask Bebo' }).fill('Another request');
  await page.getByRole('button', { name: 'Send request' }).click();
  await page.evaluate(() => (window as any).plan.reject(new Error('Test connection failure')));
  await expect(avatar).toHaveAttribute('data-mood', 'help');
  expect(await page.evaluate(() => (window as any).bridgeCalls)).toEqual(expect.arrayContaining(['listening', 'thinking', 'approval', 'working', 'success', 'help']));
});
