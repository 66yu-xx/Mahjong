const { chromium } = require('/workspace/tools/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  for (const mode of ['ai', 'hotseat']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    p.on('pageerror', e => errors.push(mode + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(mode + ' console: ' + m.text()); });
    await p.goto('file:///workspace/mahjong/index.html');
    await p.evaluate(() => { localStorage.clear(); });
    await p.click('.start-opts [data-key="speed"] [data-v="0.55"]');
    await p.click('.start-opts [data-key="flowers"] [data-v="1"]');
    await p.click(`[data-mode="${mode}"]`);
    const res = await p.evaluate(async (mode) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const M = window.__mj; let rounds = 0, wins = 0, steps = 0;
      const t0 = Date.now();
      while (rounds < 12 && Date.now() - t0 < 150000) {
        const g = M.game;
        if (document.getElementById('settle').classList.contains('show')) {
          rounds++; if (g.result.type === 'win') wins++; M.nextRound(); await sleep(50); continue;
        }
        if (document.getElementById('handoff').classList.contains('show')) { document.getElementById('handoffBtn').click(); await sleep(20); continue; }
        if (g.phase !== 'over') {
          const pd = g.pending();
          const human = mode === 'hotseat' || pd === 0;
          const btns = document.querySelectorAll('#actions .abtn').length;
          if (human && (g.phase === 'act' || btns > 0)) {
            const a = window.MJEngine.aiDecide(g, pd);
            M.act(pd, a); steps++;
          }
        }
        await sleep(30);
      }
      return { rounds, wins, steps, scores: M.game.scores };
    }, mode);
    console.log(mode, JSON.stringify(res));
    await p.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
