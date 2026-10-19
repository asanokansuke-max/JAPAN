// さらに深い要素：相手国の事情、大会前の準備、代表通算記録、観客、性格、協会の財政、育成年代、戦術の研究、試合中の声かけ
(function (root) {
  'use strict';
  const G = root.SBGame, E = root.SBEngine, D = root.SBData;
  const { clamp, pickW } = E;
  const rnd = () => Math.random();
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const mood = (p, d) => { p.mood = clamp((p.mood || 0) + d, -3, 3); };

  // ---------- 相手国の事情 ----------
  function opp(code) { const S = G.state(); S.oppState = S.oppState || {}; if (!S.oppState[code]) S.oppState[code] = { absent: {}, coachNew: 0, pref: null }; return S.oppState[code]; }
  function oppMonth() {
    const S = G.state();
    D.NATIONS.forEach(n => {
      if (n.code === 'JPN') return;
      const o = opp(n.code);
      // 主力の負傷と復帰
      Object.keys(o.absent).forEach(k => { o.absent[k]--; if (o.absent[k] <= 0) delete o.absent[k]; });
      (n.stars || []).forEach(st => { const nm = st.split('/')[0]; if (!o.absent[nm] && rnd() < 0.035) o.absent[nm] = ri(1, 3); });
      // 監督交代：戦い方が変わる
      if (o.coachNew > 0) o.coachNew--;
      if (rnd() < 0.008) {
        o.coachNew = 6;
        o.pref = { ment: pickW(['bal', 'att', 'def'], () => 1), style: pickW(['pos', 'press', 'counter', 'bal'], () => 1) };
        S.nations[n.code].rating = clamp(S.nations[n.code].rating + (rnd() - 0.4) * 2, S.nations[n.code].base - 5, S.nations[n.code].base + 5);
      }
    });
  }
  function absentStars(code) { return Object.keys(opp(code).absent); }
  function oppNews(codes) {
    codes.forEach(c => {
      const ab = absentStars(c), o = opp(c);
      if (ab.length) G.addNews('相手国', `${G.nname(c)}は${ab.slice(0, 2).join('・')}が負傷で欠場する見込み。`);
      if (o.coachNew >= 4 && o.pref) G.addNews('相手国', `${G.nname(c)}は監督が交代したばかり。${E.STYLE[o.pref.style]}への転換を進めている。`);
    });
  }

  // ---------- 代表通算記録（就任前の出場・得点を含む） ----------
  const PRIOR = {
    '長友佑都': [142, 4], '遠藤航': [70, 4], '南野拓実': [72, 25], '伊東純也': [62, 15], '守田英正': [50, 5], '鎌田大地': [45, 10], '堂安律': [58, 11],
    '三笘薫': [32, 9], '久保建英': [47, 8], '冨安健洋': [45, 1], '板倉滉': [38, 3], '上田綺世': [42, 16], '前田大然': [26, 6], '鈴木彩艶': [26, 0],
    '谷口彰悟': [36, 2], '伊藤洋輝': [22, 1], '田中碧': [36, 8], '中村敬斗': [20, 10], '町田浩樹': [16, 1], '菅原由勢': [16, 1], '浅野拓磨': [50, 10],
    '古橋亨梧': [25, 5], '相馬勇紀': [15, 4], '小川航基': [10, 7], '町野修斗': [10, 4], '渡辺剛': [8, 0], '瀬古歩夢': [6, 0], '旗手怜央': [10, 1],
    '大迫敬介': [8, 0], '毎熊晟矢': [8, 0], '佐野海舟': [10, 0], '鈴木唯人': [5, 1], '細谷真大': [6, 1], '中山雄太': [22, 0], '谷晃生': [2, 0], '早川友基': [3, 0]
  };
  const RECORD_GOALS = 75; // 歴代最多得点（釜本邦茂）
  function capsTotal(p) { const b = PRIOR[p.name] && p.real ? PRIOR[p.name] : [0, 0]; return { caps: b[0] + p.caps, goals: b[1] + p.goals }; }
  function milestoneNews(before, p) {
    const now = capsTotal(p);
    [50, 100, 150].forEach(m => { if (before.caps < m && now.caps >= m) { G.addNews('記録', `${p.name}が国際Aマッチ通算${m}試合出場を達成！`, 'good'); mood(p, 1); const S = G.state(); S.fans = clamp(S.fans + (m >= 100 ? 3 : 1), 0, 100); } });
    [10, 20, 30, 40, 50, 60].forEach(m => { if (before.goals < m && now.goals >= m) G.addNews('記録', `${p.name}が代表通算${m}得点に到達。`, 'good'); });
    if (before.goals < RECORD_GOALS && now.goals >= RECORD_GOALS) G.addNews('記録', `${p.name}が釜本邦茂の持つ代表歴代最多得点記録に並んだ！`, 'good');
  }
  // 次の出場で節目を迎える選手
  function upcomingMilestones() {
    const S = G.state();
    return S.squad.map(G.player).filter(Boolean).map(p => ({ p, t: capsTotal(p) })).filter(x => [49, 99, 149].includes(x.t.caps)).map(x => ({ id: x.p.id, text: `${x.p.name}は次の出場で代表通算${x.t.caps + 1}試合。記念の一戦で起用すれば本人もファンも喜ぶ。` }));
  }

  // ---------- 観客とスタジアム ----------
  const STADIUMS = ['国立競技場', '埼玉スタジアム2002', '日産スタジアム', '豊田スタジアム', 'パナソニックスタジアム吹田', 'ノエビアスタジアム神戸', 'エディオンピースウイング広島'];
  const CAP = { '国立競技場': 67750, '埼玉スタジアム2002': 63700, '日産スタジアム': 72327, '豊田スタジアム': 44380, 'パナソニックスタジアム吹田': 39694, 'ノエビアスタジアム神戸': 30132, 'エディオンピースウイング広島': 28520 };
  function attendance(fx) {
    const S = G.state();
    if (fx.venue !== 'home') return null;
    const key = fx.label + fx.opp;
    S.cur.att = S.cur.att || {};
    if (!S.cur.att[key]) {
      const st = fx.comp === 'e1' ? pickW(['豊田スタジアム', 'パナソニックスタジアム吹田', 'ノエビアスタジアム神戸'], () => 1) : ['q3', 'q4'].includes(fx.comp) ? pickW(['埼玉スタジアム2002', '国立競技場'], () => 1) : pickW(STADIUMS, () => 1);
      const appeal = (G.nation(fx.opp).rating - 65) / 25;
      const ratio = clamp(0.55 + S.fans / 250 + appeal * 0.2 + (fx.comp !== 'friendly' ? 0.1 : 0) + (rnd() - 0.5) * 0.08, 0.35, 1);
      S.cur.att[key] = { stadium: st, n: Math.round(CAP[st] * ratio / 10) * 10, ratio };
    }
    return S.cur.att[key];
  }
  // 満員のスタンドは後押しに、空席と不満はプレッシャーに
  function crowdBoost(fx) {
    const S = G.state();
    const a = attendance(fx);
    if (!a) return 0;
    let v = (a.ratio - 0.7) * 2;
    if (S.fans < 30) v -= 0.6;
    return v;
  }

  // ---------- 性格 ----------
  const PERSONAS = {
    clutch: { name: '勝負強い', desc: '大舞台ほど力を発揮する' },
    show: { name: '目立ちたがり', desc: '出番がないと不満を募らせ、活躍すると乗る' },
    streaky: { name: 'ムラがある', desc: '試合ごとの出来の波が大きい' },
    team: { name: 'チームプレーヤー', desc: '控えでも腐らず、連携が早く深まる' },
    fragile: { name: '繊細', desc: '重圧に弱い' },
    steady: { name: '職人', desc: '調子の波が小さく、いつも安定' }
  };
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function persona(p) {
    if (p.persona === undefined) {
      const keys = Object.keys(PERSONAS);
      const h = hash(p.name + 'persona');
      p.persona = h % 10 < 6 ? keys[h % keys.length] : null; // 6割の選手に際立った性格
    }
    return p.persona;
  }
  // 試合用の調子の補正
  function personaForm(p, pressure) {
    const k = persona(p);
    let v = 0;
    if (k === 'clutch' && pressure >= 1.5) v += 0.6;
    if (k === 'fragile' && pressure >= 1) v -= pressure * 0.3;
    if (k === 'streaky') v += (rnd() - 0.5) * 2.6;
    if (k === 'steady') v -= (p.form || 0) * 0.5;
    return v;
  }

  // ---------- 協会の財政（強化予算） ----------
  function fundsAfterEvent(summary, ev) {
    const S = G.state();
    S.funds = S.funds == null ? 50 : S.funds;
    const wins = S.cur.played.filter(m => m.out === 'W').length;
    let d = wins * 1 + (S.fans - 55) * 0.06;
    if (ev.kind === 'tour') d += 4;
    if (S.fans >= 75 && rnd() < 0.4) { d += 8; G.addNews('協会', '日本代表の人気を受けて、新たなスポンサー契約がまとまった。', 'good'); }
    if (S.fans < 30 && rnd() < 0.4) { d -= 6; G.addNews('協会', '代表人気の低迷で、スポンサー撤退の動きも。', 'bad'); }
    S.funds = clamp(S.funds + d, 0, 100);
    summary.lines.push(`強化予算 ${Math.round(S.funds)}（${d >= 0 ? '+' : ''}${Math.round(d)}）`);
  }

  // ---------- 育成年代の世界大会 ----------
  const YOUTH_EVENTS = { 202709: ['U-20ワールドカップ', 20], 202711: ['U-17ワールドカップ', 17], 202811: ['U-17ワールドカップ', 17], 202909: ['U-20ワールドカップ', 20], 202911: ['U-17ワールドカップ', 17] };
  function youthMonth() {
    const S = G.state();
    const key = S.date.y * 100 + S.date.m;
    const ev = YOUTH_EVENTS[key];
    if (!ev) return;
    const [name, ageMax] = ev;
    const born = S.date.y - ageMax + 1;
    let pool = G.active().filter(p => p.born >= born && !p.dual);
    // 対象年代が少なければ新たな逸材が現れる
    while (pool.length < 6) { const p = G.makeYouth(S.date.y, ageMax); pool.push(p); }
    const top = pool.sort((a, b) => b.ovr + b.pot * 0.3 - a.ovr - a.pot * 0.3).slice(0, 6);
    const str = top.reduce((s, p) => s + p.ovr + p.pot * 0.1, 0) / top.length + (rnd() - 0.5) * 8;
    const res = str > 79.5 ? '優勝' : str > 77.5 ? 'ベスト4' : str > 75 ? 'ベスト8' : str > 72 ? 'ベスト16' : 'グループリーグ敗退';
    const stars = top.slice(0, 2 + (res === '優勝' || res === 'ベスト4' ? 1 : 0));
    stars.forEach(p => { p.hidden = false; p.know = Math.max(p.know || 0, 2); p.ovr = Math.min(p.pot + 1, p.ovr + 1 + rnd()); p.pot = Math.min(94, p.pot + (res === '優勝' ? 3 : 1)); });
    G.addNews('育成', `${S.date.y}年${name}で日本は${res}。${stars.map(p => `${p.name}（${p.club}）`).join('・')}が世界に名を売った。`, res === '優勝' || res === 'ベスト4' ? 'good' : '');
  }

  // ---------- 戦術の研究 ----------
  // 同じ形と戦い方を続けると相手に研究される
  function staleness() {
    const S = G.state();
    const last = S.matches.slice(0, 10);
    const same = last.filter(m => m.formation === S.formation && m.style === S.tactics.style).length;
    return Math.max(0, same - 6) * 0.25;
  }

  // ---------- 大会前のベースキャンプ ----------
  const BASES = {
    asiancup: [['riyadh', 'リヤド市内のホテル', '会場に近く移動が楽。標準的な環境', { heal: 1, accl: false }], ['jeddah', 'ジッダの海沿いのリゾート', '環境は快適で回復が早いが、会場への移動がやや長い', { heal: 3, travel: 2, accl: false }], ['doha', 'ドーハで事前合宿してから入る', '暑熱に順化できる。合宿日数を移動に使う', { heal: 0, accl: true, campDays: -1 }]],
    wc: [['marbella', 'マルベーリャ（スペイン南部）', '温暖で練習環境が良い。移動は中程度', { heal: 2, travel: 1, accl: true }], ['lisbon', 'リスボン郊外', '涼しく回復が早い。暑い会場では消耗する', { heal: 3, accl: false }], ['rabat', 'ラバト（モロッコ）', '暑さに慣れ、開催国の雰囲気も味わえる。設備は並', { heal: 0, accl: true, morale: 2 }]],
    olympic: [['la', 'ロサンゼルス市内の大学キャンパス', '会場に近く移動が楽', { heal: 1, accl: false }], ['sd', 'サンディエゴの海沿い', '涼しく回復が早い', { heal: 3, travel: 1, accl: false }]]
  };
  function baseOptions(comp) { return BASES[comp] || null; }
  function chooseBase(key) {
    const S = G.state();
    const ev = G.event();
    const opt = (BASES[ev.comp] || []).find(b => b[0] === key);
    if (!opt) return;
    S.cur.base = { key, name: opt[1], fx: opt[3] };
    if (opt[3].morale) S.morale = clamp(S.morale + opt[3].morale, 0, 100);
    G.addNews('大会', `${ev.title}のベースキャンプを${opt[1]}に決定。`);
    G.save();
  }
  function baseFx() { const S = G.state(); return (S.cur && S.cur.base && S.cur.base.fx) || {}; }

  // ---------- 非公開の練習試合 ----------
  function practiceMatch(level) {
    const S = G.state();
    const pool = D.NATIONS.filter(n => n.code !== 'JPN' && (level === 'strong' ? S.nations[n.code].rating >= 80 : S.nations[n.code].rating >= 68 && S.nations[n.code].rating <= 76));
    const o = pickW(pool, () => 1);
    const r = E.quickSim(S.jpnRating || G.japanStrength(), S.nations[o.code].rating, 0, false);
    S.fam[S.formation] = Math.min(100, S.fam[S.formation] + 5);
    const sq = S.squad.map(G.player).filter(Boolean);
    sq.forEach(p => { p.chem = Math.min(100, p.chem + 3); });
    const star = pickW(sq.filter(p => p.pos !== 'GK'), p => Math.max(0.1, 1 + p.form));
    if (star) star.form = clamp(star.form + (r.ga > r.gb ? 0.6 : 0.2), -3, 3);
    if (level === 'strong' && r.ga < r.gb) S.morale = clamp(S.morale - 2, 0, 100);
    if (level === 'weak' && r.ga > r.gb) S.morale = clamp(S.morale + 2, 0, 100);
    return `非公開で${o.name}と練習試合（${r.ga}-${r.gb}）。${star ? `${star.name}が好プレー。` : ''}熟成度が上がった`;
  }

  // ---------- 試合中の声かけ ----------
  const TALKS = {
    rally: { name: '鼓舞する', desc: '「まだやれる。自分たちを信じろ」' },
    blast: { name: '叱咤する', desc: '「このままでいいのか！」' },
    calm: { name: '冷静に指示', desc: '「やることは変わらない。修正点は2つだけ」' }
  };
  // スコアに応じて効果が変わる（負けているときの叱咤は効くが、勝っているときは逆効果）
  function talkEffect(key, diff) {
    if (key === 'rally') return diff < 0 ? 1 : diff === 0 ? 0.6 : 0.2;
    if (key === 'blast') return diff < 0 ? 1.4 : diff === 0 ? 0.3 : -0.8;
    return diff > 0 ? 0.8 : diff === 0 ? 0.5 : 0.1;
  }

  root.SBDepth = { opp, oppMonth, absentStars, oppNews, PRIOR, capsTotal, milestoneNews, upcomingMilestones, attendance, crowdBoost, PERSONAS, persona, personaForm, fundsAfterEvent, youthMonth, staleness, baseOptions, chooseBase, baseFx, practiceMatch, TALKS, talkEffect };
})(typeof window !== 'undefined' ? window : globalThis);
