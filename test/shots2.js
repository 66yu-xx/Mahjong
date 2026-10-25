const { chromium } = require('/workspace/tools/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file:///workspace/mahjong/index.html');
  await page.click('[data-mode="ai"]');
  await page.waitForTimeout(600);
  // 1) 听牌提示：设定手牌
  await page.evaluate(() => {
    const g = window.__mj.game;
    g.players[0].hand = [0,1,2, 3,4,5, 6,7, 13,13, 9,9,9, 11];
    g.drawn = 11; g.phase = 'act'; g.cur = 0; g.canTsumo = true;
    window.__mj.render();
  });
  const tiles = await page.$$('#hand0 .tile');
  await tiles[tiles.length - 1].click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/workspace/mahjong/shots/03-ting-hint.png' });
  // 2) 吃碰选择：对方打出 二万
  await page.evaluate(() => {
    const g = window.__mj.game;
    g.players[0].hand = [0,1,1,2,3,3,4, 13,13, 9,9,9, 14];
    g.players[1].hand.push(g.players[1].hand.length ? 1 : 1);
    g.players[1].hand.pop();
    g.players[1].discards.push(1, 2, 1);
    g.lastDiscard = { tile: 1, from: 1, idx: g.players[1].discards.length - 1, claimed: false };
    g.phase = 'claim'; g.drawn = null;
    window.__mj.render();
  });
  await page.waitForTimeout(300);
  const chi = await page.$('#actions .abtn.chi'); if (chi) await chi.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/workspace/mahjong/shots/04-claim.png' });
  // 3) 构造自摸结算：小三元
  await page.evaluate(() => {
    const g = window.__mj.game;
    g.players[0].hand = [13,13,13,14,14,14,15,15,0,1,2,6,7,8];
    g.players[0].melds = [];
    g.drawn = 8; g.phase = 'act'; g.cur = 0; g.canTsumo = true;
    window.__mj.render();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/workspace/mahjong/shots/13-tsumo-button.png' });
  await page.click('#actions .abtn.hu');
  await page.waitForSelector('#settle.show');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/workspace/mahjong/shots/14-settlement-xiaosanyuan.png' });
  // 小窗口缩放
  await page.setViewportSize({ width: 1000, height: 660 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/workspace/mahjong/shots/15-small-window.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });
