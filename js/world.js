// クラブの世界：所属クラブの事情、シーズン成績、負傷の種類、移籍の噂
(function (root) {
  'use strict';
  const D = root.SBData, E = root.SBEngine;
  const { normal, pickW, clamp } = E;
  const rnd = () => Math.random();
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  let A = null; // game.js から受け取る内部API

  const LEAGUE_OF = {};
  const L = (league, clubs) => clubs.forEach(c => { LEAGUE_OF[c] = league; });
  L('プレミアリーグ', ['マンチェスター・シティ', 'リヴァプール', 'アーセナル', 'チェルシー', 'トッテナム', 'マンチェスター・U', 'ニューカッスル', 'アストン・ヴィラ', 'ブライトン', 'クリスタル・パレス', 'リーズ']);
  L('ラ・リーガ', ['レアル・マドリード', 'バルセロナ', 'アトレティコ・マドリード', 'レアル・ソシエダ', 'ビジャレアル', 'マジョルカ']);
  L('ブンデスリーガ', ['バイエルン', 'ドルトムント', 'レヴァークーゼン', 'フランクフルト', 'RBライプツィヒ', 'フライブルク', 'シュツットガルト', 'ボルシアMG', 'ヴォルフスブルク', 'ホッフェンハイム', 'マインツ', 'ヴェルダー・ブレーメン', 'ザンクトパウリ']);
  L('セリエA', ['インテル', 'ナポリ', 'ミラン', 'ユヴェントス', 'アタランタ', 'ローマ', 'パルマ']);
  L('リーグ・アン', ['パリSG', 'モナコ', 'リール', 'マルセイユ', 'スタッド・ランス', 'ル・アーヴル']);
  L('エールディビジ', ['フェイエノールト', 'PSV', 'アヤックス', 'AZ', 'NEC', 'スパルタ']);
  L('プリメイラ・リーガ', ['スポルティング', 'ベンフィカ', 'ポルト']);
  L('ベルギー1部', ['ヘンク', 'ヘント', 'アントワープ', 'スタンダール・リエージュ', 'シント＝トロイデン']);
  L('スコティッシュ・プレミアシップ', ['セルティック']);
  L('オーストリア・ブンデスリーガ', ['ザルツブルク']);
  L('デンマーク・スーペルリーガ', ['コペンハーゲン']);
  L('トルコ・スュペル・リグ', ['ギョズテペ']);
  L('EFLチャンピオンシップ', ['QPR', 'バーミンガム', 'ハル・シティ', 'ブラックバーン', 'サウサンプトン']);
  D.CLUBS[5].forEach(c => { LEAGUE_OF[c] = 'J1リーグ'; });
  D.YOUTH_CLUBS.forEach(c => { LEAGUE_OF[c] = c.endsWith('大') ? '大学リーグ' : '高校/ユース'; });
  const isJ = c => LEAGUE_OF[c] === 'J1リーグ';
  const isYouth = c => D.YOUTH_CLUBS.includes(c);
  const league = c => LEAGUE_OF[c] || '海外リーグ';

  // 負傷の種類 [名称, 部位, 最短週, 最長週, 発生率, 重症]
  const INJ = [
    ['太ももの打撲', '太もも', 1, 1, 12], ['足首の捻挫', '足首', 1, 4, 14], ['ハムストリングの肉離れ', 'ハムストリング', 3, 7, 16],
    ['ふくらはぎの張り', 'ふくらはぎ', 1, 3, 10], ['内転筋の負傷', '鼠径部', 2, 5, 8], ['膝の内側側副靭帯損傷', '膝', 4, 9, 6],
    ['中足骨の骨折', '足', 8, 13, 3], ['脳震盪', '頭部', 1, 2, 3], ['腰痛', '腰', 1, 5, 5], ['肩の脱臼', '肩', 3, 7, 2],
    ['半月板損傷', '膝', 6, 14, 2], ['前十字靭帯断裂', '膝', 30, 40, 1.1, true], ['アキレス腱断裂', 'アキレス腱', 28, 38, 0.5, true],
    ['体調不良', 'その他', 1, 1, 6]
  ].map(([t, part, a, b, w, major]) => ({ t, part, a, b, w, major: !!major }));
  const WEEKS_PER_MONTH = 4.33;

  function init(api) { A = api; }

  // 月ごとのニュース：噂とクラブ話題は注目度の高いものだけ
  let queue = [];
  function say(tag, text, kind, pri) { queue.push({ tag, text, kind, pri: pri || 0 }); }
  function flush() {
    const cap = { 噂: 3, クラブ: 4 };
    const used = {};
    queue.sort((a, b) => b.pri - a.pri).forEach(n => {
      used[n.tag] = (used[n.tag] || 0) + 1;
      if (cap[n.tag] && used[n.tag] > cap[n.tag]) return;
      A.addNews(n.tag, n.text, n.kind);
    });
    queue = [];
  }
  const pri = p => p.ovr + (p.chem || 0) * 0.1;

  function newClubState(S) {
    S.clubs = {};
    Object.keys(D.CLUBS).forEach(t => D.CLUBS[t].forEach(c => {
      S.clubs[c] = { form: normal(0.6), cl: +t <= 2 || (+t === 3 && rnd() < 0.3), coachMonths: ri(2, 30) };
    }));
    D.YOUTH_CLUBS.forEach(c => { S.clubs[c] = { form: 0, cl: false, coachMonths: 12 }; });
  }
  function club(S, name) { if (!S.clubs[name]) S.clubs[name] = { form: 0, cl: false, coachMonths: 12 }; return S.clubs[name]; }
  function clubFormLabel(f) { return f >= 0.8 ? '好調' : f <= -0.8 ? '低迷' : '中位'; }

  function emptySeason(label) { return { label, apps: 0, starts: 0, min: 0, g: 0, a: 0, clG: 0, rsum: 0 }; }
  function seasonLabel(S, p) {
    const { y, m } = S.date;
    if (isJ(p.club) || isYouth(p.club)) return `${y}`;
    const sy = m >= 8 ? y : y - 1;
    return `${String(sy % 100).padStart(2, '0')}-${String((sy + 1) % 100).padStart(2, '0')}`;
  }

  // ---------- 負傷 ----------
  function rollInjury(S, p, inMatch) {
    let pool = INJ;
    if (inMatch) pool = INJ.filter(x => x.t !== '体調不良');
    let type = pickW(pool, x => x.w * (x.major && inMatch ? 1.5 : 1));
    // 直近半年に同じ部位を痛めていれば再発しやすい
    const recent = (p.injHist || []).find(h => mdiff(h.d, A.dateKey()) <= 6 && rnd() < 0.35);
    if (recent) type = INJ.find(x => x.t === recent.t) || type;
    let w = ri(type.a, type.b) * (A.age(p) > 30 ? 1.15 : 1);
    if (p.traits.includes('ガラスの体')) w *= 1.15;
    w = Math.round(w);
    p.injury = w; p.inj = { t: type.t, part: type.part, w, major: type.major, again: !!recent };
    p.injHist = (p.injHist || []).concat([{ t: type.t, d: A.dateKey(), w }]).slice(-8);
    return p.inj;
  }

  function injText(p) {
    if (!p.inj) return '負傷';
    const w = Math.max(1, Math.ceil(p.injury));
    return `${p.inj.t}${p.inj.again ? '（再発）' : ''}・${w >= 9 ? `残り約${Math.round(w / WEEKS_PER_MONTH)}か月` : `残り約${w}週`}`;
  }

  function returnDateText(S, p) {
    const months = Math.ceil(p.injury / WEEKS_PER_MONTH);
    let y = S.date.y, m = S.date.m + months;
    while (m > 12) { m -= 12; y++; }
    return `${y}年${m}月ごろ`;
  }

  // 復帰明けの状態（週）
  function mdiff(a, b) { return (Math.floor(b / 100) - Math.floor(a / 100)) * 12 + (b % 100) - (a % 100); }
  function weeksSinceReturn(S, p) {
    if (!p.returned) return 99;
    return mdiff(p.returned, A.dateKey()) * WEEKS_PER_MONTH;
  }

  // ---------- クラブでの1か月 ----------
  function matchesThisMonth(S, p, m) {
    const c = club(S, p.club);
    if (isYouth(p.club)) return (m >= 4 && m <= 11) ? 3 : 0;
    if (isJ(p.club)) return (m >= 2 && m <= 12) ? ([2, 6, 12].includes(m) ? 3 : 4) : 0;
    if (m === 6 || m === 7) return 0;
    let n = m === 12 ? 5 : m === 8 ? 3 : 4;
    if (c.cl && [9, 10, 11, 12, 2, 3, 4].includes(m)) n += m >= 2 && m <= 4 ? (rnd() < 0.5 ? 2 : 0) : 2;
    return n;
  }

  const G90 = { GK: 0, CB: 0.04, LB: 0.04, RB: 0.04, DM: 0.04, CM: 0.09, AM: 0.24, LW: 0.26, RW: 0.26, ST: 0.42 };
  const A90 = { GK: 0.005, CB: 0.02, LB: 0.1, RB: 0.1, DM: 0.06, CM: 0.12, AM: 0.22, LW: 0.2, RW: 0.2, ST: 0.12 };

  function clubMonth(S, p, m) {
    // シーズン開始で成績をリセット
    const start = isJ(p.club) ? 2 : isYouth(p.club) ? 4 : 8;
    if (m === start && p.season && p.season.apps + p.season.min > 0) { p.lastSeason = p.season; p.season = emptySeason(seasonLabel(S, p)); }
    if (!p.season) p.season = emptySeason(seasonLabel(S, p));
    const n = matchesThisMonth(S, p, m);
    const c = club(S, p.club);
    let min = 0, starts = 0, apps = 0, g = 0, a = 0, rs = 0, rn = 0, clG = 0;
    const req = D.CLUB_TIER_REQ[p.tier] || 62;
    const qual = clamp(1 + (p.ovr - req) * 0.025 + p.form * 0.05, 0.4, 1.45) * (isJ(p.club) || isYouth(p.club) ? 0.8 : 1);
    for (let i = 0; i < n; i++) {
      if (p.injury > i * 1.1) continue;
      const pStart = { reg: 0.88, rot: 0.5, bench: 0.08, youth: 0.75 }[p.status];
      let mins = 0;
      if (rnd() < pStart) { mins = rnd() < 0.7 ? 90 : ri(60, 85); starts++; }
      else if (rnd() < { reg: 0.8, rot: 0.55, bench: 0.3, youth: 0.4 }[p.status]) mins = ri(8, 32);
      if (!mins) continue;
      apps++; min += mins;
      const ex = mins / 90;
      const mg = E.poisson(G90[p.pos] * qual * ex * (p.traits.includes('決定力') ? 1.25 : 1));
      const ma = E.poisson(A90[p.pos] * qual * ex);
      g += mg; a += ma;
      if (c.cl && i >= n - 2 && mg && n > 4) clG += mg;
      let r = 6.4 + mg * 0.9 + ma * 0.5 + (p.ovr - req) * 0.04 + normal(0.45) + c.form * 0.1;
      if (mins < 30) r = 6.2 + (r - 6.4) * 0.5;
      rs += r; rn++;
    }
    const s = p.season;
    s.apps += apps; s.starts += starts; s.min += min; s.g += g; s.a += a; s.clG += clG; s.rsum += rs;
    p.month = { n, apps, starts, min, g, a, r: rn ? rs / rn : null, clG };
    // 試合勘：出場時間の割合
    if (n > 0) p.sharp = clamp((p.sharp == null ? 70 : p.sharp) * 0.5 + (min / (n * 90)) * 100 * 0.6, 5, 100);
    else p.sharp = clamp((p.sharp == null ? 70 : p.sharp) - 6, 30, 100);
    // 調子：クラブでの評価点から
    if (rn) p.form = clamp(p.form * 0.55 + (rs / rn - 6.55) * 1.4 + normal(0.3), -3, 3);
    else if (n > 0) p.form = clamp(p.form * 0.7 - 0.35, -3, 3);
    else p.form = clamp(p.form * 0.8, -3, 3);
    // 活躍すれば監督の信頼を得る
    if (rn) p.standing = clamp(p.standing + (rs / rn - 6.6) * 0.35, -6, 6);
    p.load = min + (c.cl ? 60 : 0);
  }

  // ---------- 毎月の処理 ----------
  function month(S) {
    const m = S.date.m;
    const ps = A.active();
    // クラブの調子と監督交代
    Object.keys(S.clubs).forEach(name => {
      const c = S.clubs[name];
      c.form = clamp(c.form + normal(0.45) - c.form * 0.25, -2, 2);
      c.coachMonths++;
      if (m === 8 && D.CLUBS[1].concat(D.CLUBS[2]).includes(name)) c.cl = true;
      if (m === 8 && D.CLUBS[3].includes(name)) c.cl = rnd() < 0.3;
      if (m === 8 && D.CLUBS[4].includes(name)) c.cl = rnd() < 0.08;
      const fireP = 0.012 + (c.form <= -1 ? 0.07 : 0) + (m === 6 ? 0.06 : 0);
      if (c.coachMonths > 4 && rnd() < fireP) {
        c.coachMonths = 0;
        const js = ps.filter(p => p.club === name);
        js.forEach(p => { p.standing = clamp(p.standing * 0.3 + normal(2), -6, 6); p.coachChange = A.dateKey(); });
        const rel = js.filter(p => relevant(S, p));
        if (rel.length) say('クラブ', `${name}が監督交代${c.form <= -1 ? '（成績不振）' : ''}。${rel.map(p => p.name).join('・')}の序列に影響か。`, '', Math.max(...rel.map(pri)) + 5);
      }
    });
    ps.forEach(p => {
      clubMonth(S, p, m);
      // 負傷の回復
      if (p.injury > 0) {
        const before = p.injury;
        p.injury = Math.max(0, p.injury - WEEKS_PER_MONTH * (S.upgrades && S.upgrades.medical && p.caps > 0 ? 1.2 : 1));
        if (p.injury <= 0 && before > 0) {
          p.returned = A.dateKey();
          if (p.inj && p.inj.major) { p.ovr -= 1 + rnd() * 2; p.sharp = 25; if (relevant(S, p)) A.addNews('復帰', `${p.name}が${p.inj.t}から復帰。完全復活までは時間がかかりそうだ。`); }
          else if (relevant(S, p) && before > 3) A.addNews('復帰', `${p.name}（${p.club}）が${p.inj ? p.inj.t : '負傷'}から復帰。`);
        }
      }
      // 新たな負傷
      if (p.injury <= 0 && !isYouth(p.club)) {
        const wsr = weeksSinceReturn(S, p);
        const rate = 0.028 * (p.traits.includes('ガラスの体') ? 2.3 : 1) * (A.age(p) > 31 ? 1.3 : 1) * (p.load > 420 ? 1.25 : 1) * (wsr < 9 ? 1.8 : 1) * ((p.month && p.month.n) ? 1 : 0.4);
        if (rnd() < rate) {
          const inj = rollInjury(S, p, false);
          if (relevant(S, p) && inj.w >= 2) A.addNews('負傷', `${p.name}（${p.club}）が${inj.t}${inj.again ? 'を再発' : ''}。${inj.w >= 9 ? `全治約${Math.round(inj.w / WEEKS_PER_MONTH)}か月の長期離脱` : `全治約${inj.w}週間`}。`, 'bad');
        }
      }
      // ポジション争い
      if (!isYouth(p.club) && relevant(S, p)) {
        if ((m === 8 || m === 1 || m === 9) && rnd() < 0.1) {
          p.standing = clamp(p.standing - (1.5 + rnd() * 2), -6, 6);
          say('クラブ', `${p.club}が${E.POS_LABEL[p.pos]}の新戦力を獲得。${p.name}はポジション争いが激化。`, '', pri(p));
        } else if (rnd() < 0.015 && p.status !== 'reg') {
          p.standing = clamp(p.standing + 2, -6, 6);
          say('クラブ', `${p.club}で${p.name}のポジション争いのライバルが離脱。出場機会が増えそうだ。`, 'good', pri(p));
        }
      }
      p.status = A.clubStatus(p);
      p.benchMonths = p.status === 'bench' ? (p.benchMonths || 0) + 1 : 0;
    });
    performanceNews(S, ps);
    flush();
    if (m === 5 || m === 6 || m === 11 || m === 12) rumors(S, ps, m);
    if (m === 8 || m === 1) transfers(S, ps, m === 8);
    if (m === 6) seasonReview(S, ps);
    flush();
  }

  function relevant(S, p) { return p.ovr >= 72 || p.chem >= 40 || p.caps > 0 || S.squad.includes(p.id) || (A.age(p) < 22 && p.pot >= 82 && p.know >= 2); }

  function performanceNews(S, ps) {
    const hot = ps.filter(p => p.month && relevant(S, p)).map(p => ({ p, s: p.month.g * 2 + p.month.a + (p.month.r || 0) - 6.8 })).filter(x => x.p.month.apps && x.s > 2.2).sort((a, b) => b.s - a.s).slice(0, 2);
    hot.forEach(({ p }) => {
      const mo = p.month, s = p.season;
      if (mo.clG) say('クラブ', `${p.name}（${p.club}）がチャンピオンズリーグでゴール！ 今季${s.g}得点目。`, 'good', pri(p) + 8);
      else if (mo.g >= 2) say('クラブ', `${p.name}（${p.club}）が今月${mo.g}ゴール${mo.a ? `${mo.a}アシスト` : ''}。今季${s.apps}試合${s.g}得点。`, 'good', pri(p) + 6);
      else if (mo.a >= 2) say('クラブ', `${p.name}（${p.club}）が今月${mo.a}アシストと好調。`, '', pri(p) + 3);
      else say('クラブ', `${p.name}（${p.club}）が${pickW(['今月のチーム月間MVPに選出', 'リーグ戦で高評価を連発', `${mo.starts}試合連続先発で存在感`], () => 1)}。`, '', pri(p));
    });
    // 出場機会を失った主力
    const cold = ps.filter(p => p.month && p.month.n >= 3 && p.month.min < 60 && p.injury <= 0 && (p.chem >= 40 || p.caps >= 3)).slice(0, 1);
    cold.forEach(p => say('クラブ', `${p.name}が${p.club}で出場機会を失っている（今月出場${p.month.min}分）。`, 'bad', pri(p) + 4));
  }

  function seasonReview(S, ps) {
    const best = ps.filter(p => p.season && p.season.apps >= 10 && !isJ(p.club) && !isYouth(p.club) && ['ST', 'LW', 'RW', 'AM'].includes(p.pos)).sort((a, b) => (b.season.g + b.season.a * 0.6) - (a.season.g + a.season.a * 0.6))[0];
    if (best) A.addNews('総括', `欧州シーズン終了。日本人最多は${best.name}（${best.club}）の${best.season.g}得点${best.season.a}アシスト。`);
  }

  // ---------- 移籍 ----------
  function targetTier(p, a) {
    if (p.tier === 5) return (p.ovr >= 69 && a < 28) ? (p.ovr >= 76 ? 3 : 4) : null;
    if (p.status === 'reg' && p.tier > 1 && p.ovr + p.standing >= D.CLUB_TIER_REQ[p.tier - 1] - 1 && a < 31) return p.tier - 1;
    if (p.status === 'bench' && p.benchMonths >= 4) {
      if (a >= 31 && rnd() < 0.5) return 5;
      let t = p.tier + 1; while (t < 5 && p.ovr < D.CLUB_TIER_REQ[t] - 1) t++; return Math.min(5, t);
    }
    return null;
  }

  function rumors(S, ps, m) {
    const summer = m === 5 || m === 6;
    ps.forEach(p => {
      if (p.rumor || isYouth(p.club) || p.retired) return;
      const a = A.age(p);
      const t = targetTier(p, a);
      if (t == null) return;
      const chance = (summer ? 0.25 : 0.1) * (p.tier === 5 ? 0.9 : 1);
      if (rnd() > chance) return;
      const dest = pickW(D.CLUBS[t].filter(c => c !== p.club), () => 1);
      const reason = t === 5 && p.tier < 5 ? 'home' : t < p.tier ? (p.tier === 5 ? 'abroad' : 'up') : 'down';
      p.rumor = { club: dest, tier: t, reason, m: A.dateKey() };
      if (relevant(S, p)) say('噂', `${league(dest)}の${dest}が${p.name}（${p.club}）に関心。${reason === 'up' ? 'ステップアップ移籍の可能性' : reason === 'abroad' ? '海外移籍が現実味' : reason === 'home' ? 'Jリーグ復帰の可能性' : '出場機会を求めて移籍か'}。`, '', pri(p));
    });
  }

  function transfers(S, ps, summer) {
    ps.forEach(p => {
      if (isYouth(p.club)) return;
      if (p.rumor) {
        const r = p.rumor; p.rumor = null;
        if (rnd() < (summer ? 0.7 : 0.55)) moveClub(S, p, r.tier, r.reason, r.club);
        else if (relevant(S, p)) A.addNews('移籍', `${p.name}の${r.club}移籍は破談。${p.club}に残留する。`);
        return;
      }
      // 噂なしの電撃移籍
      const t = targetTier(p, A.age(p));
      if (t != null && rnd() < (summer ? 0.08 : 0.04)) moveClub(S, p, t, t === 5 && p.tier < 5 ? 'home' : t < p.tier ? (p.tier === 5 ? 'abroad' : 'up') : 'down');
    });
  }

  function moveClub(S, p, tier, reason, dest) {
    const club = dest || pickW(D.CLUBS[tier].filter(c => c !== p.club), () => 1);
    const from = p.club;
    p.club = club; p.tier = tier; p.standing = normal(1.5) + (reason === 'down' ? 1.5 : 0); p.status = A.clubStatus(p); p.benchMonths = 0;
    p.moves = (p.moves || []).concat([{ d: A.dateKey(), from, to: club }]);
    p.season = emptySeason(seasonLabel(S, p));
    if (relevant(S, p) || reason === 'abroad') A.addNews('移籍', `${p.name}が${from}から${club}（${league(club)}）へ移籍${({ up: '。ステップアップ', abroad: '。海外初挑戦', down: '。出場機会を求めて', home: '。Jリーグ復帰' })[reason] || ''}。`, reason === 'up' || reason === 'abroad' ? 'good' : '');
  }

  // 新規ゲーム時：シーズン序盤の成績を作る
  function bootstrap(S) {
    newClubState(S);
    const ps = A.active();
    ps.forEach(p => { p.season = emptySeason(''); p.sharp = 75; });
    const save = S.date.m;
    for (const m of [2, 3, 4, 5, 6, 7, 8, 9]) {
      S.date.m = m;
      ps.forEach(p => { if (m === 8 && !isJ(p.club) && !isYouth(p.club)) p.season = emptySeason(''); clubMonth(S, p, m); });
    }
    S.date.m = save;
    ps.forEach(p => { p.season.label = seasonLabel(S, p); p.status = A.clubStatus(p); });
  }

  root.SBWorld = { init, bootstrap, month, rollInjury, injText, returnDateText, weeksSinceReturn, league, club, clubFormLabel, isJ, isYouth, relevant, WEEKS_PER_MONTH, INJ };
})(typeof window !== 'undefined' ? window : globalThis);
