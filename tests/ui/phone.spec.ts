import { test, expect, type Page } from '@playwright/test';

const idle = { connected: true, mood: 'idle', color: 'ember', energy: 'lively', busy: false, acting: false, prompt: '', pending: null, message: '', hasError: false, approvalExpires: null, sessionExpires: Date.now() + 3600000 };
async function session(page: Page) {
  await page.addInitScript(() => { sessionStorage.setItem('bebo-phone-session', 'test-session'); });
}

test('unpaired phone is honest and fits a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?phone=1');
  await expect(page.getByText('Not paired', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Let’s meet your desktop.' })).toBeVisible();
  await page.getByRole('button', { name: 'Hold Bebo to speak' }).click();
  await expect(page.locator('.bebo-avatar')).not.toHaveAttribute('data-mood', 'listening');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/phone-unpaired.png', fullPage: true });
});

test('QR invitation waits for desktop confirmation and survives strict effect replay', async ({ page }) => {
  let pairRequests = 0, approved = false;
  await page.route('**/api/pair', async route => { pairRequests++; expect(route.request().postDataJSON().token).toBe('test-invitation'); await route.fulfill({ json: { ticket: 'ticket', code: '123456' } }); });
  await page.route('**/api/pair-status', route => route.fulfill({ json: approved ? { status: 'approved', token: 'session' } : { status: 'pending' } }));
  await page.route('**/api/state', route => route.fulfill({ json: idle }));
  await page.goto('/?phone=1#pair=test-invitation');
  await expect(page.getByText('123456', { exact: true })).toBeVisible();
  await expect(page.getByText('Not paired', { exact: true })).toBeVisible();
  expect(page.url()).not.toContain('test-invitation');
  expect(pairRequests).toBe(1);
  approved = true;
  await expect(page.getByText('Desktop connected', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('bebo-phone-session'))).toBe('session');
  await page.reload(); await expect(page.getByText('Desktop connected', { exact: true })).toBeVisible(); expect(pairRequests).toBe(1);
});

