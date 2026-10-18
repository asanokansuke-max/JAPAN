// 試合エンジン：1分刻みのシミュレーション
(function (root) {
  'use strict';

  // フォーメーション：[スロット, x(%), y(%)]  y=0が相手ゴール側
  const FORMATIONS = {
    '4-2-3-1': [['GK', 50, 92], ['LB', 14, 70], ['CB', 37, 76], ['CB', 63, 76], ['RB', 86, 70], ['DM', 37, 56], ['DM', 63, 56], ['LW', 16, 32], ['AM', 50, 37], ['RW', 84, 32], ['ST', 50, 14]],
    '4-3-3': [['GK', 50, 92], ['LB', 14, 70], ['CB', 37, 76], ['CB', 63, 76], ['RB', 86, 70], ['DM', 50, 59], ['CM', 30, 45], ['CM', 70, 45], ['LW', 17, 23], ['ST', 50, 14], ['RW', 83, 23]],
    '3-4-2-1': [['GK', 50, 92], ['CB', 27, 75], ['CB', 50, 78], ['CB', 73, 75], ['LWB', 10, 50], ['DM', 38, 56], ['DM', 62, 56], ['RWB', 90, 50], ['AM', 34, 31], ['AM', 66, 31], ['ST', 50, 14]],
    '4-4-2': [['GK', 50, 92], ['LB', 14, 70], ['CB', 37, 76], ['CB', 63, 76], ['RB', 86, 70], ['LM', 14, 43], ['CM', 38, 51], ['CM', 62, 51], ['RM', 86, 43], ['ST', 38, 17], ['ST', 62, 17]],
    '3-5-2': [['GK', 50, 92], ['CB', 27, 75], ['CB', 50, 78], ['CB', 73, 75], ['LWB', 10, 49], ['DM', 50, 59], ['CM', 31, 43], ['CM', 69, 43], ['RWB', 90, 49], ['ST', 38, 17], ['ST', 62, 17]]
  };

  const SLOT_LABEL = { GK: 'GK', CB: 'CB', LB: 'LSB', RB: 'RSB', LWB: 'LWB', RWB: 'RWB', DM: 'DMF', CM: 'CMF', AM: 'OMF', LM: 'LMF', RM: 'RMF', LW: 'LWG', RW: 'RWG', ST: 'CF' };
  const POS_LABEL = { GK: 'GK', CB: 'CB', LB: 'LSB', RB: 'RSB', DM: 'DMF', CM: 'CMF', AM: 'OMF', LW: 'LWG', RW: 'RWG', ST: 'CF' };
  const POS_GROUP = { GK: 'GK', CB: 'DF', LB: 'DF', RB: 'DF', DM: 'MF', CM: 'MF', AM: 'MF', LW: 'FW', RW: 'FW', ST: 'FW' };

  const SLOT_FIT = {
    GK: { GK: 1 },
    CB: { CB: 1, DM: 0.9, LB: 0.87, RB: 0.87 },
    LB: { LB: 1, RB: 0.9, CB: 0.86, LW: 0.84, DM: 0.78 },
    RB: { RB: 1, LB: 0.9, CB: 0.86, RW: 0.84, DM: 0.78 },
    LWB: { LB: 1, LW: 0.95, RB: 0.88, RW: 0.86, CB: 0.8, CM: 0.8 },
    RWB: { RB: 1, RW: 0.95, LB: 0.88, LW: 0.86, CB: 0.8, CM: 0.8 },
    DM: { DM: 1, CM: 0.94, CB: 0.86, AM: 0.8 },
    CM: { CM: 1, DM: 0.94, AM: 0.92, LW: 0.8, RW: 0.8 },
    AM: { AM: 1, CM: 0.9, LW: 0.9, RW: 0.9, ST: 0.86 },
    LM: { LW: 1, RW: 0.92, AM: 0.9, CM: 0.86, LB: 0.84 },
    RM: { RW: 1, LW: 0.92, AM: 0.9, CM: 0.86, RB: 0.84 },
    LW: { LW: 1, RW: 0.92, AM: 0.9, ST: 0.85, LB: 0.78 },
    RW: { RW: 1, LW: 0.92, AM: 0.9, ST: 0.85, RB: 0.78 },
    ST: { ST: 1, AM: 0.86, LW: 0.84, RW: 0.84 }
  };

  // スロットが各ラインに与える重み [守備, 中盤, 攻撃]
  const SLOT_W = {
    GK: [0, 0, 0], CB: [1, 0.1, 0], LB: [0.7, 0.3, 0.15], RB: [0.7, 0.3, 0.15], LWB: [0.5, 0.4, 0.3], RWB: [0.5, 0.4, 0.3],
    DM: [0.45, 0.8, 0.05], CM: [0.2, 1, 0.25], AM: [0, 0.6, 0.8], LM: [0.15, 0.6, 0.5], RM: [0.15, 0.6, 0.5],
    LW: [0, 0.3, 1], RW: [0, 0.3, 1], ST: [0, 0.15, 1]
  };
  const SHOOT_W = { GK: 0, CB: 0.25, LB: 0.4, RB: 0.4, LWB: 0.6, RWB: 0.6, DM: 0.4, CM: 0.9, AM: 2, LM: 1.4, RM: 1.4, LW: 2, RW: 2, ST: 3.2 };
  const ASSIST_W = { GK: 0.05, CB: 0.3, LB: 1, RB: 1, LWB: 1.2, RWB: 1.2, DM: 0.8, CM: 1.6, AM: 2.2, LM: 1.6, RM: 1.6, LW: 2, RW: 2, ST: 1 };
  const HEAD_W = { GK: 0, CB: 2.5, LB: 0.4, RB: 0.4, LWB: 0.4, RWB: 0.4, DM: 1, CM: 0.6, AM: 0.4, LM: 0.4, RM: 0.4, LW: 0.4, RW: 0.4, ST: 2 };
  const DEF_W = { GK: 0.1, CB: 2, LB: 1.5, RB: 1.5, LWB: 1.3, RWB: 1.3, DM: 2, CM: 1.2, AM: 0.6, LM: 0.8, RM: 0.8, LW: 0.5, RW: 0.5, ST: 0.5 };

  const MENT = { def: '守備的', bal: 'バランス', att: '攻撃的' };
  const STYLE = { bal: 'バランス', pos: 'ポゼッション', counter: 'カウンター', press: 'ハイプレス' };

  let rnd = Math.random;
  function setRandom(fn) { rnd = fn; }
  function normal(sd) { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * (sd || 1); }
  function pickW(list, wf) {
    let tot = 0; const ws = list.map(x => { const w = Math.max(0, wf(x)); tot += w; return w; });
    if (tot <= 0) return list[Math.floor(rnd() * list.length)];
    let r = rnd() * tot;
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const has = (p, t) => p.traits && p.traits.includes(t);

  function fit(p, slot) {
    if (!p) return 0;
    const tbl = SLOT_FIT[slot] || {};
    let f = tbl[p.pos] || 0;
    if (p.alt) for (const a of p.alt) { const af = tbl[a] ? Math.min(0.96, tbl[a]) : 0; if (af > f) f = af; }
    if (!f) f = (slot === 'GK' || p.pos === 'GK') ? 0.3 : 0.7;
    return f;
  }

  function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }

  // 日本以外の試合用の簡易シミュレーション
  function quickSim(ra, rb, homeAdv, knockout) {
    const d = ra - rb + (homeAdv || 0);
    const la = 1.3 * Math.exp(0.07 * d), lb = 1.3 * Math.exp(-0.07 * d);
    let ga = poisson(la), gb = poisson(lb), pens = null, winner = null;
    if (knockout && ga === gb) {
      ga += poisson(la / 3); gb += poisson(lb / 3);
      if (ga === gb) { const pa = 0.5 + d * 0.006; pens = rnd() < pa ? [5, 4] : [4, 5]; }
    }
    if (ga > gb || (pens && pens[0] > pens[1])) winner = 0; else if (gb > ga || pens) winner = 1;
    return { ga, gb, pens, winner };
  }

  class MatchSim {
    // spec: {code,name,players:[...],xi:[id×11],bench:[id],formation,tactics:{ment,style},bonus:{att,mid,def},setPiece,autoSub,isUser,chem,fam}
    constructor(home, away, opts) {
      this.opts = Object.assign({ neutral: false, knockout: false }, opts || {});
      this.minute = 0;
      this.phase = 'pre';
      this.score = [0, 0];
      this.pens = null;
      this.events = [];
      this.teams = [this._initTeam(home, 0), this._initTeam(away, 1)];
      this.possAcc = [0, 0];
    }

    _initTeam(spec, side) {
      const byId = {};
      spec.players.forEach(p => { byId[p.id] = p; });
      const slots = FORMATIONS[spec.formation];
      const onPitch = spec.xi.map((id, i) => this._entry(byId[id], slots[i][0]));
      return {
        spec, side, byId,
        onPitch,
        bench: spec.bench.map(id => byId[id]).filter(Boolean),
        out: [],
        subsLeft: 5,
        dayForm: normal(1.2),
        stats: { shots: 0, sot: 0, xg: 0, corners: 0, fouls: 0, yellow: 0, red: 0, saves: 0 },
        menDown: 0
      };
    }

    _entry(p, slot) {
      const cond = p.cond == null ? 100 : p.cond;
      return { p, slot, stamina: cond, yc: 0, sent: false, injured: false, rating: 0, goals: 0, assists: 0, shots: 0, sot: 0, saves: 0, minIn: this ? this.minute : 0, minOut: null };
    }

    eff(e) {
      if (e.sent) return 0;
      const p = e.p;
      let v = p.ovr * fit(p, e.slot) * (1 + (p.form || 0) * 0.012);
      if (e.stamina < 65) v *= 1 - (65 - e.stamina) * 0.004;
      if (e.injured) v *= 0.65;
      return v;
    }

    lines(t) {
      const opp = this.teams[1 - t.side];
      const acc = [0, 0, 0], ws = [0, 0, 0];
      let gk = 40;
      for (const e of t.onPitch) {
        if (e.sent) continue;
        if (e.slot === 'GK') { gk = this.eff(e); continue; }
        const w = SLOT_W[e.slot], v = this.eff(e);
        for (let i = 0; i < 3; i++) { acc[i] += w[i] * v; ws[i] += w[i]; }
      }
      const s = t.spec, b = s.bonus || {};
      let common = t.dayForm - t.menDown * 3.5;
      if (s.chem != null) common += (s.chem - 50) * 0.04;
      if (s.fam != null) common += (s.fam - 50) * 0.04;
      if (s.morale != null) common += (s.morale - 50) * 0.04;
      if (!this.opts.neutral && t.side === 0) common += 1.5;
      if (s.homeBoost) common += s.homeBoost;
      const L = {
        def: acc[0] / ws[0] + common + (b.def || 0),
        mid: acc[1] / ws[1] + common + (b.mid || 0),
        att: acc[2] / ws[2] + common + (b.att || 0),
        gk: gk + (b.gk || 0) + t.dayForm * 0.5
      };
      const m = s.tactics.ment;
      if (m === 'att') { L.att += 1.5; L.def -= 1.5; }
      if (m === 'def') { L.def += 2; L.att -= 2; }
      if (s.tactics.style === 'press') { const tired = this.minute > 65 ? -1.5 : 1.5; L.mid += tired; }
      if (s.tactics.style === 'pos') L.mid += 0.8;
      if (opp && opp.spec.tactics.style === 'press' && s.tactics.style === 'pos') L.mid -= 0.5;
      return L;
    }

    active(t) { return t.onPitch.filter(e => !e.sent); }

    log(side, type, text, extra) {
      const ev = Object.assign({ min: this.minute, side, type, text }, extra || {});
      this.events.push(ev);
      this._new.push(ev);
      return ev;
    }

    teamName(side) { return this.teams[side].spec.name; }

    start() {
      this.phase = 'first';
      this.log(-1, 'ko', `キックオフ！ ${this.teamName(0)} 対 ${this.teamName(1)}`);
    }

    // 1分進める。戻り値は新規イベント
    next() {
      this._new = [];
      if (this.phase === 'pre') { this.start(); return this._new; }
      if (this.phase === 'done' || this.phase === 'ht' || this.phase === 'ft90') return this._new;
      this.minute++;
      this._simMinute();
      if (this.minute === 45 && this.phase === 'first') {
        this.phase = 'ht';
        this.log(-1, 'ht', `前半終了 ${this.score[0]}-${this.score[1]}`);
      } else if (this.minute === 90 && this.phase === 'second') {
        if (this.opts.knockout && this.score[0] === this.score[1]) {
          this.phase = 'ft90';
          this.log(-1, 'ft90', `90分終了 ${this.score[0]}-${this.score[1]}。延長戦へ`);
          this.teams.forEach(t => { t.subsLeft += 1; });
        } else this._finish();
      } else if (this.minute === 120 && this.phase === 'et') {
        if (this.score[0] === this.score[1]) this._shootout();
        this._finish();
      }
      return this._new;
    }

    resume() {
      this._new = [];
      if (this.phase === 'ht') { this.phase = 'second'; this.log(-1, 'ko2', '後半キックオフ'); }
      else if (this.phase === 'ft90') { this.phase = 'et'; this.log(-1, 'ko2', '延長戦キックオフ'); }
      return this._new;
    }

    runToEnd() {
      let guard = 0;
      while (this.phase !== 'done' && guard++ < 400) {
        if (this.phase === 'ht' || this.phase === 'ft90') { this.aiHalfTime(); this.resume(); }
        this.next();
      }
      return this.result();
    }

    aiHalfTime() {
      for (const t of this.teams) {
        if (t.spec.isUser && !t.spec.autoSub) continue;
        // 前半の出来が悪い選手を交代
        const d = this.score[t.side] - this.score[1 - t.side];
        if (d < 0 && t.subsLeft > 2 && rnd() < 0.5) this._aiSub(t, 1, true);
      }
    }

    _simMinute() {
      const [A, B] = this.teams;
      const LA = this.lines(A), LB = this.lines(B);
      const sp = s => ({ pos: 0.05, counter: -0.05, press: 0.02, bal: 0 })[s.tactics.style] + ({ att: 0.02, def: -0.03, bal: 0 })[s.tactics.ment];
      let pA = 0.5 + 0.010 * (LA.mid - LB.mid) + sp(A.spec) - sp(B.spec);
      pA = clamp(pA, 0.28, 0.72);
      this.possAcc[0] += pA; this.possAcc[1] += 1 - pA;
      const P = [pA, 1 - pA], L = [LA, LB];

      for (let s = 0; s < 2; s++) {
        const X = this.teams[s], Y = this.teams[1 - s], LX = L[s], LY = L[1 - s];
        const xs = X.spec.tactics, ys = Y.spec.tactics;
        const diff = this.score[s] - this.score[1 - s];
        let rate = 11.5 / 90 * (P[s] / 0.5) * ({ def: 0.8, bal: 1, att: 1.18 })[xs.ment];
        if (ys.style === 'press') rate *= 0.94;
        if (xs.style === 'counter') rate *= 0.92;
        if (this.minute > 70 && diff < 0) rate *= 1.25;
        if (this.minute > 75 && diff > 0 && xs.ment !== 'att') rate *= 0.85;
        rate *= 1 - X.menDown * 0.12;
        if (rnd() < rate) this._shot(X, Y, LX, LY);
        if (rnd() < 0.05 * Math.sqrt(P[s] / 0.5)) this._setPiece(X, Y, LX, LY);
        if (rnd() < 0.0024 * Math.exp(0.02 * (LX.att - LY.def))) this._penalty(X, Y, LX, LY);
        if (rnd() < 0.0185 * (xs.style === 'press' ? 1.2 : 1)) this._card(X);
        for (const e of this.active(X)) {
          if (e.injured) continue;
          let ir = 0.00011 * (has(e.p, 'ガラスの体') ? 3 : 1) * (e.stamina < 40 ? 2 : 1);
          if (rnd() < ir) this._injury(X, e);
        }
        // 体力消耗
        const drain = 0.55 * (xs.style === 'press' ? 1.25 : 1) * (xs.ment === 'att' ? 1.05 : 1);
        for (const e of this.active(X)) e.stamina = Math.max(5, e.stamina - drain * (e.slot === 'GK' ? 0.3 : 1) * (0.85 + rnd() * 0.3));
      }
      // AI交代
      for (const t of this.teams) {
        if (t.spec.isUser && !t.spec.autoSub) continue;
        const m = this.minute;
        if ((m === 58 || m === 68 || m === 78 || m === 85 || m === 100) && t.subsLeft > 0) {
          const n = m === 68 ? 2 : 1;
          this._aiSub(t, n, false);
        }
      }
    }

    _pickShooter(X) {
      return pickW(this.active(X), e => SHOOT_W[e.slot] * Math.pow(this.eff(e) / 75, 3) * (has(e.p, '決定力') ? 1.4 : 1));
    }
    _pickAssist(X, exclude) {
      const c = this.active(X).filter(e => e !== exclude);
      return pickW(c, e => ASSIST_W[e.slot] * Math.pow(this.eff(e) / 75, 2) * (has(e.p, 'パス') || has(e.p, 'クロス') || has(e.p, 'ドリブル') ? 1.35 : 1));
    }

    _goal(X, scorer, assist, how) {
      this.score[X.side]++;
      scorer.goals++;
      if (assist) assist.assists++;
      const sc = this.score.join('-');
      const astText = assist ? `（アシスト：${assist.p.name}）` : '';
      this.log(X.side, 'goal', `ゴール！ ${scorer.p.name}${how}${astText}　${sc}`, { scorer: scorer.p.id, assist: assist ? assist.p.id : null, name: scorer.p.name });
      this.teams[1 - X.side].onPitch.forEach(e => { if (!e.sent && (e.slot === 'GK' || SLOT_W[e.slot][0] >= 0.5)) e.rating -= 0.25; });
    }

    _shot(X, Y, LX, LY) {
      const sh = this._pickShooter(X);
      if (!sh) return;
      const xs = X.spec.tactics, ys = Y.spec.tactics;
      let q = 0.09 * Math.exp(0.02 * (LX.att - LY.def) - 0.01 * (LY.gk - LX.att));
      q *= Math.pow(clamp(this.eff(sh) / Math.max(50, LX.att), 0.6, 1.4), 1.5);
      if (has(sh.p, '決定力')) q *= 1.12;
      if (xs.style === 'counter' && (ys.ment === 'att' || ys.style === 'press')) q *= 1.2;
      if (xs.style === 'pos') q *= 1.04;
      if (ys.ment === 'def') q *= 0.9;
      if (ys.ment === 'att') q *= 1.08;
      q = clamp(q, 0.01, 0.45);
      X.stats.shots++; X.stats.xg += q; sh.shots++;
      const name = sh.p.name;
      if (rnd() < q) {
        X.stats.sot++; sh.sot++;
        const how = pickW([['の右足シュート', 4], ['の左足シュート', 3], ['のヘディング', 1.5], ['が冷静に流し込む', 2], ['のミドルシュート', 1]], x => x[1])[0];
        const ast = rnd() < 0.75 ? this._pickAssist(X, sh) : null;
        this._goal(X, sh, ast, how);
      } else if (rnd() < 0.33) {
        X.stats.sot++; sh.sot++;
        const gk = this.active(Y).find(e => e.slot === 'GK');
        if (gk) { gk.saves++; Y.stats.saves++; }
        const big = q > 0.2;
        const gkName = gk ? gk.p.name : 'GK';
        this.log(X.side, 'save', big ? `${name}の決定的なシュート！ ${gkName}がビッグセーブ！` : `${name}のシュートは${gkName}が正面でキャッチ`);
      } else {
        const t = pickW([[`${name}のシュートは枠の外`, 3], [`${name}が狙うもDFがブロック`, 2], [`${name}、ふかしてしまう`, 1], [`${name}のシュートはポストを叩く！`, 0.3]], x => x[1])[0];
        if (q > 0.18 || rnd() < 0.5) this.log(X.side, 'miss', t);
      }
    }

    // セットプレー設定：spec.setPlay = { ck: near|far|short|mix, defend: zone|man, ckTaker, fkTaker, pkTaker, fam }
    _designated(X, id) { return id ? this.active(X).find(e => e.p.id === id && e.slot !== 'GK') : null; }

    _setPiece(X, Y, LX, LY) {
      X.stats.corners++;
      const act = this.active(X);
      const sp = X.spec.setPlay || {};
      const spFam = sp.fam == null ? 50 : sp.fam;
      const spMult = (X.spec.setPiece ? 1.3 : 1) * (0.85 + spFam / 333);
      // 相手の守り方
      const ysp = Y.spec.setPlay || {};
      const yAerial = this.active(Y).filter(e => ['CB', 'ST', 'DM'].includes(e.slot) && has(e.p, '空中戦')).length;
      const defMult = ysp.defend === 'man' ? (yAerial >= 2 ? 0.84 : 1.02) : ysp.defend === 'zone' ? 0.92 : 1;
      if (rnd() < 0.16) {
        // 直接FK
        const kicker = this._designated(X, sp.fkTaker) || act.filter(e => e.slot !== 'GK').sort((a, b) => (has(b.p, 'FK') ? 10 : 0) + this.eff(b) - (has(a.p, 'FK') ? 10 : 0) - this.eff(a))[0];
        if (!kicker) return;
        let q = 0.055 * Math.pow(this.eff(kicker) / 80, 2) * (has(kicker.p, 'FK') ? 1.8 : 1) * Math.exp(-0.02 * (LY.gk - 78)) * spMult;
        X.stats.shots++; X.stats.xg += q; kicker.shots++;
        if (rnd() < q) { X.stats.sot++; kicker.sot++; this._goal(X, kicker, null, 'の直接フリーキック！'); }
        else if (rnd() < 0.5) this.log(X.side, 'miss', `${kicker.p.name}の直接FKはわずかに外れる`);
        return;
      }
      const taker = this._designated(X, sp.ckTaker) || act.filter(e => e.slot !== 'GK').sort((a, b) => (has(b.p, 'FK') || has(b.p, 'クロス') ? 8 : 0) + this.eff(b) - (has(a.p, 'FK') || has(a.p, 'クロス') ? 8 : 0) - this.eff(a))[0];
      const kq = taker ? Math.pow(this.eff(taker) / 78, 2) * (has(taker.p, 'FK') || has(taker.p, 'クロス') ? 1.15 : 1) : 1;
      const ck = sp.ck || 'mix';
      if (ck === 'short' && rnd() < 0.55) {
        // ショートコーナーからミドル
        const sh = pickW(act.filter(e => e !== taker && e.slot !== 'GK' && SLOT_W[e.slot][0] < 0.5), e => Math.pow(this.eff(e) / 75, 3));
        if (!sh) return;
        const q = 0.05 * kq * spMult * defMult;
        if (rnd() < 0.45) {
          X.stats.shots++; X.stats.xg += q; sh.shots++;
          if (rnd() < q) { X.stats.sot++; sh.sot++; this._goal(X, sh, taker, 'がショートコーナーの流れからミドルを突き刺す！'); }
          else if (rnd() < 0.3) this.log(X.side, 'miss', `ショートコーナーから${sh.p.name}のシュートは枠の上`);
        }
        return;
      }
      const aerialW = ck === 'far' ? 3.2 : 2.2;
      const target = pickW(act.filter(e => e !== taker), e => HEAD_W[e.slot] * (has(e.p, '空中戦') ? aerialW : 1) * Math.pow(this.eff(e) / 75, 2));
      if (!target) return;
      const ourAerial = act.filter(e => has(e.p, '空中戦')).length;
      const routine = ck === 'far' ? (ourAerial >= 2 ? 1.22 : 0.85) : ck === 'near' ? 1.06 : 1;
      const aerial = has(target.p, '空中戦') ? 1.4 : 1;
      let q = 0.027 * Math.exp(0.02 * (LX.att - LY.def)) * spMult * aerial * kq * routine * defMult;
      if (rnd() < 0.35) {
        X.stats.shots++; X.stats.xg += q * 2.8; target.shots++;
        if (rnd() < q * 2.8) {
          X.stats.sot++; target.sot++;
          this._goal(X, target, taker, ck === 'near' ? 'がニアで合わせる！ 練習どおりのセットプレー！' : ck === 'far' ? 'がファーで競り勝ち頭で叩き込む！' : 'がセットプレーから頭で合わせる！');
        } else if (rnd() < 0.4) this.log(X.side, 'miss', `コーナーキックから${target.p.name}のヘディングはわずかに枠外`);
      }
    }

    _penalty(X, Y, LX, LY) {
      const taker = this._designated(X, (X.spec.setPlay || {}).pkTaker) || this.active(X).filter(e => e.slot !== 'GK').sort((a, b) => this.eff(b) + SHOOT_W[b.slot] * 2 - this.eff(a) - SHOOT_W[a.slot] * 2)[0];
      const fouler = pickW(this.active(Y), e => DEF_W[e.slot]);
      if (!taker) return;
      this.log(X.side, 'pen', `PK獲得！ ${fouler ? fouler.p.name + 'がエリア内で倒した' : ''}`);
      if (fouler && rnd() < 0.35) this._card(Y, fouler);
      const conv = clamp(0.76 + (this.eff(taker) - 78) * 0.005 - (LY.gk - 78) * 0.004, 0.55, 0.9);
      X.stats.shots++; X.stats.xg += 0.76; taker.shots++;
      if (rnd() < conv) { X.stats.sot++; taker.sot++; this._goal(X, taker, null, 'がPKを決める'); }
      else {
        const gk = this.active(Y).find(e => e.slot === 'GK');
        if (gk && rnd() < 0.6) { gk.saves++; gk.rating += 0.6; this.log(Y.side, 'save', `${gk.p.name}がPKをストップ！`); }
        else this.log(X.side, 'miss', `${taker.p.name}のPKは枠を外れる！`);
      }
    }

    _card(X, who) {
      const e = who || pickW(this.active(X), e => DEF_W[e.slot] * (has(e.p, 'ボール奪取') || has(e.p, '対人守備') ? 1.3 : 1));
      if (!e || e.sent) return;
      X.stats.fouls++;
      if (rnd() < 0.02) { this._sendOff(X, e, '一発レッド'); return; }
      e.yc++; X.stats.yellow++; e.rating -= 0.3;
      if (e.yc >= 2) this._sendOff(X, e, '2枚目のイエロー');
      else this.log(X.side, 'yellow', `${e.p.name}にイエローカード`);
    }

    _sendOff(X, e, why) {
      e.sent = true; e.minOut = this.minute; e.rating -= 1.5; X.stats.red++; X.menDown++;
      this.log(X.side, 'red', `${e.p.name}退場（${why}）。${X.spec.name}は10人に`, { pid: e.p.id, needsDecision: X.spec.isUser && !X.spec.autoSub });
      if (e.slot === 'GK') {
        // GKを入れて誰かを下げる
        const gk = X.bench.find(p => p.pos === 'GK');
        const outE = this.active(X).filter(x => x.slot !== 'GK').sort((a, b) => SLOT_W[a.slot][2] - SLOT_W[b.slot][2]).pop();
        if (gk && X.subsLeft > 0 && outE) this.substitute(X.side, X.onPitch.indexOf(outE), gk.id, 'GK');
        else { const f = this.active(X).find(x => x.slot !== 'GK'); if (f) f.slot = 'GK'; }
      }
    }

    _injury(X, e) {
      e.injured = true;
      this.log(X.side, 'injury', `${e.p.name}が負傷…プレー続行が難しそうだ`, { pid: e.p.id, needsDecision: X.spec.isUser && !X.spec.autoSub });
      if (!X.spec.isUser || X.spec.autoSub) {
        if (X.subsLeft > 0) this._replace(X, e);
      }
    }

    _replace(X, e) {
      const idx = X.onPitch.indexOf(e);
      const cand = X.bench.slice().sort((a, b) => b.ovr * fit(b, e.slot) * (b.cond || 100) - a.ovr * fit(a, e.slot) * (a.cond || 100))[0];
      if (cand) this.substitute(X.side, idx, cand.id);
    }

    _aiSub(t, n, early) {
      for (let k = 0; k < n && t.subsLeft > 0; k++) {
        const cands = this.active(t).filter(e => e.slot !== 'GK' && !e.sent);
        let target;
        if (early) target = cands.sort((a, b) => this.eff(a) / a.p.ovr - this.eff(b) / b.p.ovr)[0];
        else target = cands.filter(e => e.injured || e.stamina < 55 || e.yc > 0 && rnd() < 0.3).sort((a, b) => (a.injured ? -100 : a.stamina) - (b.injured ? -100 : b.stamina))[0];
        if (!target) return;
        const diff = this.score[t.side] - this.score[1 - t.side];
        let slot = target.slot;
        const bench = t.bench.filter(p => p.pos !== 'GK');
        if (!bench.length) return;
        // 負けていれば攻撃的な選手を投入
        const pref = p => p.ovr * fit(p, slot) + (diff < 0 && ['ST', 'LW', 'RW', 'AM'].includes(p.pos) ? 3 : 0) + (diff > 0 && ['CB', 'DM'].includes(p.pos) ? 2 : 0);
        const best = bench.sort((a, b) => pref(b) - pref(a))[0];
        if (this.eff(target) > best.ovr * fit(best, slot) * 1.03 && !target.injured) return;
        this.substitute(t.side, t.onPitch.indexOf(target), best.id);
      }
    }

    substitute(side, idx, inId, slotOverride) {
      const X = this.teams[side];
      const e = X.onPitch[idx];
      const p = X.bench.find(b => b.id === inId);
      if (!e || !p || e.sent || X.subsLeft <= 0) return false;
      X.bench = X.bench.filter(b => b !== p);
      e.minOut = this.minute;
      X.out.push(e);
      const ne = this._entry(p, slotOverride || e.slot);
      ne.minIn = this.minute;
      X.onPitch[idx] = ne;
      X.subsLeft--;
      this.events.push({ min: this.minute, side, type: 'sub', text: `交代：${e.p.name} → ${p.name}` });
      if (this._new) this._new.push(this.events[this.events.length - 1]);
      return true;
    }

    // 試合中の配置換え（スロット入れ替え）
    swap(side, i, j) {
      const X = this.teams[side];
      const a = X.onPitch[i], b = X.onPitch[j];
      if (!a || !b) return;
      const s = a.slot; a.slot = b.slot; b.slot = s;
      X.onPitch[i] = b; X.onPitch[j] = a;
    }

    _shootout() {
      this.phase = 'pens';
      const order = t => this.active(t).filter(e => e.slot !== 'GK').sort((a, b) => this.eff(b) - this.eff(a)).concat(this.active(t).filter(e => e.slot === 'GK'));
      const ord = [order(this.teams[0]), order(this.teams[1])];
      const gks = this.teams.map(t => this.active(t).find(e => e.slot === 'GK'));
      const sc = [0, 0], taken = [0, 0];
      this.log(-1, 'pens', 'PK戦へ！');
      let round = 0;
      while (round < 30) {
        for (let s = 0; s < 2; s++) {
          const k = ord[s][round % ord[s].length];
          const gk = gks[1 - s];
          const pr = clamp(0.76 + (this.eff(k) - 78) * 0.006 - ((gk ? this.eff(gk) : 60) - 78) * 0.005 + (has(k.p, 'リーダー') ? 0.03 : 0), 0.55, 0.92);
          const ok = rnd() < pr;
          taken[s]++;
          if (ok) sc[s]++;
          this.log(s, ok ? 'pk_ok' : 'pk_ng', `${k.p.name} ${ok ? '成功' : '失敗'}（${sc[0]}-${sc[1]}）`);
          if (round < 5) {
            const rem = [5 - taken[0], 5 - taken[1]];
            if (sc[0] + rem[0] < sc[1] || sc[1] + rem[1] < sc[0]) { this.pens = sc; return; }
          }
        }
        round++;
        if (round >= 5 && sc[0] !== sc[1]) { this.pens = sc; return; }
      }
      this.pens = sc;
    }

    _finish() {
      this.phase = 'done';
      const [h, a] = this.score;
      let txt = `試合終了 ${this.teamName(0)} ${h}-${a} ${this.teamName(1)}`;
      if (this.pens) txt += `（PK ${this.pens[0]}-${this.pens[1]}）`;
      this.log(-1, 'ft', txt);
      this._rate();
    }

    winner() {
      if (this.score[0] > this.score[1]) return 0;
      if (this.score[1] > this.score[0]) return 1;
      if (this.pens) return this.pens[0] > this.pens[1] ? 0 : 1;
      return -1;
    }

    _rate() {
      const mins = this.minute;
      const poss = this.possession();
      for (const t of this.teams) {
        const gf = this.score[t.side], ga = this.score[1 - t.side];
        const w = this.winner();
        const res = w === -1 ? 0 : (w === t.side ? 0.3 : -0.3);
        const all = t.onPitch.concat(t.out);
        for (const e of all) {
          const played = (e.minOut == null ? mins : e.minOut) - e.minIn;
          e.minutes = played;
          let r = 6.2 + e.rating + e.goals * 1.0 + e.assists * 0.6 + e.sot * 0.1 + e.saves * 0.2 + res;
          const dw = SLOT_W[e.slot] ? SLOT_W[e.slot][0] : 0;
          if ((e.slot === 'GK' || dw >= 0.5) && ga === 0 && played >= 60) r += 0.5;
          r += (poss[t.side] - 50) / 100 * (SLOT_W[e.slot] ? SLOT_W[e.slot][1] : 0) * 2;
          r += (e.p.ovr - 75) * 0.03;
          r += normal(0.35);
          if (played < 20) r = 6 + (r - 6) * 0.5;
          e.final = clamp(Math.round(r * 10) / 10, 3, 10);
        }
      }
    }

    possession() {
      const tot = this.possAcc[0] + this.possAcc[1] || 1;
      const a = Math.round(this.possAcc[0] / tot * 100);
      return [a, 100 - a];
    }

    result() {
      return {
        score: this.score.slice(), pens: this.pens, winner: this.winner(), possession: this.possession(),
        stats: this.teams.map(t => Object.assign({}, t.stats, { xg: Math.round(t.stats.xg * 100) / 100 })),
        players: this.teams.map(t => t.onPitch.concat(t.out).map(e => ({ id: e.p.id, name: e.p.name, slot: e.slot, minutes: e.minutes || 0, goals: e.goals, assists: e.assists, rating: e.final, yc: e.yc, red: e.sent, injured: e.injured, stamina: e.stamina }))),
        events: this.events
      };
    }
  }

  root.SBEngine = { FORMATIONS, SLOT_LABEL, POS_LABEL, POS_GROUP, SLOT_FIT, SLOT_W, MENT, STYLE, fit, MatchSim, quickSim, setRandom, normal, poisson, pickW, clamp };
})(typeof window !== 'undefined' ? window : globalThis);
