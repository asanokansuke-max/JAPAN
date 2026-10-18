// 代表合宿のトレーニングと出来事、国内外の視察
(function (root) {
  'use strict';
  const G = root.SBGame, W = root.SBWorld, E = root.SBEngine, D = root.SBData;
  const { clamp, pickW } = E;
  const rnd = () => Math.random();
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  // 合宿メニュー
  const MENU = {
    tactic: { name: '戦術練習', desc: '採用フォーメーションの熟成度 +6', load: 1 },
    attack: { name: '攻撃パターン', desc: '崩しの形を反復。攻撃力 +0.7（最大+2）', load: 2 },
    defense: { name: '守備組織', desc: 'ブロックと連動を確認。守備力 +0.7（最大+2）', load: 2 },
    setpiece: { name: 'セットプレー', desc: 'キッカーとサインを詰める。完成度 +12', load: 1 },
    game: { name: '紅白戦', desc: '実戦形式。好調な選手がアピール。連携 +3、軽傷の危険', load: 3 },
    recovery: { name: 'リカバリー', desc: '移動と時差の疲れを抜く。コンディション +6', load: -6 },
    youth: { name: '若手の個別指導', desc: '23歳以下の能力が伸びる', load: 1 },
    meeting: { name: 'チームミーティング', desc: '目標と役割を共有。士気 +6', load: 0 },
    bond: { name: '食事会・レクリエーション', desc: '選手同士の距離を縮める。士気 +3、連携 +4', load: -2 }
  };

  function squad() { const S = G.state(); return S.squad.map(G.player).filter(p => p && !p.retired); }
  const mood = (p, d) => { p.mood = clamp((p.mood || 0) + d, -3, 3); };

  function session(key) {
    const S = G.state();
    const c = S.cur.camp;
    if (!c || c.done.length >= c.days) return null;
    const m = MENU[key];
    const sq = squad().filter(p => p.injury <= 0);
    const tb = c.bonus;
    const lines = [];
    if (key === 'tactic') { S.fam[S.formation] = Math.min(100, S.fam[S.formation] + 6); lines.push(`${S.formation}の約束事を確認。熟成度 ${Math.round(S.fam[S.formation])}`); }
    if (key === 'attack') { tb.att = Math.min(2, (tb.att || 0) + 0.7); lines.push(`攻撃の連係を反復（攻撃 +${tb.att.toFixed(1)}）`); }
    if (key === 'defense') { tb.def = Math.min(2, (tb.def || 0) + 0.7); lines.push(`守備ブロックを確認（守備 +${tb.def.toFixed(1)}）`); }
    if (key === 'setpiece') {
      S.spFam = Math.min(100, (S.spFam || 40) + 12); tb.setPiece = true;
      const sp = S.setPlay;
      const k = G.player(sp.ckTaker);
      lines.push(`CKは「${({ near: 'ニア', far: 'ファー', short: 'ショート', mix: '混合' })[sp.ck]}」で${k ? `キッカー${k.name}` : 'キッカー未定'}。完成度 ${Math.round(S.spFam)}`);
    }
    if (key === 'game') {
      sq.forEach(p => { p.chem = Math.min(100, p.chem + 3); });
      const star = pickW(sq.filter(p => p.pos !== 'GK'), p => Math.max(0.1, 1 + p.form + (p.mood || 0) * 0.5));
      if (star) { star.form = clamp(star.form + 0.8, -3, 3); mood(star, 0.5); lines.push(`紅白戦で${star.name}が${pickW(['2ゴールの猛アピール', '圧巻のプレーで存在感', '主力組相手に躍動'], () => 1)}`); }
    }
    if (key === 'recovery') lines.push('全体のコンディションが回復');
    if (key === 'youth') {
      const ys = sq.filter(p => G.age(p) < 24);
      const grown = [];
      ys.forEach(p => { const g = clamp((p.pot - p.ovr) / 6, 0, 1) * (0.15 + rnd() * 0.45); p.ovr = Math.min(p.pot + 1, p.ovr + g); if (g > 0.3) grown.push(p.name); mood(p, 0.3); });
      lines.push(ys.length ? `若手${ys.length}人に個別指導${grown.length ? `。${grown.slice(0, 3).join('・')}が手応え` : ''}` : '対象の若手がいない');
    }
    if (key === 'meeting') { S.morale = clamp(S.morale + 6, 0, 100); lines.push(`チームの目標を共有。士気 ${Math.round(S.morale)}`); }
    if (key === 'bond') { S.morale = clamp(S.morale + 3, 0, 100); sq.forEach(p => { p.chem = Math.min(100, p.chem + 4); }); lines.push('食事会で選手同士の距離が縮まった'); }
    // 負荷
    sq.forEach(p => { p.cond = clamp(p.cond - m.load - (m.load > 0 ? rnd() : 0), 55, 100); });
    // 出来事
    const ev = campEvent(key, sq);
    if (ev) lines.push(ev);
    const entry = { day: c.done.length + 1, key, name: m.name, lines };
    c.done.push(key); c.log.push(entry);
    G.save();
    return entry;
  }

  function campEvent(key, sq) {
    const S = G.state();
    const intense = MENU[key].load >= 2;
    const r = rnd();
    if (intense && r < (key === 'game' ? 0.14 : 0.07)) {
      const p = pickW(sq.filter(x => x.pos !== 'GK'), x => (x.traits.includes('ガラスの体') ? 3 : 1) * (x.cond < 80 ? 2 : 1));
      if (!p) return null;
      const w = ri(1, 3);
      p.injury = w; p.inj = { t: pickW(['足首の捻挫', 'ふくらはぎの張り', '太ももの打撲'], () => 1), part: '', w, major: false };
      p.injHist = (p.injHist || []).concat([{ t: p.inj.t, d: S.date.y * 100 + S.date.m, w }]).slice(-8);
      S.cur.camp.injured = (S.cur.camp.injured || []).concat([p.id]);
      G.addNews('負傷', `${p.name}が合宿中に${p.inj.t}。全治約${w}週間。`, 'bad');
      return `アクシデント：${p.name}が${p.inj.t}で離脱（約${w}週）。追加招集を検討`;
    }
    if (r < 0.12) {
      const v = sq.filter(p => G.age(p) >= 29 && (p.traits.includes('リーダー') || p.caps >= 8 || p.chem >= 70)).sort((a, b) => b.chem - a.chem)[0];
      if (v) { S.morale = clamp(S.morale + 3, 0, 100); return `${v.name}が選手だけのミーティングを開き、チームを引き締めた（士気 +3）`; }
    }
    if (r < 0.2) {
      const unhappy = sq.filter(p => (p.mood || 0) <= -1);
      const a = unhappy[0] || pickW(sq, () => 1), b = pickW(sq.filter(p => p !== a && p.pos === a.pos), () => 1);
      if (a && b) { S.morale = clamp(S.morale - 3, 0, 100); a.chem = Math.max(0, a.chem - 4); b.chem = Math.max(0, b.chem - 4); mood(a, -0.5); return `練習中に${a.name}と${b.name}が激しく言い合う場面も（士気 -3）`; }
    }
    if (r < 0.26) {
      const p = pickW(sq, () => 1);
      if (p) { p.cond = clamp(p.cond - 14, 50, 100); return `${p.name}が発熱で別メニュー調整（コンディション低下）`; }
    }
    if (r < 0.33) {
      const p = sq.filter(x => !x.campCount || x.campCount <= 1).sort((a, b) => b.form - a.form)[0];
      if (p) { p.form = clamp(p.form + 0.6, -3, 3); mood(p, 0.6); return `初招集組の${p.name}が物怖じしないプレーで評価を上げる`; }
    }
    return null;
  }

  // ---------- 視察 ----------
  const EU_TRIPS = [
    ['ベルギー・オランダ視察', ['ベルギー1部', 'エールディビジ']],
    ['ドイツ視察', ['ブンデスリーガ']],
    ['イングランド視察', ['プレミアリーグ', 'EFLチャンピオンシップ']],
    ['スペイン・ポルトガル視察', ['ラ・リーガ', 'プリメイラ・リーガ']],
    ['フランス・イタリア視察', ['リーグ・アン', 'セリエA']],
    ['スコットランド・北欧・オーストリア視察', ['スコティッシュ・プレミアシップ', 'デンマーク・スーペルリーガ', 'オーストリア・ブンデスリーガ', 'トルコ・スュペル・リグ']]
  ];

  function makeTrips() {
    const S = G.state();
    const m = S.date.m;
    const trips = [];
    const jc = D.CLUBS[5].slice();
    for (let i = jc.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [jc[i], jc[j]] = [jc[j], jc[i]]; }
    if (m >= 2 && m <= 12) {
      for (let i = 0; i < 4; i++) trips.push({ id: 'j' + i, kind: 'J', cost: 1, title: `J1 ${jc[i * 2]} vs ${jc[i * 2 + 1]}`, clubs: [jc[i * 2], jc[i * 2 + 1]] });
    } else {
      trips.push({ id: 'jc', kind: 'J', cost: 1, title: 'Jリーグ春季キャンプ視察（沖縄・宮崎）', clubs: jc.slice(0, 6) });
    }
    const youthTitle = m === 12 || m === 1 ? '全国高校サッカー選手権' : m >= 4 && m <= 11 ? '高円宮杯プレミアリーグ（ユース）・大学リーグ' : 'U-19日本代表候補合宿';
    trips.push({ id: 'y', kind: 'youth', cost: 1, title: youthTitle, clubs: D.YOUTH_CLUBS.slice() });
    if (!(m === 6 || m === 7)) {
      const picks = EU_TRIPS.slice().sort(() => rnd() - 0.5).slice(0, 3);
      picks.forEach(([t, leagues], i) => trips.push({ id: 'e' + i, kind: 'EU', cost: 2, title: t, leagues }));
    }
    return trips;
  }

  function observe(p) {
    const mo = p.month;
    if (p.injury > 0) return `負傷で欠場（${W.injText(p)}）`;
    if (!mo || !mo.n) return 'オフ期間で試合なし。練習を確認';
    if (!mo.apps) return 'ベンチ外／出番なし。クラブでの序列は厳しい';
    const parts = [];
    if (mo.starts) parts.push(`${mo.starts}試合に先発`); else parts.push('途中出場のみ');
    if (mo.g) parts.push(`${mo.g}ゴール`);
    if (mo.a) parts.push(`${mo.a}アシスト`);
    const r = mo.r || 6.5;
    parts.push(r >= 7.2 ? '圧巻の出来' : r >= 6.8 ? '好調' : r >= 6.3 ? '可もなく不可もなく' : '精彩を欠いた');
    return parts.join('・');
  }

  function doTrip(id) {
    const S = G.state();
    const t = (S.cur.trips || []).find(x => x.id === id);
    if (!t || t.done || S.scoutPts < t.cost) return null;
    S.scoutPts -= t.cost; t.done = true;
    let ps = G.active().filter(p => t.clubs ? t.clubs.includes(p.club) : t.leagues.includes(W.league(p.club)));
    if (t.kind === 'youth') ps = ps.concat(G.active().filter(p => W.isJ(p.club) && G.age(p) < 20 && !ps.includes(p)));
    const found = [];
    ps.forEach(p => {
      p.know = Math.min(3, (p.know || 0) + 2);
      if (p.hidden) { p.hidden = false; found.push(p); }
      if (t.kind === 'J' || t.kind === 'youth') mood(p, 0.3);
    });
    found.forEach(p => G.addNews('視察', `視察で${p.name}（${p.club}・${G.ageInt(p)}歳・${E.POS_LABEL[p.pos]}）を発見。リストに追加。`, 'good'));
    if (t.kind === 'J') S.fans = clamp(S.fans + 0.6, 0, 100);
    const rows = ps.sort((a, b) => (found.includes(b) - found.includes(a)) || b.ovr - a.ovr).slice(0, 8).map(p => ({ id: p.id, text: observe(p), found: found.includes(p) }));
    t.report = { rows, found: found.length };
    G.save();
    return t.report;
  }

  root.SBCamp = { MENU, session, makeTrips, doTrip };
})(typeof window !== 'undefined' ? window : globalThis);
