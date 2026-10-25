/* 二人麻将 - 界面与交互 */
(function () {
  'use strict';
  var MJ = window.MJ, EN = window.MJEngine;
  function $(id) { return document.getElementById(id); }
  var params = new URLSearchParams(location.search);
  var AUTO = params.get('auto') === '1';

  // ---------- 设置 ----------
  var DEFAULTS = { mode: 'ai', minFan: '1', flowers: '0', speed: '1', sound: '1', voice: '1', voiceName: '', voiceVol: '85', mute: '0' };
  var settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('mj2p.settings') || '{}')); } catch (e) { }
  function saveSettings() { try { localStorage.setItem('mj2p.settings', JSON.stringify(settings)); } catch (e) { } }
  if (AUTO) settings.speed = '0.15';

  var game = null, activeMode = settings.mode, viewer = 0, handoffPending = false, revealAll = false;
  var timer = null, evIdx = 0, fly = null, selIdx = null, logLines = [], animDraw = null, animMeld = null;
  var tingCache = null, scale = 1;

  function isHuman(p) { if (AUTO) return false; return activeMode === 'hotseat' || p === 0; }
  function nameOf(p) { if (activeMode === 'hotseat') return p === 0 ? '玩家一' : '玩家二'; return p === 0 ? '你' : '电脑'; }
  function windCh(t) { return '东南西北'[t - 9]; }

  // ---------- 缩放 ----------
  var stage = $('stage');
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / 1280, vh / 800);
    stage.style.transform = 'translate(' + (vw - 1280 * scale) / 2 + 'px,' + (vh - 800 * scale) / 2 + 'px) scale(' + scale + ')';
  }
  window.addEventListener('resize', fit); fit();

  // ---------- 音效 ----------
  var Snd = {
    ctx: null,
    ensure: function () {
      if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } }
      if (this.ctx && !this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); this.level(); }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    // 有语音报牌时音效整体变柔，正在说话时再压低一些
    level: function () {
      if (!this.master) return;
      var v = (settings.voice === '1' && Voice.supported) ? 0.55 : 1;
      if (Voice.cur) v *= 0.4;
      try { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); } catch (e) { this.master.gain.value = v; }
    },
    tone: function (f, t0, dur, vol, type) {
      var c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, c.currentTime + t0);
      g.gain.setValueAtTime(0.0001, c.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
      o.connect(g); g.connect(this.master || c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.02);
    },
    noise: function (dur, freq, vol) {
      var c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(this.master || c.destination); s.start();
    },
    play: function (k) {
      if (settings.sound !== '1' || settings.mute === '1' || !this.ctx || this.ctx.state !== 'running') return;
      try {
        if (k === 'clack') { this.noise(0.07, 2600, 0.9); this.tone(210, 0, 0.09, 0.25, 'triangle'); }
        else if (k === 'draw') { this.noise(0.04, 4200, 0.25); }
        else if (k === 'claim') { this.tone(587, 0, 0.16, 0.22, 'triangle'); this.tone(880, 0.09, 0.22, 0.22, 'triangle'); }
        else if (k === 'kong') { [440, 554, 659].forEach(function (f, i) { Snd.tone(f, i * 0.07, 0.2, 0.2, 'triangle'); }); }
        else if (k === 'win') { [523, 659, 784, 1047, 1319].forEach(function (f, i) { Snd.tone(f, i * 0.09, 0.45, 0.22, 'triangle'); }); }
        else if (k === 'lose') { [392, 330, 262].forEach(function (f, i) { Snd.tone(f, i * 0.14, 0.4, 0.18, 'sine'); }); }
        else if (k === 'click') { this.tone(1200, 0, 0.04, 0.08, 'sine'); }
      } catch (e) { }
    }
  };
  document.addEventListener('pointerdown', function () { Snd.ensure(); }, true);

  // ---------- 语音报牌（Web Speech API） ----------
  var Voice = {
    supported: typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined',
    voices: [], cur: null, pending: null, failed: {}, log: [],
    MALE: /Kangkang|Yunxi|Yunyang|Yunjian|Yunxia|Yunye|Yunfeng|Yunhao|Yunze|Yunyi|Zhiwei|\bmale\b/i,
    isZh: function (v) { return /^zh/i.test(v.lang || '') || /Chinese/i.test(v.name); },
    rank: function (v) {
      var n = v.name, r;
      if (/Xiaoxiao/i.test(n)) r = 100;
      else if (/Xiaoyi/i.test(n)) r = 95;
      else if (/Online|Natural/i.test(n) && !this.MALE.test(n)) r = 80;
      else if (/Huihui/i.test(n)) r = 70;
      else if (/Yaoyao/i.test(n)) r = 60;
      else if (!this.MALE.test(n)) r = 50;
      else r = 10;
      if (/^zh[-_]CN/i.test(v.lang || '') || /Simplified|Mainland/i.test(n)) r += 5;
      if (this.failed[n]) r -= 200;
      return r;
    },
    load: function () {
      if (!this.supported) return;
      var self = this;
      this.voices = speechSynthesis.getVoices().filter(function (v) { return self.isZh(v); })
        .sort(function (a, b) { return self.rank(b) - self.rank(a); });
      fillVoiceSelect();
    },
    pick: function () {
      var self = this;
      if (settings.voiceName) {
        var v = this.voices.find(function (x) { return x.name === settings.voiceName; });
        if (v && !self.failed[v.name]) return v;
      }
      var best = this.voices.slice().sort(function (a, b) { return self.rank(b) - self.rank(a); })[0];
      return best || null;
    },
    enabled: function () { return this.supported && settings.voice === '1' && settings.mute !== '1' && !AUTO; },
    // pri: 0 = 报牌（可被打断）；1 = 吃碰杠听（不被报牌打断）；2 = 和牌/流局
    say: function (text, pri) {
      this.log.push(text); if (this.log.length > 200) this.log.shift();
      if (!this.enabled()) return;
      var item = { text: text, pri: pri || 0, t: Date.now() };
      if (!this.cur) { this._speak(item); return; }
      if (this.cur.pri === 0 || item.pri > this.cur.pri) { this._speak(item, true); return; }
      if (!this.pending || this.pending.pri <= item.pri) this.pending = item;
    },
    _speak: function (item, interrupt) {
      var self = this, ss = window.speechSynthesis;
      try {
        if (interrupt || ss.speaking || ss.pending) ss.cancel();
        var u = new SpeechSynthesisUtterance(item.text), v = this.pick();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'zh-CN';
        u.pitch = 1.1; u.rate = 1.0;
        u.volume = Math.max(0, Math.min(1, (parseInt(settings.voiceVol, 10) || 0) / 100));
        item.voice = v;
        this.cur = item; Snd.level();
        u.onend = function () { self._done(item); };
        u.onerror = function (e) {
          var err = e && e.error;
          if (err === 'interrupted' || err === 'canceled') { self._done(item); return; }
          // 在线语音（如 Xiaoxiao）断网失败时，退回到本机语音（Huihui）再说一次
          if (v && !v.localService && !item.retry) { self.failed[v.name] = 1; item.retry = 1; self.cur = null; self._speak(item); return; }
          self._done(item);
        };
        item.timer = setTimeout(function () { self._done(item); }, 2500 + item.text.length * 400);
        ss.speak(u);
      } catch (e) { this.cur = null; Snd.level(); }
    },
    _done: function (item) {
      clearTimeout(item.timer);
      if (this.cur !== item) return;
      this.cur = null; Snd.level();
      var p = this.pending; this.pending = null;
      if (p && Date.now() - p.t < 2500) this._speak(p);
    },
    stop: function () {
      this.pending = null; var c = this.cur; this.cur = null; if (c) clearTimeout(c.timer);
      if (this.supported) try { speechSynthesis.cancel(); } catch (e) { }
      Snd.level();
    }
  };
  function fillVoiceSelect() {
    var sel = $('voiceSel'); if (!sel) return;
    clear(sel);
    var o = document.createElement('option'); o.value = '';
    var auto = Voice.pick();
    o.textContent = '自动（推荐）' + (auto && !settings.voiceName ? ' · ' + shortVoice(auto) : '');
    sel.appendChild(o);
    Voice.voices.forEach(function (v) {
      var x = document.createElement('option'); x.value = v.name;
      x.textContent = shortVoice(v) + (v.localService ? '（本机）' : '（在线）');
      sel.appendChild(x);
    });
    sel.value = Voice.voices.some(function (v) { return v.name === settings.voiceName; }) ? settings.voiceName : '';
    sel.disabled = !Voice.voices.length;
    if (!Voice.voices.length) o.textContent = Voice.supported ? '未找到中文语音' : '此浏览器不支持语音';
  }
  function shortVoice(v) {
    var m = /Microsoft\s+(\w+)/i.exec(v.name), nm = m ? m[1] : v.name;
    var cn = { Xiaoxiao: '晓晓', Xiaoyi: '晓伊', Huihui: '慧慧', Yaoyao: '瑶瑶', Kangkang: '康康', Yunxi: '云希', Yunjian: '云健', Yunyang: '云扬', Yunxia: '云夏', Xiaobei: '晓北', Xiaoni: '晓妮', Xiaochen: '晓辰', Xiaohan: '晓涵', Xiaomo: '晓墨', Xiaorui: '晓睿', Xiaoxuan: '晓萱', Xiaoyan: '晓颜', HsiaoChen: '曉臻', HsiaoYu: '曉雨', HiuMaan: '曉曼', HiuGaai: '曉佳' };
    return (cn[nm] ? cn[nm] + ' ' : '') + nm + (/Natural/i.test(v.name) ? ' 自然' : '') + (/^zh[-_]CN/i.test(v.lang) ? '' : ' ' + v.lang);
  }
  if (Voice.supported) {
    Voice.load();
    try { speechSynthesis.addEventListener('voiceschanged', function () { Voice.load(); }); } catch (e) { speechSynthesis.onvoiceschanged = function () { Voice.load(); }; }
  }
  var tingSaid = [false, false];
  function isTing(p) {
    var pl = game.players[p];
    try { return MJ.getWaits(MJ.counts(pl.hand), pl.melds.length).length > 0; } catch (e) { return false; }
  }

  // ---------- 牌面 ----------
  function tileEl(t, size, cls) {
    var d = document.createElement('div');
    d.className = 'tile ' + size + (cls ? ' ' + cls : '');
    if (t === null || t === undefined || t < 0) { d.classList.add('back'); return d; }
    d.dataset.t = t;
    if (t < 9) d.innerHTML = '<span class="n">' + MJ.NUMS[t] + '</span><span class="w">萬</span>';
    else if (t <= 12) d.innerHTML = '<span class="h wind">' + '東南西北'[t - 9] + '</span>';
    else if (t === 13) d.innerHTML = '<span class="h zhong">中</span>';
    else if (t === 14) d.innerHTML = '<span class="h fa">發</span>';
    else if (t === 15) d.innerHTML = '<span class="bai"></span>';
    else {
      var i = t - 16;
      d.classList.add(i < 4 ? 'season' : 'plant');
      d.innerHTML = '<span class="fl">' + '春夏秋冬梅兰竹菊'[i] + '</span><span class="fl-tag">' + (i % 4 + 1) + '</span>';
    }
    d.title = MJ.tileName(t);
    return d;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // ---------- 渲染 ----------
  function seatOf(p) { return p === viewer ? 'bottom' : 'top'; }
  function render() {
    if (!game) return;
    var bot = viewer, top = 1 - viewer;
    renderTopbar();
    renderBadge(bot, $('badge0'));
    renderBadge(top, $('badge1'));
    renderHandBottom(bot);
    renderHandTop(top);
    renderMelds(bot, $('melds0'), !handoffPending || revealAll);
    renderMelds(top, $('melds1'), revealAll);
    renderPool(bot, $('pool0'));
    renderPool(top, $('pool1'));
    renderCompass();
    renderActions();
    renderLog();
    animDraw = null; animMeld = null;
  }
  function renderTopbar() {
    var g = game;
    $('roundInfo').innerHTML =
      '<span class="chip"><b>' + '东南西北'[g.windIdx] + '风圈</b></span>' +
      '<span class="chip">第 <b>' + g.handNo + '</b> 局</span>' +
      '<span class="chip">庄家 <b>' + nameOf(g.dealer) + '</b></span>' +
      '<span class="chip">起和 <b>' + g.opts.minFan + '</b> 番</span>';
  }
  function renderBadge(p, el) {
    var g = game, pl = g.players[p];
    var active = g.phase !== 'over' && g.pending() === p;
    el.classList.toggle('active', active);
    var av = activeMode === 'hotseat' ? (p === 0 ? '甲' : '乙') : (p === 0 ? '我' : '电');
    var sc = g.scores[p];
    var html = '<div class="row1"><div class="avatar' + (activeMode !== 'hotseat' && p === 1 ? ' ai' : '') + '">' + av + '</div><div><div class="nm">' + nameOf(p) + '</div>' +
      '<div class="tags"><span class="tag">' + windCh(pl.seatWind) + '家</span>' + (g.dealer === p ? '<span class="tag dealer">庄</span>' : '') +
      '<span class="tag">' + pl.hand.length + ' 张</span></div></div></div>' +
      '<div class="score"><span class="l">积分</span><span class="v' + (sc < 0 ? ' neg' : '') + '">' + (sc > 0 ? '+' : '') + sc + '</span></div>';
    el.innerHTML = html;
    if (pl.flowers.length) {
      var fw = document.createElement('div'); fw.className = 'flowers';
      pl.flowers.forEach(function (f) { fw.appendChild(tileEl(f, 't-mini')); });
      el.appendChild(fw);
    }
    // 听牌显示（仅对自己可见）
    var canSee = (p === viewer && !handoffPending) || revealAll || AUTO;
    if (canSee && g.phase !== 'over') {
      var len = pl.hand.length + pl.melds.length * 3;
      if (len === 13) {
        var w = MJ.getWaits(MJ.counts(pl.hand), pl.melds.length);
        if (w.length) {
          var tw = document.createElement('div'); tw.className = 'ting';
          tw.appendChild(document.createTextNode('听牌：'));
          w.forEach(function (t) { tw.appendChild(tileEl(t, 't-mini')); });
          el.appendChild(tw);
        }
      }
    }
  }
  function sortedWithDrawn(p) {
    var g = game, pl = g.players[p], tiles = MJ.sortTiles(pl.hand), drawn = -1;
    if (g.phase === 'act' && g.cur === p && g.drawn !== null && g.drawn !== undefined) {
      var i = tiles.lastIndexOf(g.drawn);
      if (i >= 0) { tiles.splice(i, 1); tiles.push(g.drawn); drawn = tiles.length - 1; }
    }
    return { tiles: tiles, drawn: drawn };
  }
  function interactive(p) {
    var g = game;
    return !AUTO && !handoffPending && g.phase === 'act' && g.cur === p && isHuman(p) && p === viewer;
  }
  function computeTing(p) {
    var g = game, pl = g.players[p], c = MJ.counts(pl.hand), m = pl.melds.length;
    var unseen = EN.unseenFor(g, p), res = {};
    for (var t = 0; t < 16; t++) {
      if (!c[t]) continue;
      c[t]--;
      var w = MJ.getWaits(c, m);
      if (w.length) {
        var info = w.map(function (x) {
          var hand = [];
          for (var k = 0; k < 16; k++) for (var j = 0; j < c[k]; j++) hand.push(k);
          hand.push(x);
          var r = MJ.calcFan({ hand: hand, melds: pl.melds, winTile: x, selfDraw: false, seatWind: pl.seatWind, roundWind: g.roundWind,
            lastTile: false, afterKong: false, robKong: false, juezhang: false, flowers: pl.flowers.length });
          return { t: x, left: unseen[x], fan: r ? r.totalNoFlower : 0 };
        });
        res[t] = info;
      }
      c[t]++;
    }
    return res;
  }
  function renderHandBottom(p) {
    var g = game, el = $('hand0'), pl = g.players[p];
    clear(el);
    var show = (!handoffPending) || revealAll;
    var inter = interactive(p);
    el.classList.toggle('mine', inter);
    el.classList.toggle('locked', !inter);
    var sw = sortedWithDrawn(p);
    tingCache = inter ? computeTing(p) : null;
    if (selIdx !== null && (!inter || selIdx >= sw.tiles.length)) selIdx = null;
    sw.tiles.forEach(function (t, i) {
      var d = tileEl(show ? t : null, 't-lg');
      if (i === sw.drawn) { d.classList.add('drawn'); if (animDraw === p) d.classList.add('anim-draw'); }
      if (inter) {
        if (tingCache[t]) d.classList.add('ting');
        if (selIdx === i) d.classList.add('sel');
        d.addEventListener('click', function (ev) { onTileClick(i, t, d); });
        d.addEventListener('mouseenter', function () { showHint(t); });
        d.addEventListener('mouseleave', function () { showHint(selIdx !== null ? sw.tiles[selIdx] : null); });
      }
      el.appendChild(d);
    });
    if (inter && selIdx !== null) showHint(sw.tiles[selIdx]); else if (!inter) hideHint();
  }
  function renderHandTop(p) {
    var g = game, el = $('hand1');
    clear(el);
    var show = revealAll || AUTO;
    var sw = sortedWithDrawn(p);
    sw.tiles.forEach(function (t, i) {
      var d = tileEl(show ? t : null, 't-md');
      if (i === sw.drawn) { d.classList.add('drawn'); if (animDraw === p) d.classList.add('anim-draw'); }
      el.appendChild(d);
    });
  }
  function renderMelds(p, el, own) {
    var g = game, pl = g.players[p];
    clear(el);
    var size = p === viewer ? 't-md' : 't-sm';
    pl.melds.forEach(function (md, mi) {
      var box = document.createElement('div'); box.className = 'meld';
      if (animMeld === p && mi === pl.melds.length - 1) box.classList.add('anim-meld');
      var claimedDone = false;
      md.tiles.forEach(function (t, i) {
        var face = t;
        if (md.type === 'agang') face = ((own || revealAll || AUTO) && (i === 1 || i === 2)) ? t : null;
        var d = tileEl(face, size);
        if (md.type !== 'agang' && !claimedDone && t === md.claimed && md.from !== p) { d.classList.add('claimed'); claimedDone = true; }
        box.appendChild(d);
      });
      el.appendChild(box);
    });
  }
  function renderPool(p, el) {
    var g = game, pl = g.players[p];
    clear(el);
    var ld = g.lastDiscard;
    pl.discards.forEach(function (t, i) {
      var d = tileEl(t, 't-sm');
      if (ld && ld.from === p && !ld.claimed && ld.idx === i && i === pl.discards.length - 1 && g.phase !== 'over') d.classList.add('last');
      el.appendChild(d);
    });
  }
  function renderCompass() {
    var g = game, el = $('compass'), top = 1 - viewer, bot = viewer;
    var act = g.phase === 'over' ? -1 : g.pending();
    el.innerHTML =
      '<div class="seat-wind' + (act === top ? ' active' : '') + '"><div class="wd">' + windCh(g.players[top].seatWind) + '</div><div class="lb">' + nameOf(top) + '</div></div>' +
      '<div class="mid"><div class="wall-n">' + g.wall.length + '</div><div class="wall-l">余 牌</div><div class="rw">' + '东南西北'[g.windIdx] + '风圈 · 第' + g.handNo + '局</div></div>' +
      '<div class="seat-wind' + (act === bot ? ' active' : '') + '"><div class="wd">' + windCh(g.players[bot].seatWind) + '</div><div class="lb">' + nameOf(bot) + '</div></div>' +
      (act === top ? '<div class="arrow up"></div>' : act === bot ? '<div class="arrow down"></div>' : '');
  }
  function renderLog() {
    var el = $('log'); clear(el);
    logLines.slice(0, 8).forEach(function (l) { var d = document.createElement('div'); d.textContent = l; el.appendChild(d); });
  }
  function addLog(s) { logLines.unshift(s); if (logLines.length > 30) logLines.pop(); }

  // ---------- 提示 ----------
  function showHint(t) {
    var el = $('hint');
    if (t === null || t === undefined || !tingCache || !tingCache[t]) {
      if (tingCache && Object.keys(tingCache).length === 0 && selIdx === null) { hideHint(); return; }
      if (t === null || t === undefined) { hideHint(); return; }
      el.innerHTML = '<span class="msg">打出 ' + MJ.tileName(t) + ' 后未听牌</span>' + (selIdx !== null ? '<span>· 再点一次出牌</span>' : '');
      el.classList.add('show'); return;
    }
    clear(el);
    var info = tingCache[t];
    var msg = document.createElement('span'); msg.className = 'msg';
    msg.textContent = '打出 ' + MJ.tileName(t) + ' 听：'; el.appendChild(msg);
    var total = 0;
    info.forEach(function (w) {
      total += w.left;
      var box = document.createElement('div'); box.className = 'wt';
      box.appendChild(tileEl(w.t, 't-mini'));
      var i = document.createElement('i');
      i.textContent = '余' + w.left + ' · ' + (w.fan >= game.opts.minFan ? w.fan + '番' : '不够番');
      box.appendChild(i); el.appendChild(box);
    });
    var s = document.createElement('span'); s.textContent = '共 ' + total + ' 张' + (selIdx !== null ? ' · 再点一次出牌' : '');
    el.appendChild(s);
    el.classList.add('show');
  }
  function hideHint() { $('hint').classList.remove('show'); }

  // ---------- 操作 ----------
  function onTileClick(i, t, el) {
    if (!interactive(viewer)) return;
    if (selIdx === i) {
      var rect = el.getBoundingClientRect();
      selIdx = null; hideHint();
      act(viewer, { type: 'discard', tile: t }, rect);
      return;
    }
    selIdx = i;
    Snd.play('click');
    var kids = $('hand0').children;
    for (var k = 0; k < kids.length; k++) kids[k].classList.toggle('sel', k === i);
    showHint(t);
  }
  function mkBtn(cls, text, sub, fn) {
    var b = document.createElement('button'); b.className = 'abtn ' + cls;
    b.innerHTML = text + (sub ? '<small>' + sub + '</small>' : '');
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    return b;
  }
  function choiceGroup(label, list) {
    var g = document.createElement('div'); g.className = 'choice-group';
    var l = document.createElement('span'); l.className = 'cg-label'; l.textContent = label; g.appendChild(l);
    list.forEach(function (it) {
      var c = document.createElement('div'); c.className = 'choice';
      it.tiles.forEach(function (t) { c.appendChild(tileEl(t, 't-xs')); });
      c.addEventListener('click', function (e) { e.stopPropagation(); it.fn(); });
      g.appendChild(c);
    });
    return g;
  }
  var chiExpanded = false, gangExpanded = false;
  function renderActions() {
    var el = $('actions'); clear(el);
    var g = game;
    if (AUTO || g.phase === 'over' || handoffPending) return;
    var p = g.pending();
    if (p !== viewer || !isHuman(p)) return;
    var acts = g.actions(p);
    var me = viewer;
    function doA(a) { return function () { chiExpanded = gangExpanded = false; act(me, a); }; }
    if (g.phase === 'act') {
      var kongs = acts.filter(function (a) { return a.type === 'angang' || a.type === 'jiagang'; });
      if (kongs.length === 1) el.appendChild(mkBtn('gang', '杠', kongs[0].type === 'angang' ? '暗杠' : '加杠', doA(kongs[0])));
      else if (kongs.length > 1) {
        if (gangExpanded) el.appendChild(choiceGroup('杠', kongs.map(function (a) { return { tiles: [a.tile, a.tile, a.tile, a.tile], fn: doA(a) }; })));
        else el.appendChild(mkBtn('gang', '杠', '', function () { gangExpanded = true; renderActions(); }));
      }
      var ts = acts.find(function (a) { return a.type === 'tsumo'; });
      if (ts) el.appendChild(mkBtn('hu', '自摸', ts.result.total + ' 番', doA(ts)));
      return;
    }
    var chis = acts.filter(function (a) { return a.type === 'chi'; });
    if (chis.length) {
      if (chis.length === 1) el.appendChild(mkBtn('chi', '吃', '', doA(chis[0])));
      else if (chiExpanded) el.appendChild(choiceGroup('吃', chis.map(function (a) { return { tiles: [a.start, a.start + 1, a.start + 2], fn: doA(a) }; })));
      else el.appendChild(mkBtn('chi', '吃', '', function () { chiExpanded = true; renderActions(); }));
    }
    acts.forEach(function (a) {
      if (a.type === 'peng') el.appendChild(mkBtn('peng', '碰', '', doA(a)));
      if (a.type === 'gang') el.appendChild(mkBtn('gang', '杠', '明杠', doA(a)));
    });
    var ron = acts.find(function (a) { return a.type === 'ron'; });
    if (ron) el.appendChild(mkBtn('hu', '和', ron.result.total + ' 番', doA(ron)));
    el.appendChild(mkBtn('pass', '过', '', doA({ type: 'pass' })));
  }

  function aiSourceRect(p) {
    var kids = $('hand1').children;
    if (!kids.length) return null;
    var k = kids[Math.floor(Math.random() * kids.length)];
    return k.getBoundingClientRect();
  }
  function act(p, a, srcRect) {
    clearTimeout(timer);
    if (a.type === 'discard') fly = { p: p, rect: srcRect || null };
    try { game.apply(p, a); } catch (e) { console.error(e); return; }
    selIdx = null; chiExpanded = gangExpanded = false;
    processEvents();
    render();
    doFly();
    schedule();
  }
  function toast(text, seat, cls) {
    var t = document.createElement('div');
    t.className = 'toast ' + seat + (cls ? ' ' + cls : '');
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 1200);
  }
  function processEvents() {
    var evs = game.events;
    for (; evIdx < evs.length; evIdx++) {
      var e = evs[evIdx], nm = e.p !== undefined ? nameOf(e.p) : '', seat = e.p !== undefined ? seatOf(e.p) : 'center';
      switch (e.type) {
        case 'newRound': addLog('—— 第 ' + game.handNo + ' 局开始 ——'); tingSaid = [false, false]; Voice.stop(); break;
        case 'draw': animDraw = e.p; Snd.play('draw'); break;
        case 'flower': addLog(nm + ' 补花 ' + MJ.tileName(e.tile)); toast('补花', seat); Voice.say('补花', 0); break;
        case 'discard': addLog(nm + ' 打出 ' + MJ.tileName(e.tile)); Snd.play('clack');
          if (isHuman(e.p) && !tingSaid[e.p] && isTing(e.p)) { tingSaid[e.p] = true; addLog(nm + ' 听牌'); Voice.say(MJ.speakName(e.tile) + '，听', 1); }
          else Voice.say(MJ.speakName(e.tile), 0);
          break;
        case 'peng': addLog(nm + ' 碰 ' + MJ.tileName(e.tile)); toast('碰', seat); animMeld = e.p; Snd.play('claim'); Voice.say('碰', 1); break;
        case 'chi': addLog(nm + ' 吃 ' + MJ.tileName(e.tile)); toast('吃', seat); animMeld = e.p; Snd.play('claim'); Voice.say('吃', 1); break;
        case 'gang': addLog(nm + ' 明杠 ' + MJ.tileName(e.tile)); toast('杠', seat); animMeld = e.p; Snd.play('kong'); Voice.say('杠', 1); break;
        case 'angang': addLog(nm + ' 暗杠'); toast('暗杠', seat); animMeld = e.p; Snd.play('kong'); Voice.say('杠', 1); break;
        case 'jiagangTry': addLog(nm + ' 加杠 ' + MJ.tileName(e.tile)); Voice.say('杠', 1); break;
        case 'jiagang': toast('加杠', seat); animMeld = e.p; Snd.play('kong'); break;
        case 'win': addLog(nm + (e.selfDraw ? ' 自摸和牌！' : ' 和牌！')); toast(e.selfDraw ? '自摸' : '和', seat, 'hu'); Voice.say(e.selfDraw ? '自摸' : '胡了', 2);
          Snd.play(activeMode === 'ai' && e.p === 1 ? 'lose' : 'win'); break;
        case 'drawGame': addLog('牌墙摸完，流局'); toast('流局', 'center'); Snd.play('lose'); Voice.say('流局', 2); break;
      }
    }
  }
  function doFly() {
    if (!fly) return;
    var f = fly; fly = null;
    if (!f.rect) return;
    var pool = f.p === viewer ? $('pool0') : $('pool1');
    var last = pool.lastElementChild;
    if (!last) return;
    var r = last.getBoundingClientRect();
    var dx = (f.rect.left + f.rect.width / 2 - (r.left + r.width / 2)) / scale;
    var dy = (f.rect.top + f.rect.height / 2 - (r.top + r.height / 2)) / scale;
    var sc = f.rect.width / r.width;
    last.style.transition = 'none';
    last.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')';
    void last.offsetWidth;
    last.classList.add('fly');
    last.style.transition = '';
    last.style.transform = '';
    setTimeout(function () { last.classList.remove('fly'); }, 400);
  }
  function schedule() {
    clearTimeout(timer);
    var g = game;
    if (g.phase === 'over') { onRoundOver(); return; }
    var p = g.pending(), acts = g.actions(p), sp = parseFloat(settings.speed) || 1;
    if (!isHuman(p)) {
      var delay = (g.phase === 'act' ? 700 : 480) * sp;
      timer = setTimeout(function () {
        var a = EN.aiDecide(g, p);
        act(p, a, a.type === 'discard' ? (p === viewer ? null : aiSourceRect(p)) : null);
      }, delay);
      return;
    }
    if (g.phase !== 'act' && acts.length === 1) { timer = setTimeout(function () { act(p, { type: 'pass' }); }, 240); return; }
    if (activeMode === 'hotseat' && viewer !== p) { showHandoff(p); return; }
  }
  function showHandoff(p) {
    handoffPending = true;
    render();
    $('handoffTitle').textContent = '轮到 ' + nameOf(p);
    var g = game;
    $('handoffSub').textContent = (g.phase === 'act' ? '该你摸牌出牌了' : '对方打出 ' + MJ.tileName(g.phase === 'rob' ? g.rob.tile : g.lastDiscard.tile) + '，你可以操作') + '。请对方回避后再查看手牌。';
    $('handoff').classList.add('show');
    $('handoffBtn').onclick = function () {
      $('handoff').classList.remove('show');
      viewer = p; handoffPending = false;
      render();
    };
  }
  function onRoundOver() {
    revealAll = true; handoffPending = false; $('handoff').classList.remove('show');
    render();
    var r = game.result;
    if (r.type === 'win') {
      var w = r.winner;
      [w, 1 - w].forEach(function (p) {
        var badge = p === viewer ? $('badge0') : $('badge1');
        var d = document.createElement('div'); d.className = 'delta';
        d.style.color = p === w ? '#7dff9e' : '#ff8f80';
        d.textContent = (p === w ? '+' : '−') + r.pay; badge.appendChild(d);
      });
    }
    timer = setTimeout(showSettle, AUTO ? 300 : 1300);
  }

  // ---------- 结算 ----------
  function groupEl(tiles, cls) {
    var g = document.createElement('div'); g.className = 'grp';
    tiles.forEach(function (t) { g.appendChild(tileEl(t, 't-md', cls)); });
    return g;
  }
  function handLine(p, winTile) {
    var g = game, pl = g.players[p], line = document.createElement('div'); line.className = 'line';
    var lb = document.createElement('span'); lb.className = 'lbl'; lb.textContent = nameOf(p); line.appendChild(lb);
    pl.melds.forEach(function (md) { line.appendChild(groupEl(md.tiles)); });
    var hand = MJ.sortTiles(pl.hand);
    line.appendChild(groupEl(hand));
    if (winTile !== undefined) {
      var wg = groupEl([winTile]); wg.firstChild.classList.add('win'); line.appendChild(wg);
    }
    return line;
  }
  function showSettle() {
    var r = game.result, g = game;
    var rib = $('settleRibbon'), who = $('settleWho'), hand = $('settleHand'), list = $('fanList'), tot = $('fanTotal'), sc = $('scoreChange');
    clear(hand); clear(list); hand.className = 'settle-hand';
    if (r.type === 'draw') {
      rib.textContent = '流 局'; rib.className = 'settle-ribbon draw';
      who.innerHTML = '牌墙已摸完，无人和牌。' + (g.dealer === r.dealer ? '庄家 <b>' + nameOf(r.dealer) + '</b> 连庄。' : '');
      hand.classList.add('two');
      [1 - viewer, viewer].forEach(function (p) { hand.appendChild(handLine(p)); });
      list.innerHTML = '<div class="draw-msg" style="grid-column:1/3">本局不计分</div>';
      tot.innerHTML = '<div class="l">本局</div><div class="v" style="font-size:40px">0<small>番</small></div>';
    } else {
      var w = r.winner, pl = g.players[w];
      rib.textContent = r.selfDraw ? '自 摸' : (r.robKong ? '抢 杠' : '和 牌');
      rib.className = 'settle-ribbon';
      who.innerHTML = '<b>' + nameOf(w) + '</b> ' + (r.selfDraw ? '自摸 ' : '和了 ' + nameOf(r.payer) + ' 打出的 ') + '<b>' + MJ.tileName(r.tile) + '</b>' +
        (r.winner === r.dealer ? '（庄家连庄）' : '（下局换庄）');
      var line = document.createElement('div'); line.className = 'line';
      r.melds.forEach(function (md) { line.appendChild(groupEl(md.tiles)); });
      var rest = r.hand.slice(); rest.splice(rest.lastIndexOf(r.tile), 1);
      line.appendChild(groupEl(MJ.sortTiles(rest)));
      var wg = groupEl([r.tile]); wg.firstChild.classList.add('win'); line.appendChild(wg);
      if (r.flowers.length) line.appendChild(groupEl(r.flowers));
      hand.appendChild(line);
      var fans = r.fan.fans.slice().sort(function (a, b) { return b.fan * b.count - a.fan * a.count; });
      fans.forEach(function (f, i) {
        var it = document.createElement('div'); it.className = 'fan-item' + (f.fan >= 24 ? ' big' : '');
        it.style.animationDelay = (0.15 + i * 0.07) + 's';
        it.innerHTML = '<span class="fn">' + f.name + (f.count > 1 ? '<small>×' + f.count + '</small>' : '') + '</span><span class="fv">' + (f.fan * f.count) + ' 番</span>';
        list.appendChild(it);
      });
      tot.innerHTML = '<div class="l">合 计</div><div class="v">' + r.fan.total + '<small>番</small></div><div class="f">计分 = 底分 8 + ' + r.fan.total + ' 番 = ' + r.pay + ' 分</div>';
    }
    var html = '';
    [viewer, 1 - viewer].forEach(function (p) {
      var d = r.type === 'win' ? (p === r.winner ? r.pay : -r.pay) : 0;
      html += '<div class="sr"><span>' + nameOf(p) + '</span><span><span class="d ' + (d > 0 ? 'pos' : d < 0 ? 'neg' : '') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + '</span><span class="tot">总分 ' + g.scores[p] + '</span></span></div>';
    });
    sc.innerHTML = html;
    $('settle').classList.add('show');
    $('btnBackToSettle').classList.remove('show');
  }
  $('btnNext').addEventListener('click', function () { nextRound(); });
  $('btnSettleView').addEventListener('click', function () { $('settle').classList.remove('show'); $('btnBackToSettle').classList.add('show'); });
  $('btnBackToSettle').addEventListener('click', function () { $('settle').classList.add('show'); $('btnBackToSettle').classList.remove('show'); });
  function nextRound() {
    $('settle').classList.remove('show'); $('btnBackToSettle').classList.remove('show');
    revealAll = false; selIdx = null;
    game.newRound(); evIdx = 0;
    if (activeMode !== 'hotseat') viewer = 0;
    processEvents(); render(); schedule();
  }

  // ---------- 新游戏 / 设置 ----------
  function newGame() {
    clearTimeout(timer);
    activeMode = AUTO ? 'ai' : settings.mode;
    game = new EN.Game({ minFan: parseInt(settings.minFan, 10) || 1, flowers: settings.flowers === '1' });
    viewer = 0; handoffPending = false; revealAll = false; selIdx = null; logLines = []; evIdx = 0;
    ['settle', 'handoff', 'startScreen', 'settings', 'help', 'confirm'].forEach(function (id) { $(id).classList.remove('show'); });
    $('btnBackToSettle').classList.remove('show');
    game.newRound();
    processEvents(); render(); schedule();
  }
  function syncSegs() {
    document.querySelectorAll('.seg').forEach(function (seg) {
      var k = seg.dataset.key;
      seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', String(settings[k]) === b.dataset.v); });
    });
    $('btnSound').textContent = settings.mute !== '1' ? '🔊' : '🔇';
    $('btnSound').title = settings.mute !== '1' ? '静音（音效与语音）' : '取消静音';
    $('btnSound').classList.toggle('muted', settings.mute === '1');
    var vr = $('voiceVol'); if (vr) { vr.value = settings.voiceVol; $('voiceVolTxt').textContent = settings.voiceVol + '%'; }
    fillVoiceSelect();
  }
  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      settings[seg.dataset.key] = b.dataset.v; saveSettings(); syncSegs(); Snd.level(); if (seg.dataset.key === 'voice' && settings.voice !== '1') Voice.stop(); Snd.play('click');
    });
  });
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { settings.mode = b.dataset.mode; saveSettings(); syncSegs(); newGame(); });
  });
  function confirmBox(text, yes) {
    $('confirmText').textContent = text; $('confirm').classList.add('show');
    $('confirmYes').onclick = function () { $('confirm').classList.remove('show'); yes(); };
    $('confirmNo').onclick = function () { $('confirm').classList.remove('show'); };
  }
  $('btnNew').addEventListener('click', function () {
    if (!game) { $('startScreen').classList.add('show'); return; }
    confirmBox('确定要开始新游戏吗？当前积分将清零。', function () { clearTimeout(timer); game = null; $('startScreen').classList.add('show'); });
  });
  $('btnSettings').addEventListener('click', function () { syncSegs(); $('settings').classList.add('show'); });
  $('btnApply').addEventListener('click', function () {
    $('settings').classList.remove('show');
    if (!game) return;
    confirmBox('应用设置并开始新游戏？当前积分将清零。', newGame);
  });
  $('btnHelp').addEventListener('click', function () { $('help').classList.add('show'); });
  $('btnSound').addEventListener('click', function () { settings.mute = settings.mute === '1' ? '0' : '1'; saveSettings(); syncSegs(); if (settings.mute === '1') Voice.stop(); Snd.ensure(); Snd.play('click'); });
  $('voiceSel').addEventListener('change', function () { settings.voiceName = this.value; saveSettings(); fillVoiceSelect(); Voice.stop(); Voice.say('三万', 0); });
  $('voiceVol').addEventListener('input', function () { settings.voiceVol = this.value; $('voiceVolTxt').textContent = this.value + '%'; saveSettings(); });
  $('voiceVol').addEventListener('change', function () { Voice.stop(); Voice.say('红中', 0); });
  $('btnVoiceTest').addEventListener('click', function () {
    Snd.ensure(); Voice.stop();
    if (settings.voice !== '1') { toast('请先打开语音报牌', 'center'); return; }
    if (settings.mute === '1') { toast('当前已静音', 'center'); return; }
    ['三万', '东风', '碰', '发财，听', '自摸'].forEach(function (t, i) { Voice.say(t, i ? 1 : 0); });
  });
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { $(b.dataset.close).classList.remove('show'); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') ['help', 'settings', 'confirm'].forEach(function (id) { $(id).classList.remove('show'); });
  });

  // 番种说明
  (function buildHelp() {
    var body = $('helpBody');
    var html = '<div class="rules"><b>牌张：</b>万字牌 1–9 各 4 张 + 东南西北 + 中发白，共 64 张（可选加入春夏秋冬梅兰竹菊 8 张花牌）。' +
      '<br><b>玩法：</b>每人 13 张，庄家先摸。可以吃（对方打出的牌）、碰、明杠、暗杠、加杠；四副面子加一对将，或七对，即可和牌。牌墙摸完未和则流局。' +
      '<br><b>计分：</b>按国标规则数番，取最大番数的组牌方式，并遵循“不重复计番”原则。和牌者得 <b>底分 8 + 总番数</b>，由放炮者（自摸时由对方）支付。花牌番不计入起和番。' +
      '<br><b>轮庄：</b>庄家和牌或流局则连庄，闲家和牌则换庄；双方各坐庄一次后进入下一风圈。<b>操作：</b>点击手牌选中，再点一次打出；标有「听」的牌打出后即可听牌。</div>';
    var groups = {};
    MJ.FAN_INFO.forEach(function (f) { (groups[f[1]] = groups[f[1]] || []).push(f); });
    Object.keys(groups).map(Number).sort(function (a, b) { return b - a; }).forEach(function (v) {
      html += '<div class="fan-group"><h3><span>' + v + ' 番</span></h3><div class="fan-grid">';
      groups[v].forEach(function (f) { html += '<div class="fan-def"><b>' + f[0] + '</b>' + f[2] + '</div>'; });
      html += '</div></div>';
    });
    body.innerHTML = html;
  })();
  (function startDeco() {
    var el = $('startTiles');
    [13, 14, 15, 9, 0].forEach(function (t) { el.appendChild(tileEl(t, 't-lg')); });
  })();

  syncSegs();
  window.__mj = { get game() { return game; }, voice: Voice, newGame: newGame, showSettle: showSettle, render: render, act: act, settings: settings,
    nextRound: nextRound, setViewer: function (v) { viewer = v; render(); } };
  if (AUTO) newGame();
})();