test('hold-to-speak sends the phone transcript once and approvals drive desktop progress', async ({ page }) => {
  let current: any = { ...idle }, calls: any[] = [];
  await session(page);
  await page.addInitScript(() => {
    class Speech {
      onresult: any; onend: any; onerror: any; lang = ''; continuous = false; interimResults = false;
      start() { (window as any).phoneSpeech = this; }
      stop() { this.onend?.(); }
      abort() { this.onerror?.({ error: 'aborted' }); this.onend?.(); }
    }
    (window as any).SpeechRecognition = Speech;
  });
  await page.route('**/api/state', route => route.fulfill({ json: current }));
  await page.route('**/api/control', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (body.op === 'request') current = { ...idle, mood: 'approval', prompt: body.text, pending: { id: 'step-one', step: 1, action: { type: 'click', x: 200, y: 400, text: '', reason: 'Open the visible Calculator shortcut.' } }, approvalExpires: Date.now() + 120000 };
    if (body.op === 'approve') current = { ...idle, mood: 'success', pending: { id: 'step-two', step: 2, action: { type: 'done', reason: 'Calculator is open.', text: '', x: 0, y: 0 } } };
    await route.fulfill({ json: { accepted: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?phone=1');
  await expect(page.getByText('Desktop connected', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/phone-connected.png', fullPage: true });
  await page.getByRole('button', { name: 'Hold Bebo to speak' }).hover(); await page.mouse.down();
  await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood', 'listening');
  await page.evaluate(() => { const s = (window as any).phoneSpeech; const result: any = [{ transcript: 'Open Calculator' }]; result.isFinal = true; s.onresult({ results: [result] }); });
  expect(calls).toHaveLength(0); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Allow this step' })).toBeVisible();
  expect(calls).toHaveLength(1); expect(calls[0].text).toBe('Open Calculator');
  await page.screenshot({ path: 'artifacts/phone-approval.png', fullPage: true });
  await page.getByRole('button', { name: 'Allow this step' }).click();
  await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood', 'success');
  expect(calls).toHaveLength(2); expect(calls[1].stepId).toBe('step-one');
  // Some speech implementations can deliver a late event after completion.
  await page.evaluate(() => (window as any).phoneSpeech.onend());
  await page.waitForTimeout(150);
  expect(calls).toHaveLength(2);
});

test('Home Screen controller can pair by code without the original QR fragment', async ({ page }) => {
  let approved = false;
  await page.route('**/api/pair', async route => {
    expect(route.request().postDataJSON().token).toBe('ABCDE-12345');
    await route.fulfill({ json: { ticket: 'manual-ticket', code: '654321' } });
  });
  await page.route('**/api/pair-status', route => route.fulfill({ json: approved ? { status: 'approved', token: 'manual-session' } : { status: 'pending' } }));
  await page.route('**/api/state', route => route.fulfill({ json: idle }));
  await page.goto('/?phone=1');
  await expect(page.getByRole('button', { name: 'Pair', exact: true })).toBeDisabled();
  await page.getByLabel('Or enter the code shown on your desktop').fill('abcde-12345');
  await page.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(page.getByText('654321', { exact: true })).toBeVisible();
  await expect(page.getByText('Not paired', { exact: true })).toBeVisible();
  approved = true;
  await expect(page.getByText('Desktop connected', { exact: true })).toBeVisible();
});

test('stop wins over a delayed command response without displaying stale errors', async ({ page }) => {
  await session(page);
  let releaseRequest: (() => void) | undefined;
  let requests = 0;
  await page.route('**/api/state', route => route.fulfill({ json: idle }));
  await page.route('**/api/control', async route => {
    if (route.request().postDataJSON().op === 'request') {
      requests++;
      await new Promise<void>(resolve => { releaseRequest = resolve; });
      await route.fulfill({ status: 409, json: { error: 'Old request stopped.' } });
    } else await route.fulfill({ json: { accepted: true } });
  });
  await page.goto('/?phone=1');
  await page.getByRole('button', { name: 'Type instead' }).click();
  await page.getByLabel('A little request for your desktop').fill('Open Calculator');
  await page.getByRole('button', { name: 'Send phone request' }).click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Type instead' })).toBeEnabled();
  releaseRequest!();
  await page.waitForTimeout(150);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send phone request' })).toBeEnabled();
});

test('connection loss disables control; speech cancellation never submits a request', async ({ page }) => {
  let online = true, submitted = 0;
  await session(page);
  await page.addInitScript(() => {
    class Speech { onend: any; onerror: any; start() {} stop() { this.onend?.(); } abort() { this.onerror?.({ error: 'aborted' }); this.onend?.(); } }
    (window as any).SpeechRecognition = Speech;
  });
  await page.route('**/api/state', route => online ? route.fulfill({ json: idle }) : route.abort());
  await page.route('**/api/control', route => { if (route.request().postDataJSON().op === 'request') submitted++; return route.fulfill({ json: { accepted: true } }); });
  await page.goto('/?phone=1');
  await expect(page.getByText('Desktop connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hold Bebo to speak' }).evaluate(el=>el.click());
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(submitted).toBe(0);
  online = false;
  await expect(page.getByText('Reconnecting', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Type instead' })).toBeDisabled();
  await page.getByRole('button', { name: 'Hold Bebo to speak' }).click();
  await expect(page.locator('.bebo-avatar')).not.toHaveAttribute('data-mood', 'listening');
  expect(submitted).toBe(0);
});

test('phone plays the authenticated reply and supports Safari tap-to-play fallback', async ({ page }) => {
  await session(page);
  await page.addInitScript(() => {
    const w = window as any; w.voicePlays = 0;
    w.Audio = class { onplaying: any; pause() {} play() { if (++w.voicePlays === 1) return Promise.reject(new Error('Gesture required')); this.onplaying?.(); return Promise.resolve(); } };
  });
  await page.route('**/api/state', route => route.fulfill({ json: { ...idle, mood: 'success', pending: { id: 'reply', step: 2, action: { type: 'done', reason: 'Calculator is open.', text: '', x: 0, y: 0 } } } }));
  let voiceRequests = 0;
  await page.route('**/api/voice', route => {
    voiceRequests++;
    expect(route.request().headers().authorization).toBe('Bearer test-session');
    expect(route.request().postDataJSON()).toEqual({ stepId: 'reply', voice: 'am_puck' });
    return route.fulfill({ contentType: 'audio/wav', body: Buffer.from('RIFF') });
  });
  await page.goto('/?phone=1');
  await page.getByRole('button', { name: 'Hear reply' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).voicePlays)).toBe(1);
  await page.getByRole('button', { name: 'Hear reply' }).click();
  await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood', 'speaking');
  await page.getByRole('button', { name: 'Stop voice' }).click();
  await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood', 'success');
  expect(voiceRequests).toBe(1);
});
