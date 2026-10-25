/* 二人麻将 - 牌局流程与电脑 AI */
(function (G) {
  'use strict';
  var MJ = G.MJ || (typeof require !== 'undefined' ? require('./core.js') : null);
  var counts = MJ.counts;

  function removeTiles(hand, tiles) {
    tiles.forEach(function (t) {
      var i = hand.indexOf(t);
      if (i < 0) throw new Error('tile not in hand: ' + t);
      hand.splice(i, 1);
    });
  }

  function Game(opts) {
    this.opts = Object.assign({ minFan: 1, flowers: false, rng: Math.random }, opts || {});
    this.scores = [0, 0];
    this.dealer = 0;
    this.windIdx = 0;
    this.passes = 0;
    this.handNo = 0;
    this.result = null;
    this.events = [];
    this.phase = 'idle';
  }
  Game.prototype.emit = function (e) { this.events.push(e); };
  Game.prototype.newRound = function () {
    if (this.result) {
      var r = this.result;
      if (!(r.type === 'draw' || r.winner === this.dealer)) {
        this.dealer = 1 - this.dealer; this.passes++;
        if (this.passes % 2 === 0) this.windIdx = (this.windIdx + 1) % 4;
      }
    }
    var rng = this.opts.rng, wall = [], t, k;
    for (t = 0; t < 16; t++) for (k = 0; k < 4; k++) wall.push(t);
    if (this.opts.flowers) for (t = 16; t < 24; t++) wall.push(t);
    for (var i = wall.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var x = wall[i]; wall[i] = wall[j]; wall[j] = x; }
    this.wall = wall;
    this.totalTiles = wall.length;
    this.handNo++;
    this.roundWind = 9 + this.windIdx;
    var self = this;
    this.players = [0, 1].map(function (p) {
      return { hand: [], melds: [], discards: [], flowers: [], seatWind: p === self.dealer ? 9 : 11 };
    });
    var order = [this.dealer, 1 - this.dealer];
    for (var r2 = 0; r2 < 13; r2++) order.forEach(function (p) { self.players[p].hand.push(self.wall.shift()); });
    order.forEach(function (p) {
      var pl = self.players[p], idx;
      while ((idx = pl.hand.findIndex(function (x) { return x >= 16; })) >= 0) {
        pl.flowers.push(pl.hand.splice(idx, 1)[0]);
        pl.hand.push(self.wall.pop());
      }
    });
    this.result = null; this.lastDiscard = null; this.drawn = null; this.rob = null;
    this.afterKong = false; this.canTsumo = false;
    this.events = [{ type: 'newRound' }];
    this.turns = 0;
    this._draw(this.dealer, false, false);
  };
  Game.prototype._draw = function (p, fromBack, afterKong) {
    var pl = this.players[p];
    while (true) {
      if (this.wall.length === 0) { this._endDraw(); return; }
      var t = fromBack ? this.wall.pop() : this.wall.shift();
      if (t >= 16) { pl.flowers.push(t); this.emit({ type: 'flower', p: p, tile: t }); fromBack = true; continue; }
      pl.hand.push(t);
      this.drawn = t; this.cur = p; this.phase = 'act'; this.canTsumo = true; this.afterKong = !!afterKong;
      this.turns++;
      this.emit({ type: 'draw', p: p, tile: t, back: fromBack });
      return;
    }
  };
  Game.prototype._endDraw = function () {
    this.phase = 'over';
    this.result = { type: 'draw', dealer: this.dealer, handNo: this.handNo };
    this.emit({ type: 'drawGame' });
  };
  Game.prototype.pending = function () {
    if (this.phase === 'act') return this.cur;
    if (this.phase === 'claim') return 1 - this.lastDiscard.from;
    if (this.phase === 'rob') return 1 - this.rob.p;
    return -1;
  };
  Game.prototype.visibleCount = function (t) {
    var n = 0;
    this.players.forEach(function (pl) {
      pl.discards.forEach(function (x) { if (x === t) n++; });
      pl.melds.forEach(function (md) { if (md.type !== 'agang') md.tiles.forEach(function (x) { if (x === t) n++; }); });
    });
    return n;
  };
  Game.prototype.winResult = function (p, tile, selfDraw, extra) {
    extra = extra || {};
    var pl = this.players[p];
    var hand = selfDraw ? pl.hand.slice() : pl.hand.concat([tile]);
    if (!MJ.isWin(counts(hand), pl.melds.length)) return null;
    var vis = this.visibleCount(tile) - ((!selfDraw && !extra.robKong) ? 1 : 0);
    var ctx = {
      hand: hand, melds: pl.melds, winTile: tile, selfDraw: selfDraw,
      seatWind: pl.seatWind, roundWind: this.roundWind,
      lastTile: this.wall.length === 0, afterKong: selfDraw && this.afterKong,
      robKong: !!extra.robKong, juezhang: vis === 3, flowers: pl.flowers.length
    };
    var r = MJ.calcFan(ctx);
    if (!r) return null;
    r.ok = r.totalNoFlower >= this.opts.minFan;
    return r;
  };
  Game.prototype.actions = function (p) {
    var pl = this.players[p], out = [], c, t, s;
    if (this.phase === 'act' && p === this.cur) {
      if (this.canTsumo) {
        var r = this.winResult(p, this.drawn, true);
        if (r && r.ok) out.push({ type: 'tsumo', result: r });
      }
      if (this.canTsumo && this.wall.length > 0) {
        c = counts(pl.hand);
        for (t = 0; t < 16; t++) if (c[t] === 4) out.push({ type: 'angang', tile: t });
        pl.melds.forEach(function (md) { if (md.type === 'peng' && c[md.tile] > 0) out.push({ type: 'jiagang', tile: md.tile }); });
      }
      MJ.sortTiles(pl.hand).forEach(function (x, i, a) { if (i === 0 || a[i - 1] !== x) out.push({ type: 'discard', tile: x }); });
    } else if (this.phase === 'claim' && p !== this.lastDiscard.from) {
      t = this.lastDiscard.tile;
      var rr = this.winResult(p, t, false);
      if (rr && rr.ok) out.push({ type: 'ron', result: rr });
      if (this.wall.length > 0) {
        c = counts(pl.hand);
        if (c[t] >= 3) out.push({ type: 'gang', tile: t });
        if (c[t] >= 2) out.push({ type: 'peng', tile: t });
        if (MJ.isNum(t)) {
          for (s = t - 2; s <= t; s++) {
            if (s < 0 || s > 6) continue;
            var ok = true;
            for (var k = s; k < s + 3; k++) if (k !== t && c[k] < 1) ok = false;
            if (ok) out.push({ type: 'chi', start: s, tile: t });
          }
        }
      }
      out.push({ type: 'pass' });
    } else if (this.phase === 'rob' && p !== this.rob.p) {
      var r3 = this.winResult(p, this.rob.tile, false, { robKong: true });
      if (r3 && r3.ok) out.push({ type: 'ron', result: r3 });
      out.push({ type: 'pass' });
    }
    return out;
  };
  Game.prototype.apply = function (p, a) {
    var legal = this.actions(p).some(function (x) {
      return x.type === a.type && (x.tile === undefined || a.tile === undefined || x.tile === a.tile) &&
        (x.type !== 'chi' || x.start === a.start) && (x.type !== 'discard' || x.tile === a.tile);
    });
    if (!legal) throw new Error('illegal action ' + JSON.stringify(a) + ' for p' + p + ' in ' + this.phase);
    var pl = this.players[p], op = this.players[1 - p], t, r, md;
    switch (a.type) {
      case 'discard':
        removeTiles(pl.hand, [a.tile]);
        pl.discards.push(a.tile);
        this.lastDiscard = { tile: a.tile, from: p, idx: pl.discards.length - 1, claimed: false };
        this.drawn = null; this.afterKong = false; this.canTsumo = false;
        this.phase = 'claim';
        this.emit({ type: 'discard', p: p, tile: a.tile });
        break;
      case 'pass':
        if (this.phase === 'claim') {
          if (this.wall.length === 0) this._endDraw(); else this._draw(p, false, false);
        } else if (this.phase === 'rob') this._completeJiagang();
        break;
      case 'ron':
        if (this.phase === 'rob') {
          t = this.rob.tile;
          r = this.winResult(p, t, false, { robKong: true });
          this._win(p, this.rob.p, r, t, false, true);
        } else {
          t = this.lastDiscard.tile;
          r = this.winResult(p, t, false);
          this._win(p, 1 - p, r, t, false, false);
        }
        break;
      case 'tsumo':
        r = this.winResult(p, this.drawn, true);
        this._win(p, 1 - p, r, this.drawn, true, false);
        break;
      case 'peng':
        t = this.lastDiscard.tile;
        removeTiles(pl.hand, [t, t]); op.discards.pop(); this.lastDiscard.claimed = true;
        pl.melds.push({ type: 'peng', tile: t, tiles: [t, t, t], claimed: t, from: 1 - p });
        this.phase = 'act'; this.cur = p; this.canTsumo = false; this.drawn = null;
        this.emit({ type: 'peng', p: p, tile: t });
        break;
      case 'gang':
        t = this.lastDiscard.tile;
        removeTiles(pl.hand, [t, t, t]); op.discards.pop(); this.lastDiscard.claimed = true;
        pl.melds.push({ type: 'mgang', tile: t, tiles: [t, t, t, t], claimed: t, from: 1 - p });
        this.emit({ type: 'gang', p: p, tile: t });
        this._draw(p, true, true);
        break;
      case 'chi':
        t = this.lastDiscard.tile;
        var need = [];
        for (var k = a.start; k < a.start + 3; k++) if (k !== t) need.push(k);
        removeTiles(pl.hand, need); op.discards.pop(); this.lastDiscard.claimed = true;
        pl.melds.push({ type: 'chi', start: a.start, tiles: [a.start, a.start + 1, a.start + 2], claimed: t, from: 1 - p });
        this.phase = 'act'; this.cur = p; this.canTsumo = false; this.drawn = null;
        this.emit({ type: 'chi', p: p, tile: t });
        break;
      case 'angang':
        t = a.tile;
        removeTiles(pl.hand, [t, t, t, t]);
        pl.melds.push({ type: 'agang', tile: t, tiles: [t, t, t, t], from: p });
        this.emit({ type: 'angang', p: p, tile: t });
        this._draw(p, true, true);
        break;
      case 'jiagang':
        t = a.tile;
        removeTiles(pl.hand, [t]);
        this.rob = { p: p, tile: t };
        this.drawn = null; this.canTsumo = false;
        this.phase = 'rob';
        this.emit({ type: 'jiagangTry', p: p, tile: t });
        break;
      default: throw new Error('unknown action');
    }
  };
  Game.prototype._completeJiagang = function () {
    var p = this.rob.p, t = this.rob.tile, pl = this.players[p];
    var md = pl.melds.find(function (m) { return m.type === 'peng' && m.tile === t; });
    md.type = 'jgang'; md.tiles = [t, t, t, t];
    this.rob = null;
    this.emit({ type: 'jiagang', p: p, tile: t });
    this._draw(p, true, true);
  };
  Game.prototype._win = function (w, payer, r, tile, selfDraw, robKong) {
    var pay = 8 + r.total;
    this.scores[w] += pay; this.scores[payer] -= pay;
    this.phase = 'over';
    var pl = this.players[w];
    var hand = selfDraw ? pl.hand.slice() : pl.hand.concat([tile]);
    this.result = {
      type: 'win', winner: w, payer: payer, selfDraw: selfDraw, robKong: robKong, tile: tile,
      fan: r, pay: pay, dealer: this.dealer, handNo: this.handNo,
      hand: hand, melds: pl.melds.slice(), flowers: pl.flowers.slice()
    };
    this.emit({ type: 'win', p: w, selfDraw: selfDraw });
  };

  // ---------- AI ----------
  function unseenFor(g, p) {
    var u = new Array(16).fill(4), own = counts(g.players[p].hand);
    for (var t = 0; t < 16; t++) u[t] -= own[t];
    g.players.forEach(function (pl) {
      pl.discards.forEach(function (x) { if (x < 16) u[x]--; });
      pl.melds.forEach(function (md) { md.tiles.forEach(function (x) { u[x]--; }); });
    });
    return u.map(function (x) { return Math.max(0, x); });
  }
  function bestDiscard(g, p, c, m) {
    var pl = g.players[p], unseen = unseenFor(g, p), best = null;
    var honorCount = 0; for (var h = 9; h < 16; h++) honorCount += c[h];
    var chase8 = g.opts.minFan >= 8;
    for (var t = 0; t < 16; t++) {
      if (!c[t]) continue;
      c[t]--;
      var s = MJ.shanten(c, m), uke = 0;
      for (var k = 0; k < 16; k++) {
        if (!unseen[k] || c[k] >= 4) continue;
        c[k]++;
        if (MJ.shanten(c, m) < s) uke += unseen[k];
        c[k]--;
      }
      c[t]++;
      var valuable = MJ.isDragon(t) || t === pl.seatWind || t === g.roundWind;
      var tb = 0;
      if (MJ.isHonor(t) && c[t] === 1) tb += valuable ? 2 : 5;
      if (t === 0 || t === 8) tb += 1;
      if (chase8 && MJ.isHonor(t) && honorCount <= 4 && c[t] < 3) tb += 8;
      if (valuable && c[t] >= 2) tb -= 6;
      var score = -s * 1000 + uke * 10 + tb + g.opts.rng() * 0.5;
      if (!best || score > best.score) best = { tile: t, s: s, uke: uke, score: score };
    }
    return best;
  }
  function minShantenAfterDiscard(c, m) {
    var b = 99;
    for (var t = 0; t < 16; t++) { if (!c[t]) continue; c[t]--; var s = MJ.shanten(c, m); c[t]++; if (s < b) b = s; }
    return b;
  }
  function aiDecide(g, p) {
    var acts = g.actions(p);
    var win = acts.find(function (a) { return a.type === 'tsumo' || a.type === 'ron'; });
    if (win) return win;
    var pl = g.players[p], m = pl.melds.length, c = counts(pl.hand), i, a, c2;
    if (g.phase === 'act') {
      var best = bestDiscard(g, p, c, m);
      for (i = 0; i < acts.length; i++) {
        a = acts[i];
        if (a.type === 'angang') {
          c2 = c.slice(); c2[a.tile] -= 4;
          if (MJ.shanten(c2, m + 1) <= best.s) return a;
        } else if (a.type === 'jiagang') {
          c2 = c.slice(); c2[a.tile] -= 1;
          if (MJ.shanten(c2, m) <= best.s) return a;
        }
      }
      return { type: 'discard', tile: best.tile };
    }
    if (g.phase === 'claim') {
      var t = g.lastDiscard.tile, s0 = MJ.shanten(c, m), choice = null, bestS = 99;
      var valuable = MJ.isDragon(t) || t === pl.seatWind || t === g.roundWind;
      for (i = 0; i < acts.length; i++) {
        a = acts[i];
        var s2 = 99;
        if (a.type === 'gang') {
          c2 = c.slice(); c2[t] -= 3; s2 = MJ.shanten(c2, m + 1);
          if (s2 <= s0) return a;
        } else if (a.type === 'peng') {
          c2 = c.slice(); c2[t] -= 2; s2 = minShantenAfterDiscard(c2, m + 1);
          if ((s2 < s0 || (valuable && s2 <= s0)) && s2 < bestS) { choice = a; bestS = s2; }
        } else if (a.type === 'chi') {
          c2 = c.slice();
          for (var k = a.start; k < a.start + 3; k++) if (k !== t) c2[k]--;
          s2 = minShantenAfterDiscard(c2, m + 1);
          if (s2 < s0 && s2 < bestS) { choice = a; bestS = s2; }
        }
      }
      return choice || { type: 'pass' };
    }
    return { type: 'pass' };
  }

  var Engine = { Game: Game, aiDecide: aiDecide, unseenFor: unseenFor };
  G.MJEngine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
