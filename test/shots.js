const { chromium } = require('/workspace/tools/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const url = 'file:///workspace/mahjong/index.html';
  await page.goto(url);
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/workspace/mahjong/shots/01-start.png' });
  await page.click('[data-mode="ai"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/workspace/mahjong/shots/02-table-start.png' });
  // 人类玩几手：每次轮到自己就选第一张“听”或最后一张出
  for (let k = 0; k < 9; k++) {
    await page.waitForFunction(() => { const g = window.__mj.game; return g.phase === 'over' || (g.pending() === 0); }, null, { timeout: 15000 });
    const st = await page.evaluate(() => { const g = window.__mj.game; return { phase: g.phase, pend: g.pending() }; });
    if (st.phase === 'over') break;
    if (st.phase === 'act') {
      const tiles = await page.$$('#hand0 .tile');
      const t = tiles[tiles.length - 1];
      await t.click(); await page.waitForTimeout(150);
      if (k === 5) await page.screenshot({ path: '/workspace/mahjong/shots/03-selected.png' });
      await t.click();
    } else {
      await page.waitForTimeout(500);
      const btns = await page.$$('#actions .abtn');
      if (!btns.length) continue;
      if (k === 4 || k === 6) await page.screenshot({ path: '/workspace/mahjong/shots/04-claim.png' });
      await btns[btns.length - 1].click({ force: true });
    }
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: '/workspace/mahjong/shots/05-midgame.png' });
  await page.click('#btnHelp'); await page.waitForTimeout(400);
  await page.screenshot({ path: '/workspace/mahjong/shots/06-help.png' });
  await page.click('[data-close="help"]');
  await page.click('#btnSettings'); await page.waitForTimeout(400);
  await page.screenshot({ path: '/workspace/mahjong/shots/07-settings.png' });
  await page.click('[data-close="settings"]');

  // 自动对局直到出现结算
  const p2 = await ctx.newPage();
  p2.on('console', m => { if (m.type() === 'error') errors.push('auto: ' + m.text()); });
  p2.on('pageerror', e => errors.push('auto pageerror: ' + e.message));
  let got = false;
  await p2.goto(url + '?auto=1');
  for (let i = 0; i < 12 && !got; i++) {
    await p2.waitForSelector('#settle.show', { timeout: 60000 });
    const isWin = await p2.evaluate(() => window.__mj.game.result.type === 'win' && window.__mj.game.result.fan.fans.length >= 4);
    if (isWin) {
      await p2.waitForTimeout(1200);
      await p2.screenshot({ path: '/workspace/mahjong/shots/08-settlement.png' });
      await p2.click('#btnSettleView'); await p2.waitForTimeout(300);
      await p2.screenshot({ path: '/workspace/mahjong/shots/09-table-revealed.png' });
      got = true;
    } else { await p2.evaluate(() => window.__mj.nextRound()); }
  }
  // 中局自动截图
  await p2.evaluate(() => window.__mj.nextRound());
  await p2.waitForTimeout(4500);
  await p2.screenshot({ path: '/workspace/mahjong/shots/10-auto-mid.png' });
  // 双人同屏
  const p3 = await ctx.newPage();
  p3.on('pageerror', e => errors.push('hotseat pageerror: ' + e.message));
  await p3.goto(url); await p3.waitForTimeout(300);
  await p3.click('[data-mode="hotseat"]'); await p3.waitForTimeout(500);
  const tiles = await p3.$$('#hand0 .tile'); await tiles[0].click(); await tiles[0].click();
  await p3.waitForSelector('#handoff.show', { timeout: 5000 });
  await p3.waitForTimeout(400);
  await p3.screenshot({ path: '/workspace/mahjong/shots/11-hotseat-handoff.png' });
  await p3.click('#handoffBtn'); await p3.waitForTimeout(500);
  await p3.screenshot({ path: '/workspace/mahjong/shots/12-hotseat-p2.png' });
  console.log('settlement captured:', got);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });
