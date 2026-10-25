const MJ = require('../js/core.js');
const E = require('../js/engine.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } }
const H = { E: 9, S: 10, W: 11, N: 12, Z: 13, F: 14, B: 15 };
function parse(s) {
  const out = []; let buf = [];
  for (const ch of s.replace(/\s+/g, '')) {
    if (/[1-9]/.test(ch)) buf.push(+ch - 1);
    else if (ch === 'm') { out.push(...buf); buf = []; }
    else if (H[ch] !== undefined) out.push(H[ch]);
  }
  return out;
}
function fan(handStr, win, opt = {}) {
  const hand = parse(handStr);
  const w = parse(win)[0];
  const melds = (opt.melds || []);
  const ctx = Object.assign({ hand: hand.concat([w]), melds, winTile: w, selfDraw: false, seatWind: 9, roundWind: 9,
    lastTile: false, afterKong: false, robKong: false, juezhang: false, flowers: 0 }, opt);
  ctx.hand = hand.concat([w]);
  return MJ.calcFan(ctx);
}
function names(r) { return r ? r.fans.map(f => f.name + (f.count > 1 ? 'x' + f.count : '')) : null; }
function has(r, n) { return r && r.fans.some(f => f.name === n); }
function show(label, r) { console.log(label.padEnd(14), r ? r.total + '番 ' + names(r).join(' ') : '不能和'); }

// ---- 和牌判定 ----
ok(MJ.isWin(MJ.counts(parse('123m456m789m111m99m')), 0), 'basic win');
ok(!MJ.isWin(MJ.counts(parse('123m456m789m111m98m')), 0), 'not win');
ok(MJ.isWin(MJ.counts(parse('1122m3344m5566m77m')), 0), 'seven pairs');
ok(MJ.isWin(MJ.counts(parse('1111m2222m3333m44m')), 0), 'seven pairs with quads (also std)');
ok(MJ.isWin(MJ.counts(parse('EESSWWNNZZFFBB')), 0), 'honor seven pairs');
ok(MJ.isWin(MJ.counts(parse('123m55m')), 3), 'win with 3 melds');
ok(JSON.stringify(MJ.getWaits(MJ.counts(parse('1112345678999m')), 0)) === JSON.stringify([0,1,2,3,4,5,6,7,8]), 'nine gates waits');
ok(MJ.shanten(MJ.counts(parse('123m456m789m111m9m')), 0) === 0, 'tenpai shanten 0');
ok(MJ.shanten(MJ.counts(parse('123m456m789m111m99m')), 0) === -1, 'complete shanten -1');
ok(MJ.shanten(MJ.counts(parse('1357m9m ESWNZFB')), 0) >= 4, 'bad hand shanten');

// ---- 番种 ----
let r;
r = fan('EEE SSS WWW NNN 1m', '1m', { selfDraw: true }); show('大四喜', r);
ok(has(r, '大四喜') && has(r, '四暗刻') && !has(r, '碰碰和') && !has(r, '三风刻') && !has(r, '幺九刻') && !has(r, '圈风刻'), '大四喜 exclusions');
r = fan('ZZZ FFF BBB 123m 5m', '5m'); show('大三元', r);
ok(has(r, '大三元') && !has(r, '箭刻') && !has(r, '双箭刻') && has(r, '混一色') && has(r, '单钓将'), '大三元');
r = fan('1112345678999m', '5m'); show('九莲宝灯', r);
ok(has(r, '九莲宝灯') && !has(r, '清一色') && !has(r, '门前清') && !has(r, '无字'), '九莲');
r = fan('1122334455667m', '7m'); show('连七对', r);
ok(has(r, '连七对') && !has(r, '七对') && !has(r, '清一色') && r.total >= 88, '连七对');
r = fan('1199m EESS ZZ FF B', 'B'); show('七对混幺九', r);
ok(has(r, '七对') && has(r, '混幺九') && has(r, '混一色') && !has(r, '单钓将') && !has(r, '门前清'), '七对 混幺九');
r = fan('EESSWWNNZZFFB', 'B'); show('字一色七对', r);
ok(has(r, '字一色') && has(r, '七对'), '字一色七对');
r = fan('123m456m789m EEE Z', 'Z'); show('清龙', r);
ok(has(r, '清龙') && has(r, '混一色') && has(r, '单钓将') && has(r, '圈风刻') && has(r, '门风刻') && !has(r, '老少副'), '清龙');
r = fan('123m123m123m789m 5m', '5m', { selfDraw: true }); show('一色三同顺', r);
ok(has(r, '一色三同顺') || has(r, '一色三节高'), '三同顺/三节高');
r = fan('111m222m333m789m 5m', '5m', { selfDraw: true }); show('111222333', r);
ok(has(r, '一色三节高') && has(r, '三暗刻'), 'prefer pungs for max fan');
r = fan('123m123m789m789m 5m', '5m'); show('一色双龙会', r);
ok(has(r, '一色双龙会') && !has(r, '清一色') && !has(r, '平和') && !has(r, '一般高'), '双龙会');
r = fan('123m234m345m456m 9m', '9m'); show('一色四步高', r);
ok(has(r, '一色四步高') && !has(r, '一色三步高'), '四步高');
r = fan('123m345m567m78m 99m', '9m'); show('平和边?', r);
r = fan('123m345m567m99m 78m', '6m'); show('平和', r);
ok(has(r, '平和') && has(r, '清一色') && !has(r, '无字') && has(r, '门前清'), '平和');
r = fan('12m 456m 789m EEE ZZ', '3m'); show('边张', r);
ok(has(r, '边张'), '边张 single wait');
r = fan('13m 456m 789m EEE ZZ', '2m'); show('坎张', r);
ok(has(r, '坎张'), '坎张');
r = fan('23m 456m 789m EEE ZZ', '1m'); show('两面', r);
ok(!has(r, '边张') && !has(r, '坎张'), 'two-sided no wait fan');
r = fan('234m345m456m66m78m', '6m'); show('断幺', r);
ok(has(r, '断幺') && !has(r, '无字'), '断幺');
r = fan('Z', 'Z', { melds: [
  { type: 'peng', tile: 9, tiles: [9,9,9] }, { type: 'peng', tile: 10, tiles: [10,10,10] },
  { type: 'chi', start: 0, tiles: [0,1,2] }, { type: 'mgang', tile: 8, tiles: [8,8,8,8] }] });
show('全求人', r);
ok(has(r, '全求人') && !has(r, '单钓将') && has(r, '明杠'), '全求人');
r = fan('123m 99m 5m', '5m'); ok(!r, 'non-winning shape with melds missing');
r = fan('456m 678m 9m', '9m', { selfDraw: true, afterKong: true, melds: [
  { type: 'agang', tile: 13, tiles: [13,13,13,13] }, { type: 'agang', tile: 14, tiles: [14,14,14,14] }] });
show('双暗杠杠开', r);
ok(has(r, '双暗杠') && has(r, '杠上开花') && !has(r, '自摸') && has(r, '双箭刻') && has(r, '不求人'), '双暗杠');
r = fan('123m456m789m11m 99m', '9m', { selfDraw: true, lastTile: true }); show('妙手回春', r);
ok(has(r, '妙手回春') && !has(r, '自摸'), '妙手回春');
r = fan('123m456m789m11m 99m', '9m', { lastTile: true, juezhang: true }); show('海底+绝张', r);
ok(has(r, '海底捞月') && has(r, '和绝张'), '海底捞月');
r = fan('123m456m789m11m 99m', '9m', { robKong: true, juezhang: true }); show('抢杠', r);
ok(has(r, '抢杠和') && !has(r, '和绝张'), '抢杠和');
r = fan('EEE SSS WWW 123m 5m', '5m'); show('三风刻', r);
ok(has(r, '三风刻') && !has(r, '幺九刻'), '三风刻');
r = fan('EEE SSS 123m NN WW', 'W'); show('小四喜', r);
ok(has(r, '小四喜'), '小四喜');
r = fan('ZZZ FFF 123m 456m B', 'B'); show('小三元?', r);
r = fan('ZZZ FFF 123m 456m 9m', '9m'); show('双箭刻', r);
ok(has(r, '双箭刻') && !has(r, '箭刻'), '双箭刻');
r = fan('111m 999m EEE WWW S', 'S'); show('碰碰混幺九', r);
ok(has(r, '混幺九') && !has(r, '碰碰和') && !has(r, '幺九刻'), '混幺九');
r = fan('678m678m678m789m9m', '9m', { selfDraw: true }); show('大于五', r);
ok(has(r, '大于五') && !has(r, '无字'), '大于五');
r = fan('123m123m234m234m1m', '1m'); show('小于五四归一', r);
ok(has(r, '小于五'), '小于五');

// 引擎场景：抢杠/加杠流程
(function () {
  const g = new E.Game({ rng: mulberry(7) });
  g.newRound();
  ok(g.players[g.dealer].hand.length === 14 && g.players[1 - g.dealer].hand.length === 13, 'deal sizes');
})();

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function checkConservation(g) {
  let n = g.wall.length;
  g.players.forEach(pl => { n += pl.hand.length + pl.discards.length + pl.flowers.length; pl.melds.forEach(m => n += m.tiles.length); });
  if (g.rob) n += 1;
  return n === g.totalTiles;
}
function simulate(rounds, opts, policy) {
  const g = new E.Game(Object.assign({ rng: mulberry(opts.seed || 1) }, opts));
  const stats = { wins: 0, draws: 0, tsumo: 0, ron: 0, fanTotal: 0, fanNames: {}, actions: {}, maxFan: 0, steps: 0 };
  for (let i = 0; i < rounds; i++) {
    g.newRound();
    let guard = 0;
    while (g.phase !== 'over') {
      if (++guard > 2000) throw new Error('infinite loop');
      const p = g.pending();
      const a = policy(g, p);
      stats.actions[a.type] = (stats.actions[a.type] || 0) + 1;
      g.apply(p, a);
      stats.steps++;
      if (!checkConservation(g)) throw new Error('tile conservation broken after ' + a.type);
      for (const pl of g.players) {
        const need = pl.hand.length + pl.melds.length * 3;
        if (need !== 13 && need !== 14) throw new Error('bad hand size ' + need);
      }
    }
    const r = g.result;
    if (r.type === 'draw') stats.draws++;
    else {
      stats.wins++; r.selfDraw ? stats.tsumo++ : stats.ron++;
      stats.fanTotal += r.fan.total; stats.maxFan = Math.max(stats.maxFan, r.fan.total);
      r.fan.fans.forEach(f => stats.fanNames[f.name] = (stats.fanNames[f.name] || 0) + 1);
      if (r.fan.totalNoFlower < g.opts.minFan) throw new Error('won below min fan');
    }
  }
  if (g.scores[0] + g.scores[1] !== 0) throw new Error('scores not zero-sum');
  stats.scores = g.scores.slice();
  return stats;
}
const randomPolicy = (rng) => (g, p) => {
  const acts = g.actions(p);
  const w = acts.find(a => a.type === 'tsumo' || a.type === 'ron');
  if (w && rng() < 0.9) return w;
  const special = acts.filter(a => !['discard', 'pass'].includes(a.type) && a.type !== 'tsumo' && a.type !== 'ron');
  if (special.length && rng() < 0.6) return special[Math.floor(rng() * special.length)];
  const base = acts.filter(a => a.type === 'discard' || a.type === 'pass');
  return base[Math.floor(rng() * base.length)];
};

const t0 = Date.now();
let st;
try {
  st = simulate(200, { seed: 11, minFan: 1 }, E.aiDecide);
  console.log('\nAI vs AI 200局 (起和1番):', JSON.stringify({ wins: st.wins, draws: st.draws, tsumo: st.tsumo, ron: st.ron, avgFan: (st.fanTotal / st.wins).toFixed(1), maxFan: st.maxFan, actions: st.actions, scores: st.scores }));
  console.log('番种出现次数:', JSON.stringify(st.fanNames));
  ok(st.wins > 100, 'AI should win most rounds');
  st = simulate(200, { seed: 5, minFan: 8, flowers: true }, E.aiDecide);
  console.log('AI vs AI 200局 (起和8番+花):', JSON.stringify({ wins: st.wins, draws: st.draws, avgFan: (st.fanTotal / st.wins).toFixed(1), maxFan: st.maxFan, actions: st.actions }));
  const rr = mulberry(99);
  st = simulate(1000, { seed: 3, minFan: 1, flowers: true }, randomPolicy(rr));
  console.log('随机策略 1000局:', JSON.stringify({ wins: st.wins, draws: st.draws, actions: st.actions }));
  ok(st.actions.jiagang > 0 && st.actions.angang > 0 && st.actions.gang > 0 && st.actions.chi > 0, 'random covers all actions');
  ok(true, 'simulations ran');
} catch (e) { fail++; console.log('FAIL simulation:', e.stack); }
// 语音读法
ok(MJ.speakName(2) === '三万' && MJ.speakName(9) === '东风' && MJ.speakName(12) === '北风', 'speak names: 万/风');
ok(MJ.speakName(13) === '红中' && MJ.speakName(14) === '发财' && MJ.speakName(15) === '白板', 'speak names: 箭牌');
console.log(`\n用时 ${Date.now() - t0}ms`);
console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
