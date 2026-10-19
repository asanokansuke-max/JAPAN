// 代表運営のリアル要素：クラブとの交渉、移動と気候、主将、二重国籍、協会との面談、分析の重点
(function (root) {
  'use strict';
  const G = root.SBGame, W = root.SBWorld, E = root.SBEngine, D = root.SBData;
  const { clamp, pickW } = E;
  const rnd = () => Math.random();
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const mood = (p, d) => { p.mood = clamp((p.mood || 0) + d, -3, 3); };

  // ---------- 移動・時差・気候 ----------
  const REGION = {
    ME: ['KSA', 'QAT', 'UAE', 'IRQ', 'JOR', 'OMA', 'BHR', 'KUW', 'SYR', 'PLE', 'LBN', 'IRN'],
    SEA: ['THA', 'VIE', 'IDN', 'MAS', 'PHI', 'MYA', 'SIN'],
    EA: ['KOR', 'CHN', 'PRK', 'HKG', 'TPE'],
    CA: ['UZB', 'KGZ', 'TJK'], SA: ['IND'], OC: ['AUS', 'NZL', 'NCL']
  };
  const REGION_LABEL = { JP: '日本', ME: '中東', SEA: '東南アジア', EA: '東アジア', CA: '中央アジア', SA: '南アジア', OC: 'オセアニア', EU: '欧州', US: '北米', AF: 'アフリカ', SAM: '南米' };
  function regionOf(code) {
    for (const r in REGION) if (REGION[r].includes(code)) return r;
    const n = D.NATIONS.find(x => x.code === code);
    return n ? ({ UEFA: 'EU', CAF: 'AF', CONMEBOL: 'SAM', CONCACAF: 'US', OFC: 'OC' })[n.conf] || 'EU' : 'EU';
  }
  // 試合会場の地域と気候
  function venueInfo(fx) {
    const S = G.state();
    const ev = G.event();
    let loc;
    if (fx.comp === 'asiancup') loc = 'ME';
    else if (fx.comp === 'wc') loc = 'EU';
    else if (fx.comp === 'olympic') loc = 'US';
    else if (fx.venue === 'home') loc = 'JP';
    else if (fx.venue === 'away') loc = regionOf(fx.opp);
    else loc = ev.kind === 'q4' ? 'ME' : 'EU';
    const m = S.date.m;
    let climate = null;
    if (loc === 'ME' && [5, 6, 7, 8, 9, 10].includes(m)) climate = '酷暑';
    else if (loc === 'SEA') climate = '高温多湿';
    else if ((loc === 'EU' || loc === 'US') && [6, 7].includes(m)) climate = '夏の暑さ';
    const city = fx.comp === 'asiancup' ? 'サウジアラビア' : fx.comp === 'wc' ? 'スペイン・ポルトガル・モロッコ' : fx.comp === 'olympic' ? 'ロサンゼルス' : fx.venue === 'home' ? '日本' : fx.venue === 'away' ? G.nname(fx.opp) : REGION_LABEL[loc];
    return { loc, climate, city, oppAcclim: regionOf(fx.opp) === loc || (loc === 'ME' && regionOf(fx.opp) === 'ME') };
  }
  // 所属クラブから合宿地への移動による消耗
  function travelPenalty(p, loc) {
    const fromEU = !W.isJ(p.club) && !W.isYouth(p.club);
    if (loc === 'JP') return fromEU ? 5 : 0;
    if (loc === 'EU') return fromEU ? 0 : 5;
    if (loc === 'US') return 5;
    if (loc === 'ME') return fromEU ? 2 : 3;
    return fromEU ? 4 : 2;
  }

  // ---------- 主将 ----------
  function leadership(p) {
    if (!p) return 0;
    return Math.round((p.traits.includes('リーダー') ? 25 : 0) + (p.mentor ? 10 : 0) + Math.min(p.caps, 80) * 0.25 + clamp(G.age(p) - 22, 0, 12) * 1.5 + (p.chem || 0) * 0.15 + (p.mood || 0) * 3);
  }
  function suggestCaptain(ids) {
    return ids.map(G.player).filter(Boolean).sort((a, b) => leadership(b) - leadership(a)).slice(0, 2).map(p => p.id);
  }
  function setCaptain(id, vice) {
    const S = G.state();
    const p = G.player(id);
    if (!p) return;
    if (vice) { S.vice = id; if (S.captain === id) S.captain = null; G.save(); return; }
    const old = S.captain && G.player(S.captain);
    if (old && old.id !== id && S.squad.includes(old.id) && S.captainSince) {
      mood(old, -1.5); S.morale = clamp(S.morale - 3, 0, 100);
      G.addNews('チーム', `主将交代。${old.name}に代わり${p.name}がキャプテンに。チーム内に波紋も。`);
    }
    S.captain = id; if (S.vice === id) S.vice = null;
    S.captainSince = S.captainSince || (S.date.y * 100 + S.date.m);
    mood(p, 1);
    G.save();
  }
  // 試合での主将効果（士気の上乗せ）
  function leaderBonus(xi) {
    const S = G.state();
    const c = xi.includes(S.captain) ? G.player(S.captain) : xi.includes(S.vice) ? G.player(S.vice) : null;
    if (!c) return -0.3;
    return clamp((leadership(c) - 30) * 0.03, -0.5, 1.5) * (c.id === S.captain ? 1 : 0.6);
  }

  // ---------- クラブとの招集交渉 ----------
  function clubRel(club) { const S = G.state(); S.clubRel = S.clubRel || {}; return S.clubRel[club] == null ? 60 : S.clubRel[club]; }
  function addRel(club, d) { const S = G.state(); S.clubRel = S.clubRel || {}; S.clubRel[club] = clamp(clubRel(club) + d, 0, 100); }

  function clubRequests() {
    const S = G.state();
    const ev = G.event();
    const reqs = [];
    const ps = S.squad.map(G.player).filter(Boolean).filter(p => !W.isYouth(p.club));
    for (const p of ps) {
      if (reqs.length >= 3) break;
      const eu = !W.isJ(p.club);
      const rel = clubRel(p.club);
      const grumpy = rel < 40 ? 0.25 : 0;
      let type = null;
      if (ev.comp === 'e1') break;
      if (ev.comp === 'olympic' && eu && rnd() < 0.55 + grumpy) type = 'refuse';
      else if (ev.comp === 'asiancup' && eu && p.tier <= 3 && rnd() < 0.3 + grumpy) type = pickW(['late', 'limit'], () => 1);
      else if (W.weeksSinceReturn(S, p) < 8 && rnd() < 0.4) type = 'limit';
      else if ((p.load || 0) > 500 && p.tier <= 2 && rnd() < 0.12 + grumpy) type = 'limit';
      else if (grumpy && rnd() < 0.12) type = 'limit';
      if (!type) continue;
      const text = {
        refuse: `${p.club}が${p.name}の招集見送りを要請。「シーズン前の大事な時期。今回は出せない」`,
        late: `${p.club}が${p.name}の合流を遅らせたいと要請。「リーグ戦に出てから送り出したい」（初戦は欠場）`,
        limit: `${p.club}が${p.name}の出場時間の制限を要請。「1試合60分までにしてほしい」`
      }[type];
      reqs.push({ id: p.id, club: p.club, type, text, done: null });
    }
    return reqs;
  }

  function resolveClub(i, accept) {
    const S = G.state();
    const r = S.cur.clubReq && S.cur.clubReq[i];
    if (!r || r.done) return;
    const p = G.player(r.id);
    r.done = accept ? 'accept' : 'reject';
    if (accept) {
      addRel(r.club, 6);
      if (r.type === 'refuse') { S.squad = S.squad.filter(id => id !== p.id); S.xi = S.xi.map(x => x === p.id ? null : x); G.addNews('招集', `${p.name}はクラブの要請で招集を見送り。`); }
      if (r.type === 'late') p.awayGames = 1;
      if (r.type === 'limit') p.minCap = 60;
    } else {
      addRel(r.club, -15);
      mood(p, -0.4);
      G.addNews('クラブ', `${r.club}、日本代表の対応に不快感。${p.name}の扱いを巡り関係がぎくしゃく。`, 'bad');
      if (clubRel(r.club) < 30) { p.standing = clamp(p.standing - 1, -6, 6); }
    }
    G.save();
  }

  // ---------- 合宿の規律問題 ----------
  function disciplineEvent(sq) {
    const S = G.state();
    const cap = G.player(S.captain);
    const lead = leadership(cap);
    // 家族の事情による申し出
    if (root.SBLife && rnd() < 0.04) { const fr = root.SBLife.familyRequest(sq); if (fr) { S.cur.camp.pending = fr; return fr.text; } }
    if (rnd() > 0.09 * (lead >= 45 ? 0.5 : 1)) return null;
    const p = pickW(sq.filter(x => x.id !== S.captain), x => (G.age(x) < 25 ? 2 : 1) * ((x.mood || 0) < 0 ? 2 : 1));
    if (!p) return null;
    const kind = pickW([['curfew', `${p.name}が門限を破って外出していたことが発覚`], ['sns', `${p.name}がSNSで不用意な発言。チーム批判とも取れる内容が拡散`]], x => 1);
    S.cur.camp.pending = { kind: kind[0], id: p.id, text: kind[1] };
    return kind[1] + '。処分を決める必要がある';
  }

  function resolveDiscipline(choice) {
    const S = G.state();
    const c = S.cur.camp, pd = c && c.pending;
    if (!pd) return null;
    const p = G.player(pd.id);
    let line;
    if (pd.kind === 'family') {
      line = root.SBLife.resolveFamily(pd, choice);
      c.pending = null;
      c.log.push({ day: c.done.length, key: 'disc', name: '選手の申し出', lines: [line] });
      G.save();
      return line;
    }
    if (choice === 'strict') { p.awayGames = 1; mood(p, -1.5); S.morale = clamp(S.morale + 2, 0, 100); S.fans = clamp(S.fans + 2, 0, 100); line = `${p.name}を次戦メンバー外とする厳しい処分。規律を示した`; G.addNews('チーム', `${S.coach}監督、規律違反の${p.name}を次戦メンバー外に。`); }
    else if (choice === 'warn') { mood(p, -0.4); line = `${p.name}に口頭で注意。チームへの影響は最小限に`; }
    else {
      S.morale = clamp(S.morale - 3, 0, 100); line = `${p.name}の件は不問に。一部の選手からは不満の声も`;
      if (rnd() < 0.5) { S.fans = clamp(S.fans - 4, 0, 100); G.addNews('メディア', `${p.name}の規律違反が報道で発覚。監督の対応に批判。`, 'bad'); line += '。のちに報道で発覚した'; }
    }
    c.pending = null;
    c.log.push({ day: c.done.length, key: 'disc', name: '規律問題の処分', lines: [line] });
    G.save();
    return line;
  }

  // ---------- 分析の重点 ----------
  const FOCUS = {
    star: { name: '相手エースを封じる', desc: '最警戒の選手にマークを集中。その選手の力 −7%' },
    setpiece: { name: '相手のセットプレー対策', desc: '相手のセットプレーからの得点率 −25%' },
    side: { name: '相手の弱点サイドを突く', desc: '攻撃力 +1.2' },
    build: { name: '相手のビルドアップ封じ', desc: '相手の中盤 −1.2' }
  };
  function focusKey(fx) { return fx.label + fx.opp; }
  function applyFocus(fx, jp, opp) {
    const S = G.state();
    const f = S.cur.focus && S.cur.focus[focusKey(fx)];
    if (!f) return;
    const k = S.upgrades && S.upgrades.analysis ? 1.5 : 1;
    if (f === 'star') {
      const st = opp.players.find(p => !/控え|GK|CB|LSB|RSB/.test(p.name) && opp.xi.includes(p.id) && (G.nation(fx.opp).stars || []).some(s => s.split('/')[0] === p.name));
      if (st) st.ovr *= 1 - 0.07 * k;
    }
    if (f === 'setpiece') opp.spWeak = 1 - 0.25 * k;
    if (f === 'side') jp.bonus.att = (jp.bonus.att || 0) + 1.2 * k;
    if (f === 'build') opp.bonus = Object.assign({}, opp.bonus, { mid: (opp.bonus.mid || 0) - 1.2 * k });
  }

  // ---------- 二重国籍 ----------
  const DUAL_FIRST = ['ルカ', 'ノア', 'レオ', 'マテオ', 'ユリアン', 'トビアス', 'エリオット', 'ジョシュア', 'セオ', 'ダニエル', 'アレックス', 'ケヴィン', 'ニコ', 'サミュエル'];
  const DUAL_NATION = [['ドイツ', 'ブンデスリーガ'], ['イングランド', 'プレミアリーグ'], ['フランス', 'リーグ・アン'], ['オランダ', 'エールディビジ'], ['ベルギー', 'ベルギー1部'], ['スペイン', 'ラ・リーガ']];
  function genDuals(n) {
    const S = G.state();
    const out = [];
    for (let i = 0; i < n; i++) {
      const [nat, lg] = pickW(DUAL_NATION, () => 1);
      const clubs = Object.values(D.CLUBS).flat().filter(c => W.league(c) === lg);
      const pos = pickW(['CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'], () => 1);
      const name = `${pickW(DUAL_FIRST, () => 1)}・${pickW(D.SURNAMES, () => 1)}`;
      const ovr = ri(63, 70), pot = ri(81, 89);
      const p = G.makeExternal({ name, pos, born: S.date.y - ri(17, 20), club: pickW(clubs, () => 1), ovr, pot, traits: [pickW(['スピード', 'ドリブル', '空中戦', 'パス', '決定力', 'ボール奪取'], () => 1)], hidden: true, know: 0, chem: 0 });
      p.dual = { nation: nat, ja: ri(25, 50), status: 'undecided' };
      out.push(p);
    }
    return out;
  }
  function duals() { return G.state().players.filter(p => p.dual && !p.retired); }
  function persuade(id, mode) {
    const S = G.state();
    const p = G.player(id);
    const cost = mode === 'visit' ? 2 : 1;
    if (!p || !p.dual || p.dual.status !== 'undecided' || S.scoutPts < cost) return null;
    S.scoutPts -= cost;
    const gain = mode === 'visit' ? ri(15, 25) : ri(7, 14);
    p.dual.ja = Math.min(100, p.dual.ja + gain);
    const line = mode === 'visit' ? `${p.name}と家族に現地で面会。日本代表への思いが強まった（+${gain}）` : `${p.name}に電話で代表構想を伝えた（+${gain}）`;
    p.dual.log = (p.dual.log || []).concat([line]).slice(-4);
    if (p.dual.ja >= 100) commitDual(p, 'japan');
    G.save();
    return line;
  }
  function commitDual(p, to) {
    if (p.dual.status !== 'undecided') return;
    if (to === 'japan') { p.dual.status = 'japan'; p.hidden = false; G.addNews('代表', `${p.name}（${p.club}）が日本代表を選択！${p.dual.nation}との争奪戦を制した。`, 'good'); }
    else { p.dual.status = 'other'; p.hidden = true; p.lost = true; G.addNews('代表', `${p.name}は${p.dual.nation}代表を選択。日本は獲得を逃した。`, 'bad'); }
  }
  function dualMonth() {
    duals().filter(p => p.dual.status === 'undecided').forEach(p => {
      const pull = 0.8 + Math.max(0, p.ovr - 68) * 0.15;
      p.dual.ja = clamp(p.dual.ja - pull * rnd() * 1.6, 0, 100);
      if (p.ovr >= 74 && rnd() < 0.06) { p.dual.ja = Math.max(0, p.dual.ja - 10); G.addNews('代表', `${p.dual.nation}が${p.name}をA代表候補に招集。日本は説得を急ぐ必要がある。`, 'bad'); }
      if (p.dual.ja <= 0) commitDual(p, 'other');
      else if (G.age(p) >= 21.5) commitDual(p, p.dual.ja >= 50 ? 'japan' : 'other');
    });
  }

  // ---------- 協会との面談 ----------
  const UPGRADES = {
    staff: { name: 'スカウト部門の増員', desc: '活動ごとの視察ポイント +1' },
    camp: { name: '合宿環境の改善', desc: '合宿の日数 +1日' },
    medical: { name: '医療体制の強化', desc: '代表選手の負傷からの回復が速くなり、合宿での負傷が減る' },
    analysis: { name: '分析部門の強化', desc: '分析の重点の効果が1.5倍' },
    tour: { name: '強豪国とのマッチメイク', desc: '親善試合の相手が強くなる（勝てば評価が大きく上がる）' }
  };
  function makeMeeting(title) {
    const S = G.state();
    S.upgrades = S.upgrades || {};
    const offer = S.board >= 70 && !S.contractExt ? 'extend' : S.board < 30 ? 'warning' : null;
    if (offer === 'warning') { S.ultimatum = true; G.addNews('協会', `協会が${S.coach}監督に事実上の最後通告。次の活動で結果が求められる。`, 'bad'); }
    S.meeting = { title, offer, asked: null, result: null, options: Object.keys(UPGRADES).filter(k => !S.upgrades[k]) };
  }
  function ask(key) {
    const S = G.state();
    const m = S.meeting;
    if (!m || m.asked) return null;
    m.asked = key;
    // 協会の評価と強化予算の両方で決まる
    const funds = S.funds == null ? 50 : S.funds;
    if (funds < 20) { m.result = `協会は「${UPGRADES[key].name}」を見送った。「今は強化予算が足りない」とのこと（予算${Math.round(funds)}）。`; G.save(); return m.result; }
    const p = (S.board >= 65 ? 0.9 : S.board >= 50 ? 0.6 : S.board >= 35 ? 0.3 : 0.1) * (funds >= 60 ? 1.1 : funds >= 35 ? 1 : 0.7);
    if (rnd() < p) { S.upgrades[key] = true; S.funds = funds - 20; m.result = `協会は「${UPGRADES[key].name}」を承認した。`; G.addNews('協会', `協会が${UPGRADES[key].name}を承認。`, 'good'); }
    else { S.board = clamp(S.board - 2, 0, 100); m.result = `協会は「${UPGRADES[key].name}」を見送った。「まずは結果を」とのこと。`; }
    G.save();
    return m.result;
  }
  function answerOffer(accept) {
    const S = G.state();
    const m = S.meeting;
    if (!m || m.offer !== 'extend' || m.offerDone) return;
    m.offerDone = accept ? 'accept' : 'decline';
    if (accept) { S.contractExt = true; S.board = clamp(S.board + 3, 0, 100); G.addNews('協会', `${S.coach}監督が2034年までの契約延長に合意。`, 'good'); }
    G.save();
  }

  root.SBExtra = { REGION_LABEL, regionOf, venueInfo, travelPenalty, leadership, suggestCaptain, setCaptain, leaderBonus, clubRel, clubRequests, resolveClub, disciplineEvent, resolveDiscipline, FOCUS, focusKey, applyFocus, genDuals, duals, persuade, commitDual, dualMonth, UPGRADES, makeMeeting, ask, answerOffer };
})(typeof window !== 'undefined' ? window : globalThis);
