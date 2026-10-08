import { test, expect } from '@playwright/test';

test('saved connection is clear, failed replacement keeps it, and Forget removes only the connection', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any; w.keyStatus = { connected: true, saved: true, error: '' };
    localStorage.setItem('bebo-shortcuts', JSON.stringify(['Keep my shortcut']));
    w.bebo = { status: async () => ({ ...w.keyStatus }), onTalk: () => () => {}, onStopped: () => () => {},
      connect: async () => { throw Error('That API key was not accepted.'); },
      forgetKey: async () => { w.keyStatus = { connected: false, saved: false, error: '' }; return { ...w.keyStatus }; },
      setAvatarState: async () => {} };
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await expect(page.getByText('Saved securely · reconnects after restart')).toBeVisible();
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.getByLabel('Replace OpenAI API key')).toHaveValue('');
  await page.getByLabel('Replace OpenAI API key').fill('fixture-invalid-key');
  await page.getByRole('button', { name: 'Update saved key' }).click();
  await expect(page.getByRole('alert')).toContainText('not accepted');
  await expect(page.getByText('Your Luna key is saved on this device.')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('fixture-invalid-key');
  await page.getByRole('button', { name: 'Forget saved key and disconnect' }).click();
  await expect(page.getByLabel('OpenAI API key', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Forget saved key and disconnect' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('bebo-shortcuts'))).toContain('Keep my shortcut');
});
