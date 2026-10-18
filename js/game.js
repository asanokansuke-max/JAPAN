// ゲーム進行：状態管理・日程・育成・大会
(function (root) {
  'use strict';
  const D = root.SBData, E = root.SBEngine;
  const { normal, pickW, clamp, FORMATIONS, fit } = E;
  const rnd = () => Math.random();
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const SAVE_KEY = 'samurai-blue-manager-v2';


  // 2026年10月〜2030年W杯までの日程
  const CALENDAR = [
    { id: 'f2610', y: 2026, m: 10, kind: 'friendly', title: 'キリンチャレンジカップ', venue: 'home', pool: [[74, 84], [76, 86]] },
    { id: 'f2611', y: 2026, m: 11, kind: 'friendly', title: 'キリンチャレンジカップ', venue: 'home', pool: [[64, 74], [74, 82]] },
    { id: 'ac27', y: 2027, m: 1, kind: 'tour', comp: 'asiancup', title: 'AFCアジアカップ2027（サウジアラビア）' },
    { id: 'f2703', y: 2027, m: 3, kind: 'friendly', title: 'キリンチャレンジカップ', venue: 'home', pool: [[72, 80], [78, 86]] },
    { id: 'f2706', y: 2027, m: 6, kind: 'friendly', title: 'キリンカップ', venue: 'home', pool: [[66, 76], [72, 80]] },
    { id: 'f2709', y: 2027, m: 9, kind: 'friendly', title: '欧州遠征', venue: 'away', pool: [[76, 84], [80, 88]] },
    { id: 'f2710', y: 2027, m: 10, kind: 'friendly', title: 'キリンチャレンジカップ', venue: 'home', pool: [[72, 80], [76, 84]] },
    { id: 'q2a', y: 2027, m: 11, kind: 'qual', comp: 'q2', mds: [0, 1], title: 'W杯アジア2次予選' },
    { id: 'q2b', y: 2028, m: 3, kind: 'qual', comp: 'q2', mds: [2, 3], title: 'W杯アジア2次予選' },
    { id: 'q2c', y: 2028, m: 6, kind: 'qual', comp: 'q2', mds: [4, 5], title: 'W杯アジア2次予選' },
    { id: 'q3a', y: 2028, m: 9, kind: 'qual', comp: 'q3', mds: [0, 1], title: 'W杯アジア最終予選' },
    { id: 'q3b', y: 2028, m: 10, kind: 'qual', comp: 'q3', mds: [2, 3], title: 'W杯アジア最終予選' },
    { id: 'q3c', y: 2028, m: 11, kind: 'qual', comp: 'q3', mds: [4, 5], title: 'W杯アジア最終予選' },
    { id: 'q3d', y: 2029, m: 3, kind: 'qual', comp: 'q3', mds: [6, 7], title: 'W杯アジア最終予選' },
    { id: 'q3e', y: 2029, m: 6, kind: 'qual', comp: 'q3', mds: [8, 9], title: 'W杯アジア最終予選' },
    { id: 'q4', y: 2029, m: 10, kind: 'q4', comp: 'q4', title: 'W杯アジア4次予選', venue: 'home', pool: [[76, 84], [78, 86]] },
    { id: 'f2911', y: 2029, m: 11, kind: 'friendly', title: 'キリンチャレンジカップ', venue: 'home', pool: [[76, 84], [78, 88]] },
    { id: 'f3003', y: 2030, m: 3, kind: 'friendly', title: '欧州遠征', venue: 'away', pool: [[80, 86], [82, 90]] },
    { id: 'wc30', y: 2030, m: 6, kind: 'tour', comp: 'wc', title: 'FIFAワールドカップ2030' }
  ];

  let S = null; // 現在のゲーム状態
  let nextId = 1;

  // ---------- 選手 ----------
  function makePlayer(o) {
    const p = Object.assign({
      id: 'p' + (nextId++), alt: [], traits: [], form: 0, cond: 95, injury: 0, susp: 0,
      caps: 0, goals: 0, assists: 0, chem: 20, know: 0, standing: normal(1.5), benchMonths: 0,
      hist: [], retired: false, real: false, potNoise: normal(4), ratings: [], mood: 0, hidden: false
    }, o);
    p.tier = D.clubTier(p.club);
    p.ovr = +p.ovr; p.pot = Math.max(p.pot, p.ovr);
    p.status = clubStatus(p);
    return p;
  }

  function clubStatus(p) {
    if (p.tier >= 6) return 'youth';
    const d = p.ovr + p.standing - D.CLUB_TIER_REQ[p.tier];
    if (d >= 1) return 'reg';
    if (d >= -3.5) return 'rot';
    return 'bench';
  }
  const STATUS_LABEL = { reg: 'レギュラー', rot: '準主力', bench: '控え', youth: 'ユース/学生' };

  function age(p, date) { const d = date || S.date; return d.y + (d.m - 1) / 12 - p.born - 0.5; }
  function ageInt(p) { return Math.floor(age(p)); }

  function randomName() {
    for (let i = 0; i < 50; i++) {
      const n = D.SURNAMES[ri(0, D.SURNAMES.length - 1)] + D.GIVEN[ri(0, D.GIVEN.length - 1)];
      if (!S || !S.players.some(p => p.name === n)) return n;
    }
    return '新人' + nextId;
  }

  const TRAITS_BY_POS = {
    GK: ['ビッグセーブ', 'リーダー'], CB: ['空中戦', '対人守備', 'リーダー', '左足'], LB: ['クロス', 'スピード', '左足'], RB: ['クロス', 'スピード'],
    DM: ['ボール奪取', 'パス', 'リーダー'], CM: ['パス', 'ボール奪取', 'FK'], AM: ['ドリブル', 'パス', 'FK', '決定力'],
    LW: ['ドリブル', 'スピード', 'クロス', '決定力'], RW: ['ドリブル', 'スピード', '左足', 'クロス'], ST: ['決定力', '空中戦', 'スピード', 'ハイプレス']
  };
  const ALT_BY_POS = { GK: [], CB: ['DM', 'RB', 'LB'], LB: ['LW', 'CB'], RB: ['RW', 'CB'], DM: ['CM', 'CB'], CM: ['DM', 'AM'], AM: ['CM', 'LW', 'RW'], LW: ['RW', 'AM'], RW: ['LW', 'AM'], ST: ['AM', 'LW'] };

  function genProspect(y, opts) {
    opts = opts || {};
    const pos = pickW(['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST'], () => 1);
    const ageY = opts.age || ri(17, 19);
    const ovr = opts.ovr || ri(55, 66);
    let pot = ovr + ri(10, 22);
    if (rnd() < 0.04) pot = ri(85, 90);
    pot = Math.min(pot, 90);
    const abroad = rnd() < 0.12;
    const club = abroad ? pickW(D.CLUBS[4], () => 1) : (ageY <= 18 && rnd() < 0.5 ? pickW(D.YOUTH_CLUBS, () => 1) : pickW(D.CLUBS[5], () => 1));
    const traits = [];
    if (rnd() < 0.7) traits.push(pickW(TRAITS_BY_POS[pos], () => 1));
    if (rnd() < 0.25) { const t = pickW(TRAITS_BY_POS[pos], () => 1); if (!traits.includes(t)) traits.push(t); }
    if (rnd() < 0.06) traits.push('ガラスの体');
    const alt = rnd() < 0.6 && ALT_BY_POS[pos].length ? [pickW(ALT_BY_POS[pos], () => 1)] : [];
    // 国内・学生の選手は視察しないと見つからないことがある
    const hidden = !abroad && rnd() < 0.55 && !opts.visible;
    return makePlayer({ name: randomName(), pos, alt, born: y - ageY, club, ovr, pot, traits, know: 0, chem: 0, hidden });
  }

  // 表示用の詳細能力（総合力・ポジション・特徴から導出）
  const ATTR_PROFILE = {
    GK: { 反応: 4, ハンドリング: 2, キック: -4, 飛び出し: 0, 守備範囲: 1, フィジカル: -2 },
    CB: { スピード: -3, シュート: -14, パス: -4, ドリブル: -10, 守備: 5, フィジカル: 4 },
    LB: { スピード: 3, シュート: -10, パス: -1, ドリブル: -3, 守備: 1, フィジカル: 0 },
    RB: { スピード: 3, シュート: -10, パス: -1, ドリブル: -3, 守備: 1, フィジカル: 0 },
    DM: { スピード: -3, シュート: -6, パス: 2, ドリブル: -4, 守備: 4, フィジカル: 3 },
    CM: { スピード: -1, シュート: -3, パス: 4, ドリブル: 0, 守備: 0, フィジカル: 0 },
    AM: { スピード: 0, シュート: 1, パス: 4, ドリブル: 4, 守備: -12, フィジカル: -4 },
    LW: { スピード: 4, シュート: 0, パス: -1, ドリブル: 5, 守備: -14, フィジカル: -4 },
    RW: { スピード: 4, シュート: 0, パス: -1, ドリブル: 5, 守備: -14, フィジカル: -4 },
    ST: { スピード: 1, シュート: 5, パス: -4, ドリブル: 0, 守備: -16, フィジカル: 2 }
  };
  const TRAIT_ATTR = { スピード: ['スピード', 4], ドリブル: ['ドリブル', 4], 決定力: ['シュート', 4], パス: ['パス', 4], 対人守備: ['守備', 4], ボール奪取: ['守備', 3], 空中戦: ['フィジカル', 4], ハイプレス: ['フィジカル', 3], クロス: ['パス', 2], FK: ['シュート', 2], ビッグセーブ: ['反応', 4] };
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function attributes(p) {
    const prof = ATTR_PROFILE[p.pos];
    const h = hashStr(p.name);
    const out = {};
    let i = 0;
    for (const k in prof) {
      const jitter = ((h >> (i * 4)) & 15) / 15 * 6 - 3;
      out[k] = Math.round(clamp(p.ovr + prof[k] * 0.8 + jitter - 1, 25, 97));
      i++;
    }
    for (const t of p.traits) { const ta = TRAIT_ATTR[t]; if (ta && out[ta[0]] != null) out[ta[0]] = Math.min(97, out[ta[0]] + ta[1]); }
    return out;
  }

  function potRange(p) {
    const w = [8, 5, 3, 1][p.know || 0];
    const c = Math.round(p.pot + p.potNoise * (3 - (p.know || 0)) / 3);
    return [Math.max(Math.round(p.ovr), c - w), c + w];
  }
  function potGrade(v) {
    if (v >= 88) return 'S'; if (v >= 84) return 'A'; if (v >= 80) return 'B'; if (v >= 75) return 'C'; if (v >= 70) return 'D'; return 'E';
  }

  // ---------- 新規ゲーム ----------
  function newGame(coachName) {
    nextId = 1;
    S = {
      v: 1, coach: coachName || '監督', date: { y: 2026, m: 10 }, ev: 0, phase: 'prep',
      players: [], nations: {}, squad: [], formation: '3-4-2-1', xi: [], tactics: { ment: 'bal', style: 'bal' }, autoSub: false,
      training: null, trainBonus: null, fam: { '3-4-2-1': 62, '4-2-3-1': 50, '4-3-3': 35, '4-4-2': 30, '3-5-2': 30 },
      board: 60, morale: 60, fans: 55, scoutPts: 3, news: [],
      setPlay: { ck: 'mix', defend: 'zone', ckTaker: null, fkTaker: null, pkTaker: null }, spFam: 40, matches: [], comps: {}, cur: null, log: [], wcResult: null, nextId: 0
    };
    D.NATIONS.forEach(n => { S.nations[n.code] = { rating: n.rating, base: n.rating }; });
    const core = ['鈴木彩艶', '冨安健洋', '板倉滉', '伊藤洋輝', '谷口彰悟', '渡辺剛', '町田浩樹', '瀬古歩夢', '鈴木淳之介', '菅原由勢', '長友佑都', '遠藤航', '守田英正', '田中碧', '佐野海舟', '鎌田大地', '久保建英', '三笘薫', '堂安律', '伊東純也', '南野拓実', '中村敬斗', '前田大然', '上田綺世', '町野修斗', '小川航基', '大迫敬介', '早川友基', '鈴木唯人', '藤田譲瑠チマ', '関根大輝', '望月ヘンリー海輝', '細谷真大'];
    D.PLAYERS.forEach(o => {
      const inCore = core.includes(o.name);
      // 就任前の代表歴：主力は直近まで招集、実績ある選手は過去に招集歴あり
      const p = makePlayer(Object.assign({}, o, { know: 2, real: true, chem: inCore ? 55 + ri(0, 15) : 15, campCount: inCore ? 4 : (o.born <= 2001 && o.ovr >= 73 ? 1 : 0), lastCamp: inCore ? 2026 * 12 + 9 : 2025 * 12 + 6 }));
      const ii = D.INITIAL_INJURIES[o.name];
      if (ii) { p.injury = ii.w; p.inj = { t: ii.t, part: ii.part, w: 36, major: ii.major }; p.injHist = [{ t: ii.t, d: 202512, w: 36 }]; }
      S.players.push(p);
    });
    for (let i = 0; i < 10; i++) S.players.push(genProspect(2026, { age: ri(17, 20), ovr: ri(58, 67) }));
    root.SBWorld.bootstrap(S);
    S.players.forEach(p => p.hist.push([dateKey(), Math.round(p.ovr)]));
    addNews('就任', `${S.coach}監督が日本代表監督に就任。目標は2030年ワールドカップ優勝。`);
    addNews('協会', '日本サッカー協会の目標：アジアカップ2027 ベスト4以上、W杯2030 出場とベスト8以上。');
    beginEvent();
    // 前体制の最後の招集メンバー（落選の話題の基準）
    S.cur.prevSquad = S.players.filter(p => core.includes(p.name)).map(p => p.id);
    refreshReports();
    save();
    return S;
  }

  function dateKey(d) { d = d || S.date; return d.y * 100 + d.m; }
  function dateStr(d) { d = d || S.date; return `${d.y}年${d.m}月`; }
  function addNews(tag, text, kind) { S.news.unshift({ d: dateStr(), tag, text, kind: kind || '' }); if (S.news.length > 120) S.news.length = 120; }

  function player(id) { return S.players.find(p => p.id === id); }
  function active() { return S.players.filter(p => !p.retired); }
  function visible() { return S.players.filter(p => !p.retired && !p.hidden); }
  function nation(code) { const n = D.NATIONS.find(x => x.code === code); return Object.assign({}, n, S.nations[code]); }
  function nname(code) { return code === 'JPN' ? '日本' : D.NATIONS.find(x => x.code === code).name; }
  function event() { return CALENDAR[S.ev]; }

  // ---------- 日本代表のチーム力 ----------
  function slotsOf(f) { return FORMATIONS[f || S.formation].map(s => s[0]); }

  function available(p) { return p && !p.retired && p.injury <= 0 && !p.susp; }

  function autoPick(ids, formation) {
    const slots = slotsOf(formation);
    const pool = ids.map(player).filter(available);
    const xi = new Array(slots.length).fill(null);
    // 重要度の高いスロットから貪欲に決定
    const order = slots.map((s, i) => i).sort((a, b) => (slots[a] === 'GK' ? -1 : 0) - (slots[b] === 'GK' ? -1 : 0));
    const used = new Set();
    const score = (p, s) => p.ovr * fit(p, s) * (1 + p.form * 0.012) * (0.9 + (p.cond || 95) / 1000) + (p.chem || 0) * 0.02;
    for (let round = 0; round < 2; round++) {
      // 最適割当に近づけるため各スロットで最大値を貪欲に
      const pairs = [];
      for (const i of order) { if (xi[i]) continue; for (const p of pool) if (!used.has(p.id)) pairs.push([score(p, slots[i]), i, p]); }
      pairs.sort((a, b) => b[0] - a[0]);
      for (const [, i, p] of pairs) { if (xi[i] || used.has(p.id)) continue; xi[i] = p.id; used.add(p.id); }
    }
    return xi;
  }

  function xiRating(xi, formation) {
    const slots = slotsOf(formation);
    let s = 0, n = 0;
    xi.forEach((id, i) => { const p = player(id); if (p) { s += p.ovr * fit(p, slots[i]); n++; } });
    return n ? s / 11 : 0;
  }
  function teamChem(xi) { const ps = xi.map(player).filter(Boolean); return ps.length ? ps.reduce((a, p) => a + p.chem, 0) / ps.length : 0; }

  function japanStrength() {
    const ids = active().map(p => p.id);
    const best = autoPick(ids, S.formation);
    return xiRating(best, S.formation);
  }

  function japanSpec(ids) {
    // 気持ちの状態を調子に上乗せした試合用コピー
    const squad = (ids || S.squad).map(player).filter(p => p && !p.retired).map(p => Object.assign({}, p, { form: clamp(p.form + (p.mood || 0) * 0.35, -3, 3.5) }));
    const xi = S.xi.slice();
    const bench = squad.filter(p => !xi.includes(p.id) && available(player(p.id))).map(p => p.id);
    const tb = S.trainBonus || {};
    return {
      code: 'JPN', name: '日本', isUser: true, players: squad, xi, bench,
      formation: S.formation, tactics: Object.assign({}, S.tactics), autoSub: S.autoSub,
      bonus: { att: tb.att || 0, def: tb.def || 0, mid: 0 }, setPiece: !!tb.setPiece,
      chem: teamChem(xi), fam: S.fam[S.formation], morale: S.morale,
      setPlay: Object.assign({ fam: S.spFam }, S.setPlay)
    };
  }

  // ---------- 相手チーム ----------
  const NATION_FORM = { ESP: '4-3-3', FRA: '4-2-3-1', ENG: '4-2-3-1', ARG: '4-3-3', BRA: '4-2-3-1', POR: '4-3-3', GER: '4-2-3-1', NED: '4-3-3', ITA: '3-5-2', MAR: '4-3-3', KOR: '4-2-3-1', IRN: '4-2-3-1', AUS: '4-4-2', URU: '4-3-3', CRO: '4-3-3', BEL: '3-4-2-1', USA: '4-3-3', MEX: '4-3-3', SEN: '4-3-3', COL: '4-2-3-1' };
  function nationSpec(code, vsRating, opts) {
    const n = nation(code);
    const f = NATION_FORM[code] || ['4-2-3-1', '4-3-3', '4-4-2', '3-5-2'][hashStr(code) % 4];
    const slots = slotsOf(f);
    const lineOff = s => s === 'GK' ? n.prof[0] : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(s) ? n.prof[1] : ['DM', 'CM', 'AM', 'LM', 'RM'].includes(s) ? n.prof[2] : n.prof[3];
    const posOf = s => ({ LWB: 'LB', RWB: 'RB', LM: 'LW', RM: 'RW' })[s] || s;
    const stars = (n.stars || []).map(x => { const [nm, r] = x.split('/'); return { nm, r: r || 'F' }; });
    const roleOf = s => s === 'GK' ? 'G' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(s) ? 'D' : ['DM', 'CM'].includes(s) ? 'M' : (s === 'AM' ? 'MF' : 'F');
    const used = new Set();
    const players = slots.map((s, i) => {
      let name = null, boost = 0;
      const role = roleOf(s);
      const si = stars.findIndex((st, k) => !used.has(k) && (st.r === role || (role === 'MF' && (st.r === 'M' || st.r === 'F'))));
      if (si >= 0) { used.add(si); name = stars[si].nm; boost = 4 - Math.min(3, si); }
      return { id: code + i, name: name || `${n.name} ${E.SLOT_LABEL[s]}${[1, 4, 5, 3, 2, 6, 8, 10, 7, 9, 11][i] || i}`, pos: posOf(s), alt: [], ovr: n.rating + lineOff(s) + boost + normal(1.2) - (name ? 0 : 1), traits: name && role === 'F' ? ['決定力'] : [], form: 0, cond: 96 };
    });
    for (let i = 0; i < 9; i++) {
      const pos = ['GK', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'ST', 'LW'][i];
      players.push({ id: code + 'b' + i, name: `${n.name} 控え${i + 12}`, pos, alt: [], ovr: n.rating - 3 + normal(1.5), traits: [], form: 0, cond: 100 });
    }
    // 相手の戦い方
    const diff = n.rating - (vsRating || 78);
    let ment = 'bal', style = 'bal';
    if (diff < -7) { ment = 'def'; style = 'counter'; }
    else if (diff < -3) { ment = rnd() < 0.5 ? 'def' : 'bal'; style = 'counter'; }
    else if (diff > 4) { ment = rnd() < 0.5 ? 'att' : 'bal'; style = ['ESP', 'ARG', 'GER', 'POR', 'NED', 'FRA', 'ENG'].includes(code) ? 'pos' : 'press'; }
    else style = pickW(['bal', 'press', 'pos', 'counter'], () => 1);
    if (opts && opts.plan) { ment = opts.plan.ment; style = opts.plan.style; }
    return {
      code, name: n.name, isUser: false, players, xi: players.slice(0, 11).map(p => p.id), bench: players.slice(11).map(p => p.id),
      formation: f, tactics: { ment, style }, autoSub: true, bonus: {}, chem: 62, fam: 65, homeBoost: (opts && opts.host) ? 1.5 : 0
    };
  }

  // ---------- 大会・予選 ----------
  function roundRobin(teams, double) {
    const t = teams.slice();
    if (t.length % 2) t.push(null);
    const n = t.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const ms = [];
      for (let i = 0; i < n / 2; i++) {
        const a = t[i], b = t[n - 1 - i];
        if (a && b) ms.push(r % 2 === 0 ? { h: a, a: b } : { h: b, a: a });
      }
      rounds.push(ms);
      t.splice(1, 0, t.pop());
    }
    if (double) rounds.push(...rounds.map(r => r.map(m => ({ h: m.a, a: m.h }))));
    return rounds;
  }

  function makeGroup(name, teams, double) { return { name, teams: teams.slice(), rounds: roundRobin(teams, double) }; }

  function table(g) {
    const t = {};
    g.teams.forEach(c => { t[c] = { code: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
    g.rounds.forEach(r => r.forEach(m => {
      if (!m.res) return;
      const [x, y] = [t[m.h], t[m.a]], [gx, gy] = [m.res.ga, m.res.gb];
      x.p++; y.p++; x.gf += gx; x.ga += gy; y.gf += gy; y.ga += gx;
      if (gx > gy) { x.w++; y.l++; x.pts += 3; } else if (gx < gy) { y.w++; x.l++; y.pts += 3; } else { x.d++; y.d++; x.pts++; y.pts++; }
    }));
    return Object.values(t).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || S.nations[b.code].rating - S.nations[a.code].rating);
  }

  function ratingOf(code) { return code === 'JPN' ? (S.jpnRating || japanStrength()) : S.nations[code].rating; }

  function simFixture(m, opts) {
    const host = (opts && opts.hosts) || [];
    let adv = 0;
    if (opts && opts.homeAway) adv = 2;
    else { if (host.includes(m.h)) adv += 1.5; if (host.includes(m.a)) adv -= 1.5; }
    m.res = E.quickSim(ratingOf(m.h), ratingOf(m.a), adv, opts && opts.knockout);
    return m.res;
  }

  function afcRanked(noise) {
    return D.NATIONS.filter(n => n.conf === 'AFC' && n.code !== 'JPN').map(n => ({ c: n.code, r: S.nations[n.code].rating + normal(noise || 0) })).sort((a, b) => b.r - a.r).map(x => x.c);
  }

  function drawGroups(teams, nGroups, constraint) {
    // teams はポット順に並べた配列
    const per = teams.length / nGroups;
    for (let attempt = 0; attempt < 200; attempt++) {
      const groups = Array.from({ length: nGroups }, () => []);
      let ok = true;
      for (let pot = 0; pot < per; pot++) {
        const potTeams = shuffle(teams.slice(pot * nGroups, (pot + 1) * nGroups));
        const order = shuffle(groups.map((g, i) => i));
        for (const tm of potTeams) {
          const gi = order.find(i => groups[i].length === pot && (!constraint || constraint(groups[i], tm)));
          if (gi == null) { ok = false; break; }
          groups[gi].push(tm);
        }
        if (!ok) break;
      }
      if (ok) return groups;
    }
    // 制約なしで再抽選
    return drawGroups(teams, nGroups, null);
  }

  const confOf = c => D.NATIONS.find(n => n.code === c).conf;
  function confOK(group, tm) {
    const c = confOf(tm);
    const same = group.filter(x => confOf(x) === c).length;
    return c === 'UEFA' ? same < 2 : same < 1;
  }

  function setupAsianCup() {
    const others = afcRanked(0).filter(c => c !== 'KSA').slice(0, 22);
    const field = ['JPN', 'KSA'].concat(others);
    const ranked = field.slice().sort((a, b) => ratingOf(b) - ratingOf(a));
    // ポット1：開催国と上位
    const pot1 = ['KSA'].concat(ranked.filter(c => c !== 'KSA').slice(0, 5));
    const rest = ranked.filter(c => !pot1.includes(c));
    const groups = drawGroups(pot1.concat(rest), 6, null);
    return newTour('asiancup', 'アジアカップ2027', groups, ['KSA'], [ 'ラウンド16', '準々決勝', '準決勝', '決勝'], 4);
  }

  function setupWorldCup() {
    const pick = (conf, n, forced) => {
      const list = D.NATIONS.filter(x => x.conf === conf && x.code !== 'JPN' && !forced.includes(x.code));
      return forced.concat(list.map(x => ({ c: x.code, r: S.nations[x.code].rating + normal(2.5) })).sort((a, b) => b.r - a.r).slice(0, n - forced.length).map(x => x.c));
    };
    const afcForced = ['JPN'].concat(S.comps.afcQualified || []);
    const afc = afcForced.concat(afcRanked(2.5).filter(c => !afcForced.includes(c)).slice(0, 8 - afcForced.length));
    const field = [].concat(afc, pick('UEFA', 16, ['ESP', 'POR']), pick('CONMEBOL', 6, ['ARG', 'URU', 'PAR']), pick('CAF', 9, ['MAR']), pick('CONCACAF', 6, []), pick('OFC', 1, []));
    const left = D.NATIONS.filter(x => !field.includes(x.code) && x.conf !== 'UEFA' && x.code !== 'JPN').map(x => ({ c: x.code, r: S.nations[x.code].rating + normal(3) })).sort((a, b) => b.r - a.r).slice(0, 2).map(x => x.c);
    field.push(...left);
    const hosts = ['ESP', 'POR', 'MAR'];
    const ranked = field.filter(c => !hosts.includes(c)).sort((a, b) => ratingOf(b) - ratingOf(a));
    const potted = hosts.concat(ranked);
    const groups = drawGroups(potted, 12, confOK);
    return newTour('wc', 'ワールドカップ2030', groups, hosts, ['ラウンド32', 'ラウンド16', '準々決勝', '準決勝', '決勝'], 8);
  }

  function newTour(comp, name, groupsTeams, hosts, roundNames, thirdSlots) {
    const L = 'ABCDEFGHIJKL';
    return {
      comp, name, hosts, roundNames, thirdSlots, stage: 'group', md: 0,
      groups: groupsTeams.map((ts, i) => makeGroup(L[i], ts, false)),
      ko: [], round: 0, out: false, finish: null, champion: null
    };
  }

  function tourGroupOfJapan(t) { return t.groups.find(g => g.teams.includes('JPN')); }

  function seedOrder(n) {
    let s = [1];
    while (s.length < n) { const m = s.length * 2 + 1; s = s.flatMap(x => [x, m - x]); }
    return s;
  }

  function buildKO(t) {
    const tabs = t.groups.map(g => ({ g: g.name, rows: table(g) }));
    const key = r => r.pts * 10000 + (r.gf - r.ga) * 100 + r.gf;
    const firsts = tabs.map(x => Object.assign({ g: x.g }, x.rows[0])).sort((a, b) => key(b) - key(a));
    const seconds = tabs.map(x => Object.assign({ g: x.g }, x.rows[1])).sort((a, b) => key(b) - key(a));
    const thirds = tabs.map(x => Object.assign({ g: x.g }, x.rows[2])).sort((a, b) => key(b) - key(a)).slice(0, t.thirdSlots);
    const seeds = firsts.concat(seconds, thirds);
    const order = seedOrder(seeds.length);
    const ties = [];
    for (let i = 0; i < order.length; i += 2) ties.push({ a: seeds[order[i] - 1], b: seeds[order[i + 1] - 1] });
    // 同組の再戦を避ける
    for (let i = 0; i < ties.length; i++) {
      if (ties[i].a.g === ties[i].b.g) {
        for (let j = 0; j < ties.length; j++) {
          if (j === i) continue;
          if (ties[j].b.g !== ties[i].a.g && ties[i].b.g !== ties[j].a.g) { const tmp = ties[i].b; ties[i].b = ties[j].b; ties[j].b = tmp; break; }
        }
      }
    }
    t.qualified = seeds.map(s => s.code);
    t.ko = [ties.map(x => ({ h: x.a.code, a: x.b.code }))];
    t.stage = 'ko'; t.round = 0;
  }

  function finishRound(t) {
    const cur = t.ko[t.round];
    const winners = cur.map(m => m.res.winner === 0 ? m.h : m.a);
    if (winners.length === 1) { t.champion = winners[0]; t.stage = 'done'; return; }
    const nx = [];
    for (let i = 0; i < winners.length; i += 2) nx.push({ h: winners[i], a: winners[i + 1] });
    t.ko.push(nx); t.round++;
  }

  // ---------- イベント開始 ----------
  function pickFriendlyOpp(range, exclude) {
    const cands = D.NATIONS.filter(n => n.code !== 'JPN' && !exclude.includes(n.code) && S.nations[n.code].rating >= range[0] && S.nations[n.code].rating <= range[1] && n.conf !== 'AFC');
    const list = cands.length ? cands : D.NATIONS.filter(n => n.code !== 'JPN' && !exclude.includes(n.code));
    return pickW(list, () => 1).code;
  }

  function beginEvent() {
    const ev = event();
    S.phase = 'prep';
    S.training = null; S.trainBonus = null;
    S.scoutPts = Math.min(6, (S.scoutPts || 0) + 3);
    S.cur = { id: ev.id, played: [], prevSquad: S.squad.slice() };
    if (root.SBCamp) S.cur.trips = root.SBCamp.makeTrips();
    S.squad.forEach(id => { const p = player(id); if (p) p.injuredInNT = false; });
    if (ev.kind === 'friendly' || (ev.kind === 'q4' && !(S.comps.q4 && S.comps.q4.teams.includes('JPN')))) {
      const ex = S.matches.slice(0, 6).map(m => m.opp);
      const a = pickFriendlyOpp(ev.pool[0], ex), b = pickFriendlyOpp(ev.pool[1], ex.concat([a]));
      S.cur.friendlies = [a, b];
      S.cur.title = ev.kind === 'q4' ? 'キリンチャレンジカップ' : ev.title;
      S.cur.kind = 'friendly';
      addNews('日程', `${dateStr()}の${S.cur.title}：${nname(a)}戦、${nname(b)}戦が決定。`);
    } else if (ev.kind === 'tour') {
      S.cur.kind = 'tour'; S.cur.title = ev.title;
      if (ev.comp === 'asiancup') S.comps.asiancup = setupAsianCup();
      if (ev.comp === 'wc') S.comps.wc = setupWorldCup();
      const t = S.comps[ev.comp];
      const g = tourGroupOfJapan(t);
      addNews('抽選', `${t.name}の組み合わせ決定：日本はグループ${g.name}（${g.teams.filter(c => c !== 'JPN').map(nname).join('・')}）。`);
    } else if (ev.kind === 'qual') {
      S.cur.kind = 'qual'; S.cur.title = ev.title;
      if (ev.comp === 'q2' && !S.comps.q2) {
        const r = afcRanked(1);
        const g = ['JPN', pickW(r.slice(9, 17), () => 1), pickW(r.slice(17, 24), () => 1), pickW(r.slice(24), () => 1)];
        S.comps.q2 = makeGroup('B', g, true);
        addNews('抽選', `W杯アジア2次予選の組み合わせ決定：${g.slice(1).map(nname).join('・')}と同組。`);
      }
      if (ev.comp === 'q3' && !S.comps.q3) {
        const r = afcRanked(2).slice(0, 17);
        const pots = [r.slice(0, 2), r.slice(2, 5), r.slice(5, 8), r.slice(8, 11), r.slice(11, 14), r.slice(14, 17)];
        const g = ['JPN'].concat(pots.slice(1).map(p => pickW(p, () => 1)));
        S.comps.q3 = makeGroup('C', g, true);
        addNews('抽選', `W杯アジア最終予選の組み合わせ決定：${g.slice(1).map(nname).join('・')}と同組。上位2位がW杯出場権獲得。`);
      }
      S.cur.mds = ev.mds.slice();
    } else if (ev.kind === 'q4') {
      S.cur.kind = 'qual'; S.cur.title = ev.title;
      S.cur.mds = [0, 1, 2];
    }
  }

  function refreshReports() { if (root.SBStaff && S.phase === 'prep') S.cur.reports = root.SBStaff.prepReports(); }

  // 日本の次の試合
  function nextFixture() {
    const ev = event(), c = S.cur;
    if (!c) return null;
    if (c.kind === 'friendly') {
      const i = c.played.length;
      if (i >= c.friendlies.length) return null;
      const venue = ev.venue === 'away' ? 'neutral' : 'home';
      return { comp: 'friendly', label: `${c.title} 第${i + 1}戦`, opp: c.friendlies[i], venue, knockout: false };
    }
    if (c.kind === 'qual') {
      const comp = S.comps[ev.comp];
      while (c.mds.length) {
        const md = c.mds[0];
        const round = comp.rounds[md];
        if (!round) { c.mds.shift(); continue; }
        const m = round.find(x => x.h === 'JPN' || x.a === 'JPN');
        if (!m || m.res) { finishQualRound(comp, md); c.mds.shift(); continue; }
        const isHome = m.h === 'JPN';
        const venue = ev.comp === 'q4' ? 'neutral' : (isHome ? 'home' : 'away');
        return { comp: ev.comp, label: `${c.title} 第${md + 1}節`, opp: isHome ? m.a : m.h, venue, knockout: false, md, ref: m };
      }
      return null;
    }
    if (c.kind === 'tour') {
      const t = S.comps[ev.comp];
      if (t.out || t.stage === 'done') return null;
      const host = t.hosts;
      if (t.stage === 'group') {
        const g = tourGroupOfJapan(t);
        const m = g.rounds[t.md].find(x => x.h === 'JPN' || x.a === 'JPN');
        const opp = m.h === 'JPN' ? m.a : m.h;
        return { comp: t.comp, label: `${t.name} グループ${g.name} 第${t.md + 1}戦`, opp, venue: host.includes(opp) ? 'away' : 'neutral', knockout: false, ref: m, oppHost: host.includes(opp) };
      }
      const m = t.ko[t.round].find(x => x.h === 'JPN' || x.a === 'JPN');
      if (!m) return null;
      const opp = m.h === 'JPN' ? m.a : m.h;
      return { comp: t.comp, label: `${t.name} ${t.roundNames[t.round]}`, opp, venue: host.includes(opp) ? 'away' : 'neutral', knockout: true, ref: m, oppHost: host.includes(opp) };
    }
    return null;
  }

  function finishQualRound(comp, md) {
    const r = comp.rounds[md];
    if (!r) return;
    r.forEach(m => { if (!m.res) simFixture(m, { homeAway: true }); });
  }

  // ---------- 合宿（招集確定） ----------
  function squadIssues(ids) {
    const ps = ids.map(player).filter(Boolean);
    const issues = [];
    const ev = event();
    const max = 26, min = ev.kind === 'tour' ? 23 : 20;
    if (ps.length > max) issues.push(`招集は最大${max}人です（現在${ps.length}人）`);
    if (ps.length < min) issues.push(`最低${min}人を招集してください（現在${ps.length}人）`);
    const gk = ps.filter(p => p.pos === 'GK').length;
    if (gk < 3) issues.push('GKを3人以上招集してください');
    if (ps.some(p => p.injury > 0)) issues.push('負傷中の選手が含まれています');
    return issues;
  }

  // ---------- 招集の流れ：発表 → 記者会見 → 合宿 ----------
  function announce() {
    if (S.phase !== 'prep' || squadIssues(S.squad).length) return false;
    const M = root.SBMedia;
    S.cur.announce = M.announcement();
    M.applyAnnouncement(S.cur.announce);
    S.phase = 'announce';
    save();
    return true;
  }

  function startPress() {
    if (S.phase !== 'announce') return;
    S.cur.press = { qs: root.SBMedia.questions(), answers: [] };
    S.phase = 'press';
    save();
  }

  function answerPress(ai) {
    const pr = S.cur.press;
    if (S.phase !== 'press' || !pr || pr.answers.length >= pr.qs.length) return null;
    const q = pr.qs[pr.answers.length];
    const a = q.a[ai];
    root.SBMedia.applyEffects(a.eff);
    pr.answers.push(ai);
    if (pr.answers.length >= pr.qs.length) {
      pr.media = root.SBMedia.pressReaction(pr);
      pr.media.heads.forEach(h => addNews('メディア', `${h.outlet}「${h.text}」`));
    }
    save();
    return a;
  }

  function startCamp() {
    if (S.phase !== 'press' && S.phase !== 'announce') return;
    const ev = event();
    S.cur.camp = { days: ev.kind === 'tour' ? 4 : 3, done: [], log: [], bonus: {} };
    // 招集外は連携が落ちる
    active().forEach(p => { if (!S.squad.includes(p.id)) p.chem = Math.max(0, p.chem - 4); });
    S.squad.map(player).forEach(p => {
      p.chem = Math.min(100, p.chem + 5);
      p.know = 3;
      p.cond = campCondition(p);
      if (age(p) < 23) p.ovr = Math.min(p.pot + 1, p.ovr + 0.15);
      p.campCount = (p.campCount || 0) + 1;
      p.lastCamp = S.date.y * 12 + S.date.m;
    });
    // 士気：直近の結果と世論に引っ張られる
    S.morale = clamp(S.morale + (S.fans - 50) * 0.05, 0, 100);
    S.phase = 'camp';
    if (ev.kind === 'tour') S.tourSquad = S.squad.slice();
    save();
  }

  function trainSession(key) { return S.phase === 'camp' ? root.SBCamp.session(key) : null; }

  function finishCamp() {
    if (S.phase !== 'camp') return;
    const c = S.cur.camp;
    S.trainBonus = c.bonus;
    S.training = c.done.slice();
    if (!S.xi.length || S.xi.some(id => !S.squad.includes(id) || !available(player(id)))) S.xi = autoPick(S.squad, S.formation);
    S.jpnRating = xiRating(autoPick(S.squad, S.formation), S.formation);
    S.phase = 'match';
    save();
  }

  // テスト・自動進行用：発表から合宿終了まで既定の選択で進める
  const FOCUS_MENU = { tactic: ['tactic', 'tactic', 'meeting'], attack: ['attack', 'attack', 'game'], defense: ['defense', 'defense', 'tactic'], setpiece: ['setpiece', 'setpiece', 'tactic'], physical: ['recovery', 'tactic', 'recovery'], youth: ['youth', 'youth', 'game'], team: ['meeting', 'bond', 'tactic'] };
  function confirmCamp(focus) {
    if (!announce()) return;
    startPress();
    S.cur.press.qs.forEach(() => answerPress(0));
    startCamp();
    const plan = (FOCUS_MENU[focus] || FOCUS_MENU.tactic).slice();
    while (S.cur.camp.done.length < S.cur.camp.days) trainSession(plan[S.cur.camp.done.length % plan.length]);
    finishCamp();
  }

  // 合宿時のコンディション：クラブでの稼働、試合勘、シーズン終盤の疲労、負傷明け
  function campCondition(p) {
    let c = 100 - ri(0, 7);
    if ((p.load || 0) > 500) c -= 5; else if ((p.load || 0) > 400) c -= 2;
    c -= Math.max(0, 70 - (p.sharp == null ? 70 : p.sharp)) * 0.15;
    if (S.date.m === 6 && !root.SBWorld.isJ(p.club)) c -= 4;
    if (root.SBWorld.weeksSinceReturn(S, p) < 6) c -= 6;
    return clamp(Math.round(c), 65, 100);
  }

  // 自動選考：ポジション枠ごとに能力・調子の高い順
  function autoSquad(n) {
    n = n || 26;
    const ps = visible().filter(available);
    const score = p => p.ovr + p.form * 0.6 + (p.status === 'bench' ? -1.5 : 0) + p.chem * 0.01;
    const quota = [['GK', ['GK'], 3], ['CB', ['CB'], 5], ['SB', ['LB', 'RB'], 4], ['CM', ['DM', 'CM'], 5], ['AT', ['AM', 'LW', 'RW'], 6], ['ST', ['ST'], 3]];
    const pick = new Set();
    for (const [, poss, q] of quota) ps.filter(p => poss.includes(p.pos)).sort((a, b) => score(b) - score(a)).slice(0, q).forEach(p => pick.add(p.id));
    ps.filter(p => p.pos !== 'GK' && !pick.has(p.id)).sort((a, b) => score(b) - score(a)).forEach(p => { if (pick.size < n) pick.add(p.id); });
    return [...pick];
  }

  function scout(id) {
    const p = player(id);
    if (!p || S.scoutPts <= 0 || p.know >= 3) return false;
    S.scoutPts--; p.know++;
    return true;
  }

  // ---------- 試合 ----------
  function createMatch(fx) {
    S.xi = S.xi.map(id => (S.squad.includes(id) && available(player(id))) ? id : null);
    // 空いた枠は適性の高い控えで埋める
    const slots = slotsOf();
    while (S.xi.length < slots.length) S.xi.push(null);
    slots.forEach((s, i) => {
      if (S.xi[i]) return;
      const c = S.squad.map(player).filter(p => available(p) && !S.xi.includes(p.id)).sort((a, b) => b.ovr * fit(b, s) - a.ovr * fit(a, s))[0];
      if (c) S.xi[i] = c.id;
    });
    const jp = japanSpec();
    const opp = nationSpec(fx.opp, S.jpnRating, { host: fx.oppHost, plan: oppPlan(fx) });
    let home, away, neutral = fx.venue === 'neutral';
    if (fx.venue === 'away') { home = opp; away = jp; } else { home = jp; away = opp; }
    if (fx.oppHost) { neutral = false; home = opp; away = jp; opp.homeBoost = 0; }
    const sim = new E.MatchSim(home, away, { neutral, knockout: fx.knockout });
    sim.userSide = home.isUser ? 0 : 1;
    return sim;
  }

  // 試合ごとの相手の作戦（分析担当のレポートと一致させる）
  function oppPlan(fx) {
    S.cur.plans = S.cur.plans || {};
    const k = fx.label + fx.opp;
    if (!S.cur.plans[k]) { const sp = nationSpec(fx.opp, S.jpnRating || japanStrength()); S.cur.plans[k] = { ment: sp.tactics.ment, style: sp.tactics.style, formation: sp.formation }; }
    return S.cur.plans[k];
  }

  function resultOutcome(gf, ga, pensWin) { if (gf > ga) return 'W'; if (gf < ga) return 'L'; return pensWin == null ? 'D' : (pensWin ? 'W' : 'L'); }

  function applyResult(fx, sim) {
    const r = sim.result();
    const us = sim.userSide, them = 1 - us;
    const gf = r.score[us], ga = r.score[them];
    const pensWin = r.pens ? r.pens[us] > r.pens[them] : null;
    const out = resultOutcome(gf, ga, pensWin);
    const scorers = [];
    // 選手データ更新
    r.players[us].forEach(x => {
      const p = player(x.id); if (!p) return;
      if (x.minutes > 0 || x.slot) {
        p.caps++; p.goals += x.goals; p.assists += x.assists;
        p.ratings.push(x.rating); if (p.ratings.length > 10) p.ratings.shift();
        p.form = clamp(p.form + (x.rating - 6.5) * 0.35, -3, 3);
        p.chem = Math.min(100, p.chem + 1);
        p.cond = clamp(p.cond - x.minutes * 0.14, 40, 100);
        if (x.goals) scorers.push(x.goals > 1 ? `${p.name}×${x.goals}` : p.name);
      }
      if (x.red) p.susp = 1;
      if (x.injured) {
        const inj = root.SBWorld.rollInjury(S, p, true);
        p.injuredInNT = true;
        addNews('負傷', `${p.name}が代表戦で負傷。診断は${inj.t}、全治${inj.w >= 9 ? `約${Math.round(inj.w / 4.33)}か月` : `約${inj.w}週間`}。`, 'bad');
      }
    });
    // 出場停止の消化（出場しなかった選手）
    S.squad.forEach(id => { const p = player(id); if (p && p.susp && !r.players[us].some(x => x.id === id)) p.susp = 0; });
    // 次の試合までの数日で回復が進む
    S.squad.forEach(id => { const p = player(id); if (p && p.injury > 0 && !r.players[us].some(x => x.id === id && x.injured)) p.injury = Math.max(0, p.injury - 0.6); });
    S.squad.forEach(id => { const p = player(id); if (p && !r.players[us].some(x => x.id === id)) p.cond = Math.min(100, p.cond + 6); });
    S.fam[S.formation] = Math.min(100, S.fam[S.formation] + 3);

    // 協会評価
    const jr = S.jpnRating || 78, or = S.nations[fx.opp].rating + (fx.venue === 'away' ? 1.5 : 0) - (fx.venue === 'home' ? 1.5 : 0);
    const exp = 1 / (1 + Math.exp(-(jr - or) / 4));
    const act = out === 'W' ? 1 : out === 'D' ? 0.5 : 0;
    const K = fx.comp === 'friendly' ? 6 : (fx.comp === 'q2' || fx.comp === 'q3' || fx.comp === 'q4') ? 10 : 8;
    const delta = Math.round(K * (act - exp) * 10) / 10;
    S.board = clamp(S.board + delta, 0, 100);

    const rec = {
      d: dateStr(), comp: fx.comp, label: fx.label, opp: fx.opp, venue: fx.venue, gf, ga, pens: r.pens ? [r.pens[us], r.pens[them]] : null, out,
      scorers, poss: r.possession[us], shots: [r.stats[us].shots, r.stats[them].shots], xg: [r.stats[us].xg, r.stats[them].xg], board: delta,
      motm: (() => { const all = r.players[us].filter(x => x.minutes >= 30).sort((a, b) => b.rating - a.rating)[0]; return all ? all.name : ''; })()
    };
    // 出場時間で選手の気持ちが変わる
    S.squad.forEach(id => {
      const p = player(id); if (!p) return;
      const x = r.players[us].find(y => y.id === id);
      p.mood = clamp((p.mood || 0) + (!x ? -0.35 : x.minutes >= 60 ? 0.25 : 0.05), -3, 3);
    });
    const media = root.SBMedia ? root.SBMedia.matchReaction(rec) : null;
    if (media) {
      rec.media = media;
      S.fans = clamp(S.fans + media.fansD, 0, 100);
      S.morale = clamp(S.morale + media.moraleD, 0, 100);
      addNews('報道', `${media.outlet}「${media.head}」`, out === 'W' ? 'good' : out === 'L' ? 'bad' : '');
    }
    S.matches.unshift(rec);
    S.cur.played.push(rec);

    // 大会/予選の進行
    if (fx.ref) {
      fx.ref.res = fx.ref.h === 'JPN' ? { ga: gf, gb: ga, pens: rec.pens, winner: out === 'W' ? 0 : out === 'L' ? 1 : null } : { ga: ga, gb: gf, pens: rec.pens ? [rec.pens[1], rec.pens[0]] : null, winner: out === 'W' ? 1 : out === 'L' ? 0 : null };
    }
    const ev = event();
    if (S.cur.kind === 'qual') {
      const comp = S.comps[ev.comp];
      finishQualRound(comp, fx.md);
      S.cur.mds.shift();
    }
    if (S.cur.kind === 'tour') advanceTour(S.comps[ev.comp]);
    save();
    return rec;
  }

  function advanceTour(t) {
    if (t.stage === 'group') {
      t.groups.forEach(g => g.rounds[t.md].forEach(m => { if (!m.res) simFixture(m, { hosts: t.hosts }); }));
      t.md++;
      if (t.md >= 3) {
        buildKO(t);
        if (!t.qualified.includes('JPN')) {
          t.out = true; t.finish = 'グループリーグ敗退';
          simRestOfTour(t);
        } else {
          const m = t.ko[0].find(x => x.h === 'JPN' || x.a === 'JPN');
          addNews('大会', `日本、決勝トーナメント進出！ ${t.roundNames[0]}の相手は${nname(m.h === 'JPN' ? m.a : m.h)}。`);
        }
      }
      return;
    }
    if (t.stage === 'ko') {
      const cur = t.ko[t.round];
      cur.forEach(m => { if (!m.res) simFixture(m, { hosts: t.hosts, knockout: true }); });
      const jm = cur.find(x => x.h === 'JPN' || x.a === 'JPN');
      const jWin = (jm.res.winner === 0) === (jm.h === 'JPN');
      const rn = t.roundNames[t.round];
      if (!jWin) {
        t.out = true;
        t.finish = rn === '決勝' ? '準優勝' : rn === '準決勝' ? 'ベスト4' : rn === '準々決勝' ? 'ベスト8' : rn === 'ラウンド16' ? 'ベスト16' : 'ベスト32';
        finishRound(t);
        simRestOfTour(t);
      } else {
        finishRound(t);
        if (t.stage === 'done') t.finish = '優勝';
        else { const m = t.ko[t.round].find(x => x.h === 'JPN' || x.a === 'JPN'); addNews('大会', `日本、${t.roundNames[t.round]}進出！ 相手は${nname(m.h === 'JPN' ? m.a : m.h)}。`); }
      }
    }
  }

  function simRestOfTour(t) {
    let g = 0;
    while (t.stage !== 'done' && g++ < 10) {
      if (t.stage === 'group') { advanceTourNoJapan(t); continue; }
      t.ko[t.round].forEach(m => { if (!m.res) simFixture(m, { hosts: t.hosts, knockout: true }); });
      finishRound(t);
    }
  }
  function advanceTourNoJapan(t) {
    while (t.md < 3) { t.groups.forEach(g => g.rounds[t.md].forEach(m => { if (!m.res) simFixture(m, { hosts: t.hosts }); })); t.md++; }
    buildKO(t);
  }

  // ---------- イベント終了 ----------
  function eventFinished() { return S.phase === 'match' && !nextFixture(); }

  function endEvent() {
    const ev = event();
    const summary = { title: S.cur.title || ev.title, lines: [] };
    let boardDelta = 0;
    if (ev.kind === 'tour') {
      const t = S.comps[ev.comp];
      const fin = t.finish || '—';
      summary.lines.push(`日本の成績：${fin}`);
      summary.lines.push(`優勝：${nname(t.champion)}`);
      if (ev.comp === 'asiancup') {
        boardDelta = { '優勝': 20, '準優勝': 10, 'ベスト4': 4, 'ベスト8': -6, 'ベスト16': -12, 'グループリーグ敗退': -22 }[fin] || 0;
        addNews('大会', `アジアカップ2027閉幕。日本は${fin}。優勝は${nname(t.champion)}。`, fin === '優勝' ? 'good' : '');
      } else {
        S.wcResult = fin;
        addNews('大会', `ワールドカップ2030閉幕。日本は${fin}。優勝は${nname(t.champion)}。`, fin === '優勝' ? 'good' : '');
      }
      S.squad.forEach(id => { const p = player(id); if (p) p.susp = 0; });
    }
    if (ev.kind === 'qual' || ev.kind === 'q4') {
      const comp = S.comps[ev.comp];
      if (comp) {
        const tb = table(comp);
        const pos = tb.findIndex(r => r.code === 'JPN') + 1;
        summary.lines.push(`${ev.title}：現在${pos}位（${tb[pos - 1].pts}pt）`);
        const last = comp.rounds.every(r => r.every(m => m.res));
        if (last) {
          if (ev.comp === 'q2') {
            if (pos <= 2) { addNews('予選', `2次予選を${pos}位で突破。最終予選へ。`, 'good'); summary.lines.push('最終予選進出！'); }
            else { S.phase = 'over'; S.overReason = 'W杯アジア2次予選で敗退しました。'; }
          }
          if (ev.comp === 'q3') {
            const others = tb.filter(r => r.code !== 'JPN');
            if (pos <= 2) {
              S.comps.afcQualified = tb.slice(0, 2).map(r => r.code).filter(c => c !== 'JPN');
              S.wcQualified = true;
              addNews('予選', `最終予選${pos}位でワールドカップ2030出場決定！`, 'good');
              summary.lines.push('W杯出場決定！'); boardDelta += 12;
            } else if (pos <= 4) {
              S.comps.afcQualified = tb.slice(0, 2).map(r => r.code);
              const r = afcRanked(2).filter(c => !tb.some(x => x.code === c)).slice(0, 4);
              const g = ['JPN', r[0], r[1]];
              S.comps.q4 = makeGroup('A', g, false);
              addNews('予選', `最終予選${pos}位。4次予選（${nname(r[0])}・${nname(r[1])}）に回る。`, 'bad');
              summary.lines.push('4次予選へ…'); boardDelta -= 15;
            } else { S.phase = 'over'; S.overReason = 'W杯アジア最終予選で敗退しました。'; }
            void others;
          }
          if (ev.comp === 'q4') {
            if (pos === 1) { S.wcQualified = true; addNews('予選', '4次予選を1位で突破し、W杯出場決定！', 'good'); summary.lines.push('W杯出場決定！'); boardDelta += 8; }
            else { S.phase = 'over'; S.overReason = 'W杯アジア4次予選で敗退し、出場権を逃しました。'; }
          }
        }
      }
    }
    if (ev.kind === 'tour' && root.SBMedia) {
      const pd = root.SBMedia.promiseResult(S.comps[ev.comp].finish);
      if (pd) { S.fans = clamp(S.fans + pd * 1.5, 0, 100); boardDelta += pd; summary.lines.push(pd > 0 ? '会見で掲げた目標を達成した' : '会見で掲げた目標に届かず、批判を浴びた'); }
    }
    // 世論は協会の評価にも響く
    boardDelta += Math.round((S.fans - 50) * 0.06);
    if (S.fans < 25) addNews('メディア', `${S.coach}監督の解任を求める声がネット上で拡大。`, 'bad');
    S.board = clamp(S.board + boardDelta, 0, 100);
    if (boardDelta) summary.lines.push(`協会評価 ${boardDelta > 0 ? '+' : ''}${boardDelta}`);
    const res = S.cur.played;
    if (res.length) summary.lines.unshift(res.map(m => `${nname(m.opp)} ${m.gf}-${m.ga}${m.pens ? `(PK${m.pens[0]}-${m.pens[1]})` : ''}`).join(' / '));
    if (S.phase !== 'over' && S.board <= 10) { S.phase = 'over'; S.overReason = '成績不振により協会から解任されました。'; }
    if (S.phase !== 'over' && ev.comp === 'wc') S.phase = 'ended';
    S.lastSummary = summary;
    if (S.phase === 'match') S.phase = 'summary';
    save();
    return summary;
  }

  // 次のイベントまで時間を進める
  function advance() {
    if (S.phase !== 'summary') return;
    S.ev++;
    const nx = event();
    if (!nx) { S.phase = 'ended'; save(); return; }
    // 協会評価は時間とともに平常へ戻る
    S.board = clamp(S.board + (50 - S.board) * 0.1, 0, 100);
    // 招集解除
    S.squad.forEach(id => { const p = player(id); if (p) p.susp = 0; });
    while (S.date.y * 100 + S.date.m < nx.y * 100 + nx.m) { stepMonth(); }
    // 熟成度は使っていない形が少し下がる
    Object.keys(S.fam).forEach(f => { if (f !== S.formation) S.fam[f] = Math.max(25, S.fam[f] - 2); });
    // 負傷者・引退者は招集リストから外す
    S.squad = S.squad.filter(id => { const p = player(id); return p && !p.retired; });
    S.xi = S.xi.filter(id => S.squad.includes(id));
    if (S.xi.length !== 11) S.xi = [];
    beginEvent();
    refreshReports();
    save();
  }

  function stepMonth() {
    S.date.m++;
    if (S.date.m > 12) { S.date.m = 1; S.date.y++; }
    const m = S.date.m;
    const ps = active();
    root.SBWorld.month(S);
    ps.forEach(p => developMonth(p));
    ps.forEach(p => {
      p.mood = (p.mood || 0) * 0.75;
      // 埋もれていた選手もクラブで頭角を現せば知られる
      if (p.hidden && (p.ovr >= 70 || (p.season && p.season.g >= 8))) { p.hidden = false; addNews('新星', `${p.name}（${p.club}・${ageInt(p)}歳）が頭角を現している。`, 'good'); }
    });
    S.morale = clamp(S.morale + (55 - S.morale) * 0.08, 0, 100);
    S.fans = clamp(S.fans + (52 - S.fans) * 0.05, 0, 100);
    if (m === 1) yearly();
    if (m === 4) newProspects();
    if (m === 7) retirements();
    ps.forEach(p => { if (S.date.m % 3 === 0 || S.date.m === 7) p.hist.push([dateKey(), Math.round(p.ovr)]); if (p.hist.length > 30) p.hist.shift(); });
  }

  function developMonth(p) {
    const a = age(p);
    let base;
    if (a < 19) base = 0.3; else if (a < 21) base = 0.25; else if (a < 23) base = 0.17; else if (a < 25) base = 0.09; else if (a < 27) base = 0.04;
    else if (a < 29) base = -0.02; else if (a < 31) base = -0.09; else if (a < 33) base = -0.18; else base = -0.3;
    let g = base > 0 ? base * clamp((p.pot - p.ovr) / 8, -0.2, 1.2) : base;
    // 出場時間が成長を左右する（オフシーズンはクラブでの立場で代用）
    const mo = p.month;
    const play = mo && mo.n ? mo.min / (mo.n * 90) : ({ reg: 0.8, rot: 0.45, bench: 0.1, youth: 0.6 })[p.status];
    const st = (play - 0.45) * (a < 27 ? 0.22 : 0.1);
    const tierB = { 1: 0.08, 2: 0.05, 3: 0.03, 4: 0.01, 5: -0.02, 6: 0 }[p.tier];
    g += st + tierB + normal(0.12);
    if (p.injury > 0) g = Math.min(g, 0) - 0.04;
    p.ovr = clamp(p.ovr + g, 40, Math.max(p.pot + 2, p.ovr));
  }

  function yearly() {
    // 各国の実力変動
    Object.keys(S.nations).forEach(c => { const n = S.nations[c]; n.rating = clamp(n.rating + normal(0.9) + (n.base - n.rating) * 0.25, n.base - 4, n.base + 4); });
    active().forEach(p => {
      if (age(p) < 24) {
        p.pot = Math.min(94, Math.max(p.ovr, p.pot + normal(1.2)));
        if (rnd() < 0.03) { p.pot = Math.min(94, p.pot + 4); addNews('覚醒', `${p.name}（${ageInt(p)}歳）が急成長中。評価が急上昇。`, 'good'); }
      }
      p.pot = Math.max(p.pot, p.ovr);
    });
  }

  function newProspects() {
    // 高校・ユース・大学からの新星（ユース所属はプロへ）
    active().forEach(p => { if (p.tier === 6 && age(p) >= 18) { p.club = pickW(D.CLUBS[5], () => 1); p.tier = 5; p.status = clubStatus(p); } });
    const n = ri(3, 5);
    const names = [];
    for (let i = 0; i < n; i++) { const p = genProspect(S.date.y); S.players.push(p); p.hist.push([dateKey(), Math.round(p.ovr)]); names.push(`${p.name}（${p.club}・${E.POS_LABEL[p.pos]}）`); }
    addNews('新星', `新シーズン注目の若手：${names.join('、')}`);
  }

  function retirements() {
    active().forEach(p => {
      const a = age(p);
      if ((a >= 35 && rnd() < 0.5) || (a >= 33 && p.ovr < 70 && rnd() < 0.35) || (a >= 38)) {
        p.retired = true;
        if (p.real || p.caps > 5) addNews('引退', `${p.name}（${Math.floor(a)}歳）が${a >= 35 ? '現役引退' : '代表引退'}を表明。${p.caps ? `監督就任後の代表通算${p.caps}試合${p.goals}得点。` : '長年の功績に感謝。'}`);
      }
      // ピークを過ぎた選手でも出場がなければ代表から遠のく
    });
  }

  // ---------- 保存 ----------
  function save() { try { S.nextId = nextId; localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 保存不可 */ } }
  function load() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return null;
      S = JSON.parse(s); nextId = S.nextId || 10000;
      return S;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 無視 */ } }
  function state() { return S; }
  function setState(s) { S = s; }

  root.SBWorld.init({ addNews, age, clubStatus, dateKey, active: () => active() });

  root.SBGame = {
    CALENDAR, STATUS_LABEL, newGame, load, save, clearSave, state, setState, event, player, active, nation, nname,
    age, ageInt, attributes, potRange, potGrade, autoPick, xiRating, teamChem, japanStrength, slotsOf, available, squadIssues,
    confirmCamp, announce, startPress, answerPress, startCamp, trainSession, finishCamp, addNews, visible, scout, autoSquad, nextFixture, createMatch, applyResult, eventFinished, endEvent, advance, table, tourGroupOfJapan, dateStr,
    nationSpec, japanSpec, stepMonth, oppPlan, refreshReports, campCondition
  };
})(typeof window !== 'undefined' ? window : globalThis);
