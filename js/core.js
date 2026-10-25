/* 二人麻将 - 规则核心：牌、和牌判定、向听数、国标番种计算 */
(function (G) {
  'use strict';
  var N = 16; // 0-8 一~九万, 9-12 东南西北, 13-15 中发白, 16-23 花
  var NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var HONOR_NAMES = ['东风', '南风', '西风', '北风', '红中', '发财', '白板'];
  var FLOWER_NAMES = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];
  function isNum(t) { return t >= 0 && t < 9; }
  function isWind(t) { return t >= 9 && t <= 12; }
  function isDragon(t) { return t >= 13 && t <= 15; }
  function isHonor(t) { return t >= 9 && t < 16; }
  function isFlower(t) { return t >= 16; }
  function isTermHonor(t) { return t === 0 || t === 8 || isHonor(t); }
  function tileName(t) {
    if (t < 9) return NUMS[t] + '万';
    if (t < 16) return HONOR_NAMES[t - 9];
    return FLOWER_NAMES[t - 16];
  }
  // 语音报牌用的读法（万字 + 东风/南风… + 红中/发财/白板）
  var SPEAK_HONOR = ['东风', '南风', '西风', '北风', '红中', '发财', '白板'];
  function speakName(t) {
    if (t < 9) return NUMS[t] + '万';
    if (t < 16) return SPEAK_HONOR[t - 9];
    return FLOWER_NAMES[t - 16];
  }
  function counts(arr) {
    var c = new Array(N).fill(0);
    for (var i = 0; i < arr.length; i++) if (arr[i] < N) c[arr[i]]++;
    return c;
  }
  function sum(c) { var s = 0; for (var i = 0; i < c.length; i++) s += c[i]; return s; }
  function sortTiles(a) { return a.slice().sort(function (x, y) { return x - y; }); }

  // ---------- 番种表 ----------
  var FAN_INFO = [
    ['大四喜', 88, '和牌中有东南西北四副刻子（杠）。不计三风刻、碰碰和、圈风刻、门风刻、幺九刻。'],
    ['大三元', 88, '和牌中有中、发、白三副刻子（杠）。不计双箭刻、箭刻。'],
    ['九莲宝灯', 88, '门前清，由同花色 1112345678999 听同花色任意一张和牌。不计清一色、门前清、无字、一个幺九刻。'],
    ['四杠', 88, '和牌中有四个杠。不计三杠、双明杠、明杠、暗杠、单钓将、碰碰和。'],
    ['连七对', 88, '由同一花色序数相连的七个对子组成。不计清一色、七对、门前清、无字、单钓将。'],
    ['小四喜', 64, '和牌时有风牌的三副刻子及风牌将牌。不计三风刻、幺九刻。'],
    ['小三元', 64, '和牌时有箭牌的两副刻子及箭牌将牌。不计双箭刻、箭刻。'],
    ['字一色', 64, '全部由字牌组成。不计碰碰和、全带幺、混幺九、幺九刻。'],
    ['四暗刻', 64, '四个暗刻（含暗杠）。不计门前清、碰碰和、三暗刻、双暗刻。'],
    ['一色双龙会', 64, '一种花色的两个老少副加该色五为将。不计平和、七对、清一色、一般高、老少副、无字。'],
    ['一色四同顺', 48, '一种花色四副序数相同的顺子。不计一色三节高、一般高、四归一、一色三同顺。'],
    ['一色四节高', 48, '一种花色四副依次递增一位数的刻子。不计一色三同顺、一色三节高、碰碰和。'],
    ['一色四步高', 32, '一种花色四副依次递增一位或二位数的顺子。不计一色三步高、连六、老少副。'],
    ['三杠', 32, '和牌中有三个杠。不计双明杠、明杠、暗杠等。'],
    ['混幺九', 32, '由字牌与序数牌一、九的刻子（或对子）组成。不计碰碰和、幺九刻、全带幺。'],
    ['七对', 24, '由七个对子组成（四张相同可算两对）。不计门前清、不求人、单钓将。'],
    ['清一色', 24, '由一种花色的序数牌组成（不含字牌）。不计无字。'],
    ['一色三同顺', 24, '一种花色三副序数相同的顺子。不计一色三节高、一般高。'],
    ['一色三节高', 24, '一种花色三副依次递增一位数的刻子。不计一色三同顺。'],
    ['清龙', 16, '同一花色 123、456、789 三副顺子。不计连六、老少副。'],
    ['一色三步高', 16, '一种花色三副依次递增一位或二位数的顺子。'],
    ['三暗刻', 16, '三个暗刻（含暗杠）。不计双暗刻。'],
    ['大于五', 12, '全部由序数牌六至九组成。不计无字。'],
    ['小于五', 12, '全部由序数牌一至四组成。不计无字。'],
    ['三风刻', 12, '三副风刻（杠）。'],
    ['妙手回春', 8, '自摸牌墙上最后一张牌和牌。不计自摸。'],
    ['海底捞月', 8, '和打出的最后一张牌。'],
    ['杠上开花', 8, '开杠后补牌和牌。不计自摸。'],
    ['抢杠和', 8, '和别人加杠的牌。不计和绝张。'],
    ['无番和', 8, '和牌后数不出任何番种分（花牌不计）。'],
    ['碰碰和', 6, '由四副刻子（杠）加将牌组成。'],
    ['混一色', 6, '由一种花色序数牌及字牌组成。'],
    ['全求人', 6, '全靠吃、碰、明杠成和，单钓别人打出的牌和牌。不计单钓将。'],
    ['双暗杠', 6, '两个暗杠。不计暗杠、双暗刻。'],
    ['双箭刻', 6, '两副箭刻（杠）。不计箭刻。'],
    ['明暗杠', 5, '一个明杠加一个暗杠。不计明杠、暗杠。'],
    ['全带幺', 4, '每副顺子、刻子和将牌都包含幺九牌或字牌。'],
    ['不求人', 4, '没有吃、碰、明杠，自摸和牌。不计门前清、自摸。'],
    ['双明杠', 4, '两个明杠。不计明杠。'],
    ['和绝张', 4, '和牌池、桌面已亮明的三张牌中的第四张。'],
    ['箭刻', 2, '由中、发、白三张相同的牌组成的刻子（杠），每副计 2 番。'],
    ['圈风刻', 2, '与圈风相同的风刻。'],
    ['门风刻', 2, '与本门风相同的风刻。'],
    ['门前清', 2, '没有吃、碰、明杠，和别人打出的牌。'],
    ['平和', 2, '由四副顺子及序数牌作将组成。不计无字。'],
    ['四归一', 2, '和牌中有四张相同的牌归于一家的顺、刻子、对、将牌中（不含杠）。'],
    ['双暗刻', 2, '两个暗刻（含暗杠）。'],
    ['暗杠', 2, '自抓四张相同的牌开杠。'],
    ['断幺', 2, '和牌中没有一、九及字牌。不计无字。'],
    ['一般高', 1, '同花色、序数相同的两副顺子。'],
    ['连六', 1, '同一花色六张相连的序数牌组成的两副顺子。'],
    ['老少副', 1, '同一花色牌的 123、789 两副顺子。'],
    ['幺九刻', 1, '序数牌一、九或非圈风/门风的风牌组成的刻子（杠）。'],
    ['明杠', 1, '自己有暗刻碰别人打出的相同牌开杠，或加杠。'],
    ['无字', 1, '和牌中没有字牌（风、箭牌）。'],
    ['边张', 1, '单和 123 的 3 或 789 的 7（只听这一张）。'],
    ['坎张', 1, '和两张牌之间的牌（只听这一张）。'],
    ['单钓将', 1, '钓单张牌作将成和（只听这一张）。'],
    ['自摸', 1, '自己抓进牌成和牌。'],
    ['花牌', 1, '每张花牌计 1 番（不计入起和番）。']
  ];
  var FAN = {};
  FAN_INFO.forEach(function (f) { FAN[f[0]] = f[1]; });

  // ---------- 和牌判定 ----------
  function canDecompose(c, needPair) {
    var i = 0;
    while (i < N && c[i] === 0) i++;
    if (i === N) return !needPair;
    if (needPair && c[i] >= 2) {
      c[i] -= 2; var ok = canDecompose(c, false); c[i] += 2; if (ok) return true;
    }
    if (c[i] >= 3) {
      c[i] -= 3; var ok2 = canDecompose(c, needPair); c[i] += 3; if (ok2) return true;
    }
    if (i < 7 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      var ok3 = canDecompose(c, needPair);
      c[i]++; c[i + 1]++; c[i + 2]++;
      if (ok3) return true;
    }
    return false;
  }
  function isSevenPairs(c) {
    if (sum(c) !== 14) return false;
    for (var i = 0; i < N; i++) if (c[i] % 2) return false;
    return true;
  }
  function isWin(c, m) {
    var s = sum(c);
    if (s !== 14 - 3 * m) return false;
    if (canDecompose(c.slice(), true)) return true;
    return m === 0 && isSevenPairs(c);
  }
  function getWaits(c13, m) {
    var w = [];
    for (var t = 0; t < N; t++) {
      if (c13[t] >= 4) continue;
      c13[t]++;
      if (isWin(c13, m)) w.push(t);
      c13[t]--;
    }
    return w;
  }
  // 所有标准拆分（四副+将）
  function decompose(c0) {
    var c = c0.slice(), res = [], sets = [], pair = -1;
    (function rec() {
      var i = 0;
      while (i < N && c[i] === 0) i++;
      if (i === N) { if (pair >= 0) res.push({ pair: pair, sets: sets.slice() }); return; }
      if (pair < 0 && c[i] >= 2) { c[i] -= 2; pair = i; rec(); pair = -1; c[i] += 2; }
      if (c[i] >= 3) { c[i] -= 3; sets.push({ t: 'pung', s: i }); rec(); sets.pop(); c[i] += 3; }
      if (i < 7 && c[i + 1] && c[i + 2]) {
        c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ t: 'chow', s: i }); rec(); sets.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
    })();
    return res;
  }

  // ---------- 向听数 ----------
  var numMemo = new Map();
  function numTuples(c9) {
    var key = c9.join('');
    var r = numMemo.get(key);
    if (r) return r;
    var seen = new Set(), c = c9.slice();
    (function rec(i, M, T, P) {
      while (i < 9 && c[i] === 0) i++;
      if (i >= 9) { seen.add(M * 100 + T * 10 + P); return; }
      if (c[i] >= 3) { c[i] -= 3; rec(i, M + 1, T, P); c[i] += 3; }
      if (i < 7 && c[i + 1] && c[i + 2]) { c[i]--; c[i + 1]--; c[i + 2]--; rec(i, M + 1, T, P); c[i]++; c[i + 1]++; c[i + 2]++; }
      if (c[i] >= 2) { c[i] -= 2; if (!P) rec(i, M, T, 1); rec(i, M, T + 1, P); c[i] += 2; }
      if (i < 8 && c[i + 1]) { c[i]--; c[i + 1]--; rec(i, M, T + 1, P); c[i]++; c[i + 1]++; }
      if (i < 7 && c[i + 2]) { c[i]--; c[i + 2]--; rec(i, M, T + 1, P); c[i]++; c[i + 2]++; }
      c[i]--; rec(i, M, T, P); c[i]++;
    })(0, 0, 0, 0);
    r = [];
    seen.forEach(function (v) { r.push([Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10]); });
    if (numMemo.size > 200000) numMemo.clear();
    numMemo.set(key, r);
    return r;
  }
  function shantenStd(c, m) {
    var tuples = numTuples(c.slice(0, 9));
    var hM = 0, h2 = 0;
    for (var i = 9; i < N; i++) { if (c[i] >= 3) hM++; else if (c[i] === 2) h2++; }
    var best = 8;
    for (var k = 0; k < tuples.length; k++) {
      var M = tuples[k][0] + hM + m, T = tuples[k][1], P = tuples[k][2];
      if (h2 > 0) { if (!P) { P = 1; T += h2 - 1; } else T += h2; }
      if (M > 4) M = 4;
      var t = Math.min(T, 4 - M);
      var s = 8 - 2 * M - t - P;
      if (s < best) best = s;
    }
    return best;
  }
  function shantenSeven(c) {
    var pairs = 0;
    for (var i = 0; i < N; i++) pairs += Math.floor(c[i] / 2);
    return 6 - Math.min(7, pairs);
  }
  function shanten(c, m) {
    var s = shantenStd(c, m);
    if (m === 0) s = Math.min(s, shantenSeven(c));
    return s;
  }

  // ---------- 番种计算 ----------
  function FanSet() { this.ex = new Set(); this.list = []; }
  FanSet.prototype.A = function (name, cond, excl, cnt) {
    if (!cond) return;
    cnt = cnt === undefined ? 1 : cnt;
    if (cnt <= 0 || this.ex.has(name)) return;
    if (FAN[name] === undefined) throw new Error('unknown fan ' + name);
    this.list.push({ name: name, fan: FAN[name], count: cnt });
    var self = this;
    (excl || []).forEach(function (n) { self.ex.add(n); });
  };
  function tileProps(tiles) {
    var p = { hasHonor: false, hasNum: false, allTermHonor: true, noTermHonor: true, allGe6: true, allLe4: true };
    tiles.forEach(function (t) {
      if (isHonor(t)) { p.hasHonor = true; p.allGe6 = false; p.allLe4 = false; } else { p.hasNum = true; if (t < 5) p.allGe6 = false; if (t > 3) p.allLe4 = false; }
      if (isTermHonor(t)) p.noTermHonor = false; else p.allTermHonor = false;
    });
    p.allHonor = !p.hasNum; p.allNum = !p.hasHonor;
    return p;
  }
  function isNineGates(c13) {
    var pat = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    for (var i = 0; i < 9; i++) if (c13[i] !== pat[i]) return false;
    for (var j = 9; j < N; j++) if (c13[j]) return false;
    return true;
  }
  function pairFan(a, b) {
    if (a === b) return '一般高';
    if (Math.abs(a - b) === 3) return '连六';
    if ((a === 0 && b === 6) || (a === 6 && b === 0)) return '老少副';
    return null;
  }
  function triFan(a, b, c) { // sorted
    if (a === b && b === c) return '一色三同顺';
    if (a === 0 && b === 3 && c === 6) return '清龙';
    if ((b - a === 1 && c - b === 1) || (b - a === 2 && c - b === 2)) return '一色三步高';
    return null;
  }
  // 顺子组合番（遵循不重复原则的简化实现）
  function chowFans(st) {
    st = st.slice().sort(function (a, b) { return a - b; });
    var n = st.length, i, j;
    if (n === 4) {
      var a = st[0], b = st[1], c = st[2], d = st[3];
      if (a === d) return ['一色四同顺'];
      if ((b - a === 1 && c - b === 1 && d - c === 1) || (b - a === 2 && c - b === 2 && d - c === 2)) return ['一色四步高'];
      var best = null, bestV = -1;
      for (var skip = 0; skip < 4; skip++) {
        var r = st.filter(function (_, k) { return k !== skip; });
        var t = triFan(r[0], r[1], r[2]);
        if (!t) continue;
        var v = FAN[t], pf = null;
        for (j = 0; j < 3; j++) { pf = pairFan(st[skip], r[j]); if (pf) break; }
        if (pf) v += 1;
        if (v > bestV) { bestV = v; best = pf ? [t, pf] : [t]; }
      }
      if (best) return best;
      var pairings = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]], out = [];
      pairings.forEach(function (pr) {
        var fs = [];
        pr.forEach(function (ij) { var p = pairFan(st[ij[0]], st[ij[1]]); if (p) fs.push(p); });
        if (fs.length > out.length) out = fs;
      });
      return out;
    }
    if (n === 3) {
      var t3 = triFan(st[0], st[1], st[2]);
      if (t3) return [t3];
      for (i = 0; i < 3; i++) for (j = i + 1; j < 3; j++) { var p3 = pairFan(st[i], st[j]); if (p3) return [p3]; }
      return [];
    }
    if (n === 2) { var p2 = pairFan(st[0], st[1]); return p2 ? [p2] : []; }
    return [];
  }
  function situational(F, ctx) {
    F.A('妙手回春', ctx.selfDraw && ctx.lastTile, ['自摸']);
    F.A('海底捞月', !ctx.selfDraw && ctx.lastTile, []);
    F.A('杠上开花', ctx.selfDraw && ctx.afterKong, ['自摸']);
    F.A('抢杠和', ctx.robKong, ['和绝张']);
  }
  function finish(F, form, extra) {
    var total = 0, flowers = 0;
    F.list.forEach(function (f) { total += f.fan * f.count; if (f.name === '花牌') flowers += f.fan * f.count; });
    if (total - flowers === 0) { F.list.unshift({ name: '无番和', fan: 8, count: 1 }); total += 8; }
    var r = { total: total, totalNoFlower: total - flowers, fans: F.list, form: form };
    for (var k in extra) r[k] = extra[k];
    return r;
  }
  function meldToSet(md) {
    if (md.type === 'chi') return { t: 'chow', s: md.start, kong: null, open: true, anke: false };
    if (md.type === 'peng') return { t: 'pung', s: md.tile, kong: null, open: true, anke: false };
    if (md.type === 'agang') return { t: 'pung', s: md.tile, kong: 'a', open: false, anke: true };
    return { t: 'pung', s: md.tile, kong: 'm', open: true, anke: false };
  }
  function evalStd(ctx, d, place, single) {
    var F = new FanSet();
    var sets = d.sets.map(function (s, i) {
      return { t: s.t, s: s.s, kong: null, open: false, anke: s.t === 'pung' && !(!ctx.selfDraw && place.set === i) };
    });
    ctx.melds.forEach(function (md) { sets.push(meldToSet(md)); });
    var pair = d.pair, tiles = [];
    sets.forEach(function (s) {
      if (s.t === 'chow') tiles.push(s.s, s.s + 1, s.s + 2);
      else for (var k = 0; k < (s.kong ? 4 : 3); k++) tiles.push(s.s);
    });
    tiles.push(pair, pair);
    var pungs = sets.filter(function (s) { return s.t === 'pung'; });
    var chows = sets.filter(function (s) { return s.t === 'chow'; });
    var windP = pungs.filter(function (s) { return isWind(s.s); }).length;
    var dragP = pungs.filter(function (s) { return isDragon(s.s); }).length;
    var kongs = pungs.filter(function (s) { return s.kong; });
    var ak = kongs.filter(function (s) { return s.kong === 'a'; }).length, mk = kongs.length - ak;
    var anke = pungs.filter(function (s) { return s.anke; }).length;
    var exposed = ctx.melds.filter(function (md) { return md.type !== 'agang'; }).length;
    var menqing = exposed === 0;
    var P = tileProps(tiles);
    var jiulian = ctx.melds.length === 0 && isNineGates(ctx.c13);
    var cs = chows.map(function (s) { return s.s; }).sort(function (a, b) { return a - b; });
    var dragon2 = cs.length === 4 && cs[0] === 0 && cs[1] === 0 && cs[2] === 6 && cs[3] === 6 && pair === 4;
    var cf = dragon2 ? [] : chowFans(cs), cfc = {};
    cf.forEach(function (n) { cfc[n] = (cfc[n] || 0) + 1; });
    var np = pungs.filter(function (s) { return isNum(s.s); }).map(function (s) { return s.s; }).sort(function (a, b) { return a - b; });
    var run = 0, cur = 0;
    for (var i = 0; i < np.length; i++) { cur = (i > 0 && np[i] === np[i - 1] + 1) ? cur + 1 : 1; if (cur > run) run = cur; }
    var allSetsYao = sets.every(function (s) { return s.t === 'chow' ? (s.s === 0 || s.s === 6) : isTermHonor(s.s); }) && isTermHonor(pair);
    // 88
    F.A('大四喜', windP === 4, ['三风刻', '碰碰和', '圈风刻', '门风刻', '小四喜']);
    F.A('大三元', dragP === 3, ['双箭刻', '箭刻', '小三元']);
    F.A('九莲宝灯', jiulian, ['清一色', '门前清', '无字', '不求人']);
    F.A('四杠', kongs.length === 4, ['三杠', '双明杠', '明杠', '双暗杠', '暗杠', '明暗杠', '单钓将', '碰碰和']);
    // 64
    F.A('小四喜', windP === 3 && isWind(pair), ['三风刻']);
    F.A('小三元', dragP === 2 && isDragon(pair), ['双箭刻', '箭刻']);
    F.A('字一色', P.allHonor, ['碰碰和', '全带幺', '混幺九', '幺九刻']);
    F.A('四暗刻', anke === 4, ['门前清', '碰碰和', '三暗刻', '双暗刻']);
    F.A('一色双龙会', dragon2, ['平和', '七对', '清一色', '一般高', '老少副', '无字']);
    // 48
    F.A('一色四同顺', !!cfc['一色四同顺'], ['一色三节高', '一般高', '四归一', '一色三同顺']);
    F.A('一色四节高', run >= 4, ['一色三同顺', '一色三节高', '碰碰和']);
    // 32
    F.A('一色四步高', !!cfc['一色四步高'], ['一色三步高', '连六', '老少副']);
    F.A('三杠', kongs.length === 3, ['双明杠', '明杠', '双暗杠', '暗杠', '明暗杠']);
    F.A('混幺九', P.allTermHonor && P.hasHonor && P.hasNum, ['碰碰和', '幺九刻', '全带幺']);
    // 24
    F.A('清一色', P.allNum, ['无字']);
    F.A('一色三同顺', !!cfc['一色三同顺'], ['一色三节高', '一般高']);
    F.A('一色三节高', run === 3, ['一色三同顺']);
    // 16
    F.A('清龙', !!cfc['清龙'], ['连六', '老少副']);
    F.A('一色三步高', !!cfc['一色三步高'], []);
    F.A('三暗刻', anke === 3, ['双暗刻']);
    // 12
    F.A('大于五', P.allGe6, ['无字']);
    F.A('小于五', P.allLe4, ['无字']);
    F.A('三风刻', windP === 3, []);
    // 8
    situational(F, ctx);
    // 6
    F.A('碰碰和', pungs.length === 4, []);
    F.A('混一色', P.hasHonor && P.hasNum, []);
    F.A('全求人', exposed === 4 && !ctx.selfDraw, ['单钓将']);
    F.A('双暗杠', ak === 2 && kongs.length === 2, ['暗杠', '双暗刻']);
    F.A('双箭刻', dragP === 2, ['箭刻']);
    F.A('明暗杠', ak === 1 && mk === 1 && kongs.length === 2, ['明杠', '暗杠']);
    // 4
    F.A('全带幺', allSetsYao, []);
    F.A('不求人', menqing && ctx.selfDraw, ['自摸', '门前清']);
    F.A('双明杠', mk === 2 && kongs.length === 2, ['明杠']);
    F.A('和绝张', ctx.juezhang, []);
    // 2
    F.A('箭刻', dragP > 0, [], dragP);
    F.A('圈风刻', pungs.some(function (s) { return s.s === ctx.roundWind; }), []);
    F.A('门风刻', pungs.some(function (s) { return s.s === ctx.seatWind; }), []);
    F.A('门前清', menqing && !ctx.selfDraw, []);
    F.A('平和', chows.length === 4 && isNum(pair), ['无字']);
    var c4 = new Array(N).fill(0);
    sets.forEach(function (s) { if (s.kong) return; if (s.t === 'chow') { c4[s.s]++; c4[s.s + 1]++; c4[s.s + 2]++; } else c4[s.s] += 3; });
    c4[pair] += 2;
    var sgy = c4.filter(function (x) { return x === 4; }).length;
    F.A('四归一', sgy > 0, [], sgy);
    F.A('双暗刻', anke === 2, []);
    F.A('暗杠', ak === 1 && kongs.length === 1, []);
    F.A('断幺', P.noTermHonor, ['无字']);
    // 1
    ['一般高', '连六', '老少副'].forEach(function (n) { F.A(n, !!cfc[n], [], cfc[n] || 0); });
    var yj = 0;
    pungs.forEach(function (s) {
      if (s.s === 0 || s.s === 8) yj++;
      else if (isWind(s.s) && s.s !== ctx.roundWind && s.s !== ctx.seatWind && windP < 3) yj++;
    });
    if (jiulian && yj > 0) yj--;
    F.A('幺九刻', yj > 0, [], yj);
    F.A('明杠', mk === 1 && kongs.length === 1, []);
    F.A('无字', !P.hasHonor, []);
    if (single) {
      if (place.pair) F.A('单钓将', true, []);
      else {
        var ps = sets[place.set];
        if (ps.t === 'chow') {
          if (ctx.winTile === ps.s + 1) F.A('坎张', true, []);
          else if ((ps.s === 0 && ctx.winTile === 2) || (ps.s === 6 && ctx.winTile === 6)) F.A('边张', true, []);
        }
      }
    }
    F.A('自摸', ctx.selfDraw, []);
    F.A('花牌', ctx.flowers > 0, [], ctx.flowers);
    return finish(F, 'std', {
      sets: d.sets.map(function (s) { return { t: s.t, s: s.s }; }), pair: pair,
      winSet: place.pair ? 'pair' : place.set
    });
  }
  function evalSeven(ctx, c) {
    var F = new FanSet(), tiles = [];
    for (var i = 0; i < N; i++) for (var k = 0; k < c[i]; k++) tiles.push(i);
    var P = tileProps(tiles);
    var lian = false;
    if (P.allNum) {
      var nz = []; for (var j = 0; j < 9; j++) if (c[j]) nz.push(j);
      lian = nz.length === 7 && nz[6] - nz[0] === 6 && nz.every(function (x) { return c[x] === 2; });
    }
    F.A('连七对', lian, ['清一色', '七对', '门前清', '不求人', '无字', '单钓将']);
    F.A('字一色', P.allHonor, ['碰碰和', '全带幺', '混幺九', '幺九刻']);
    F.A('混幺九', P.allTermHonor && P.hasHonor && P.hasNum, ['碰碰和', '幺九刻', '全带幺']);
    F.A('七对', true, ['门前清', '不求人', '单钓将']);
    F.A('清一色', P.allNum, ['无字']);
    F.A('大于五', P.allGe6, ['无字']);
    F.A('小于五', P.allLe4, ['无字']);
    situational(F, ctx);
    F.A('混一色', P.hasHonor && P.hasNum, []);
    F.A('和绝张', ctx.juezhang, []);
    var sgy = c.filter(function (x) { return x === 4; }).length;
    F.A('四归一', sgy > 0, [], sgy);
    F.A('断幺', P.noTermHonor, ['无字']);
    F.A('无字', !P.hasHonor, []);
    F.A('自摸', ctx.selfDraw, []);
    F.A('花牌', ctx.flowers > 0, [], ctx.flowers);
    return finish(F, 'seven', {});
  }
  /* ctx: { hand:[含和牌的手牌], melds:[], winTile, selfDraw, seatWind, roundWind,
            lastTile, afterKong, robKong, juezhang, flowers } */
  function calcFan(ctx) {
    var c = counts(ctx.hand), m = ctx.melds.length;
    if (!isWin(c, m)) return null;
    var c13 = c.slice(); c13[ctx.winTile]--;
    ctx = Object.assign({}, ctx, { c13: c13 });
    var waits = getWaits(c13.slice(), m), single = waits.length === 1;
    var best = null;
    function consider(r) { if (!best || r.total > best.total) best = r; }
    decompose(c).forEach(function (d) {
      var places = [];
      d.sets.forEach(function (s, i) {
        if (s.t === 'pung' && s.s === ctx.winTile) places.push({ set: i });
        if (s.t === 'chow' && ctx.winTile >= s.s && ctx.winTile <= s.s + 2) places.push({ set: i });
      });
      if (d.pair === ctx.winTile) places.push({ pair: true });
      places.forEach(function (pl) { consider(evalStd(ctx, d, pl, single)); });
    });
    if (m === 0 && isSevenPairs(c)) consider(evalSeven(ctx, c));
    if (best) best.waits = waits;
    return best;
  }

  var MJ = {
    N: N, NUMS: NUMS, FAN: FAN, FAN_INFO: FAN_INFO,
    isNum: isNum, isWind: isWind, isDragon: isDragon, isHonor: isHonor, isFlower: isFlower, isTermHonor: isTermHonor,
    tileName: tileName, speakName: speakName, counts: counts, sum: sum, sortTiles: sortTiles,
    isWin: isWin, getWaits: getWaits, decompose: decompose, isSevenPairs: isSevenPairs,
    shanten: shanten, shantenStd: shantenStd, calcFan: calcFan, chowFans: chowFans
  };
  G.MJ = MJ;
  if (typeof module !== 'undefined' && module.exports) module.exports = MJ;
})(typeof window !== 'undefined' ? window : globalThis);
