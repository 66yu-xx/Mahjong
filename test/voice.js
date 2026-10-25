// 用假的 speechSynthesis 验证：选声音优先级、队列/打断、断网回退、静音、设置界面
const { chromium } = require('/workspace/tools/node_modules/playwright-core');
const mock = (online) => {
  const voices = [
    { name: 'Microsoft Kangkang - Chinese (Simplified, PRC)', lang: 'zh-CN', localService: true },
    { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true },
    { name: 'Microsoft Huihui - Chinese (Simplified, PRC)', lang: 'zh-CN', localService: true },
    { name: 'Microsoft Yaoyao - Chinese (Simplified, PRC)', lang: 'zh-CN', localService: true },
    { name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', lang: 'zh-CN', localService: false },
    { name: 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)', lang: 'zh-CN', localService: false },
  ];
  const spoken = []; let cur = null, timer = null;
  const ss = {
    speaking: false, pending: false, _l: {},
    getVoices: () => voices,
    addEventListener(t, f) { this._l[t] = f; },
    speak(u) {
      if (cur) { spoken.push({ text: u.text, voice: u.voice && u.voice.name, queuedBehind: cur.text }); }
      cur = u; this.speaking = true;
      const rec = { text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, rate: u.rate, volume: u.volume, t: Date.now() };
      spoken.push(rec);
      if (!online && !u.voice.localService) { setTimeout(() => { cur = null; ss.speaking = false; u.onerror && u.onerror({ error: 'network' }); }, 30); return; }
      timer = setTimeout(() => { if (cur === u) { cur = null; ss.speaking = false; u.onend && u.onend({}); } }, 350 + u.text.length * 120);
    },
    cancel() { if (cur) { const u = cur; cur = null; this.speaking = false; clearTimeout(timer); u.onerror && u.onerror({ error: 'interrupted' }); spoken.push({ cancel: true }); } },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true, writable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.__spoken = spoken;
};
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  for (const online of [true, false]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await p.addInitScript(mock, online);
    await p.goto('file:///workspace/mahjong/index.html');
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.click('.start-opts [data-key="speed"] [data-v="0.55"]');
    await p.click('[data-mode="ai"]');
    // 玩 2 局（人类一方用 AI 策略）
    const res = await p.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const M = window.__mj; let rounds = 0; const t0 = Date.now();
      while (rounds < 2 && Date.now() - t0 < 60000) {
        const g = M.game;
        if (document.getElementById('settle').classList.contains('show')) { rounds++; await sleep(1500); M.nextRound(); continue; }
        if (g.phase !== 'over' && g.pending() === 0 && (g.phase === 'act' || document.querySelectorAll('#actions .abtn').length)) M.act(0, window.MJEngine.aiDecide(g, 0));
        await sleep(40);
      }
      const sp = window.__spoken.filter(x => !x.cancel && !x.queuedBehind);
      return { rounds, n: sp.length, voices: [...new Set(sp.map(x => x.voice))], sample: sp.slice(0, 14).map(x => x.text), calls: sp.filter(x => /碰|吃|杠|听|胡|自摸|流局/.test(x.text)).map(x => x.text),
        pitch: sp[0] && sp[0].pitch, rate: sp[0] && sp[0].rate, vol: sp[0] && sp[0].volume, overlaps: window.__spoken.filter(x => x.queuedBehind).length, log: M.voice.log.length };
    });
    console.log(online ? 'ONLINE' : 'OFFLINE', JSON.stringify(res));
    // 设置面板
    await p.evaluate(() => { document.getElementById('settle').classList.remove('show'); });
    await p.click('#btnSettings'); await p.waitForTimeout(300);
    const opts = await p.$$eval('#voiceSel option', os => os.map(o => o.textContent));
    console.log('select options:', JSON.stringify(opts));
    if (online) {
      await p.screenshot({ path: '/workspace/mahjong/shots/16-settings-voice.png' });
      await p.selectOption('#voiceSel', 'Microsoft Huihui - Chinese (Simplified, PRC)');
      await p.waitForTimeout(100);
      const last = await p.evaluate(() => window.__spoken.filter(x => !x.cancel).slice(-1)[0]);
      console.log('after choosing Huihui, test phrase:', JSON.stringify(last));
      // 静音
      await p.click('[data-close="settings"]');
      await p.click('#btnSound');
      const before = await p.evaluate(() => window.__spoken.length);
      await p.evaluate(async () => { const M = window.__mj; M.voice.say('三万', 0); });
      const after = await p.evaluate(() => window.__spoken.length);
      console.log('muted: spoke', after - before, 'utterances');
      await p.click('#btnSound');
    }
    await p.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})();
