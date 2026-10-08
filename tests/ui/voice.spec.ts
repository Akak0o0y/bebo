import { test, expect } from '@playwright/test';

test('stopping speech discards late generated audio, and voice choice persists', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any; w.stops = 0; w.audioPlayed = 0;
    w.bebo = { status: async () => ({connected:false}), onTalk: () => () => {}, onStopped: () => () => {}, stop: async () => {},
      voiceGenerate: () => new Promise(resolve => { w.finishVoice = resolve; }), voiceStop: async () => { w.stops++; } };
    w.Audio = class { play() { w.audioPlayed++; return Promise.resolve(); } pause() {} };
  });
  await page.goto('/'); await page.getByRole('button', {name:'Personalize',exact:true}).click();
  await page.getByLabel('A voice of his own').selectOption('af_heart');
  await page.getByRole('button', {name:'Hear Bebo'}).click();
  await expect(page.getByRole('button',{name:'Preparing…'})).toBeVisible();
  await page.getByRole('button',{name:'Preparing…'}).click();
  await page.evaluate(() => (window as any).finishVoice({audio:'UklGRg=='}));
  expect(await page.evaluate(() => (window as any).audioPlayed)).toBe(0);
  expect(await page.evaluate(() => (window as any).stops)).toBe(1);
  await page.reload(); await page.getByRole('button',{name:'Personalize',exact:true}).click();
  await expect(page.getByLabel('A voice of his own')).toHaveValue('af_heart');
});

test('speaking follows actual playback and a new task interrupts the voice', async ({page}) => {
  await page.addInitScript(() => {
    const w=window as any; w.paused=0;
    w.bebo={status:async()=>({connected:true}),onTalk:()=>()=>{},onStopped:()=>()=>{},stop:async()=>{},voiceGenerate:async()=>({audio:'UklGRg=='}),voiceStop:async()=>{},plan:()=>new Promise(()=>{})};
    w.Audio=class {onplaying:any;onended:any;play(){this.onplaying?.();return Promise.resolve();}pause(){w.paused++;}};
  });
  await page.goto('/'); await page.getByRole('button',{name:'Personalize',exact:true}).click();
  await page.getByRole('button',{name:'Hear Bebo'}).click();
  await expect(page.getByRole('button',{name:'Stop voice'})).toBeVisible();
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood','speaking');
  await page.getByRole('textbox',{name:'Ask Bebo'}).fill('Open Calculator');
  await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.locator('.bebo-avatar')).toHaveAttribute('data-mood','thinking');
  expect(await page.evaluate(()=>(window as any).paused)).toBe(1);
});
