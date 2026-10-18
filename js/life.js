// 選手との関わりと試合の空気：相談、家族の事情、コンビと競争、プレッシャー、前日会見、天候と審判
(function (root) {
  'use strict';
  const G = root.SBGame, W = root.SBWorld, E = root.SBEngine;
  const { clamp, pickW } = E;
  const rnd = () => Math.random();
  const mood = (p, d) => { p.mood = clamp((p.mood || 0) + d, -3, 3); };
  const known = p => p.caps > 0 || (p.chem || 0) >= 40 || p.ovr >= 72;

  // ---------- 選手からの相談 ----------
  function makeConsults() {
    const S = G.state();
    const out = [];
    const ps = G.visible();
    // 移籍の相談
    const mover = ps.filter(p => p.rumor && known(p) && G.age(p) < 30 && !p.consulted).sort((a, b) => b.ovr - a.ovr)[0];
    if (mover && rnd() < 0.4) {
      const r = mover.rumor;
      const req = root.SBData.CLUB_TIER_REQ[r.tier];
      const risk = mover.ovr + 1 < req ? '移籍先では控えになる可能性が高い' : mover.ovr >= req + 2 ? '移籍先でも主力を張れる力はある' : '移籍先では競争になる';
      out.push({ type: 'move', id: mover.id, text: `${mover.name}（${mover.club}）から相談。「${r.club}（${W.league(r.club)}）から話が来ています。行くべきでしょうか」`, note: `スタッフの見立て：${risk}。`,
        opts: [['go', '挑戦すべきだ。背中を押す'], ['stay', '今のクラブで足場を固めた方がいい'], ['self', '自分で決めることだ']] });
    }
    // 代表引退の相談
    const vet = ps.filter(p => G.age(p) >= 31 && (p.caps >= 3 || (p.chem || 0) >= 50) && !p.ntRetired && !p.consulted && (p.ovr < 79 || G.age(p) >= 33)).sort((a, b) => G.age(b) - G.age(a))[0];
    if (vet && rnd() < 0.25) {
      out.push({ type: 'retire', id: vet.id, text: `${vet.name}（${G.ageInt(vet)}歳）から相談。「そろそろ代表を退いて、若い選手に道を譲るべきか迷っています」`, note: `代表通算${vet.caps}試合（監督就任後）。能力${Math.round(vet.ovr)}。`,
        opts: [['keep', 'まだ力が必要だ。続けてほしい'], ['mentor', '若手の手本として、チームに残ってほしい'], ['respect', '君の決断を尊重する']] });
    }
    // 出場機会への不満
    const sulk = S.squad.map(G.player).filter(p => p && (p.mood || 0) <= -1 && !p.consulted && !p.ntRetired)[0];
    if (sulk && out.length < 2 && rnd() < 0.6) {
      out.push({ type: 'time', id: sulk.id, text: `${sulk.name}から直談判。「代表に来ても出番がない。自分は必要とされているのでしょうか」`, note: '前回の活動では出場機会が少なかった。',
        opts: [['promise', '次の試合で先発させる'], ['explain', 'チームでの役割を丁寧に説明する'], ['tough', '不満なら外れてもらって構わない']] });
    }
    out.forEach(c => { G.player(c.id).consulted = S.date.y * 100 + S.date.m; });
    return out.slice(0, 2);
  }

  function resolveConsult(i, choice) {
    const S = G.state();
    const c = S.cur.consults && S.cur.consults[i];
    if (!c || c.done) return null;
    const p = G.player(c.id);
    c.done = choice;
    let res;
    if (c.type === 'move') {
      if (choice === 'go') { if (p.rumor) p.rumor.force = true; mood(p, 0.6); res = `${p.name}は移籍を決意した様子だ。`; }
      else if (choice === 'stay') { p.rumor = null; p.standing = clamp(p.standing + 0.8, -6, 6); mood(p, -0.4); res = `${p.name}は残留を選んだ。クラブでの序列を上げることに集中する。`; G.addNews('移籍', `${p.name}が${p.club}残留を決断。`); }
      else res = `${p.name}は自分で考えると言った。`;
    }
    if (c.type === 'retire') {
      if (choice === 'keep') { mood(p, 1); p.expectCall = true; res = `${p.name}は代表を続ける。次も呼ばれると思っている。`; }
      else if (choice === 'mentor') { mood(p, 1.5); p.mentor = true; p.expectCall = true; res = `${p.name}は若手のまとめ役として残る。統率力が上がった。`; }
      else { p.ntRetired = true; S.fans = clamp(S.fans + 1, 0, 100); if ((p.chem || 0) >= 60) S.morale = clamp(S.morale - 2, 0, 100); res = `${p.name}が代表引退を表明。`; G.addNews('引退', `${p.name}が日本代表からの引退を表明。「若い世代に託したい」`); }
    }
    if (c.type === 'time') {
      if (choice === 'promise') { p.promiseStart = true; mood(p, 1); res = `${p.name}に次戦の先発を約束した。守らなければ信頼を失う。`; }
      else if (choice === 'explain') { mood(p, 0.6); res = `${p.name}は役割に納得した。`; }
      else { mood(p, -1.5); S.morale = clamp(S.morale + 1, 0, 100); res = `${p.name}は黙り込んだ。チームには緊張感が走った。`; }
    }
    c.result = res;
    G.save();
    return res;
  }

  // 約束と期待の結果
  function afterMatch(r, us) {
    const S = G.state();
    S.squad.forEach(id => {
      const p = G.player(id);
      if (!p || !p.promiseStart) return;
      const x = r.players[us].find(y => y.id === id);
      p.promiseStart = false;
      if (x && x.minutes >= 60) mood(p, 1);
      else { mood(p, -2); S.morale = clamp(S.morale - 2, 0, 100); G.addNews('チーム', `先発を約束された${p.name}が起用されず。監督への不信感が広がる。`, 'bad'); }
    });
  }
  function onAnnounce() {
    const S = G.state();
    G.visible().filter(p => p.expectCall).forEach(p => {
      p.expectCall = false;
      if (!S.squad.includes(p.id)) { mood(p, -1.5); G.addNews('メディア', `続投を求められた${p.name}が落選。「話が違う」と周囲に漏らしたとも。`, 'bad'); S.fans = clamp(S.fans - 1, 0, 100); }
    });
  }

  // ---------- 家族の事情 ----------
  function familyRequest(sq) {
    const p = pickW(sq.filter(x => G.age(x) >= 24 && x.injury <= 0), () => 1);
    if (!p) return null;
    const why = pickW([['出産', '妻の出産に立ち会いたい'], ['家族', '家族が体調を崩したので一時帰国したい'], ['弔事', '親族に不幸があり、葬儀に参列したい']], () => 1);
    return { kind: 'family', id: p.id, text: `${p.name}から申し出。「${why[1]}」`, why: why[0] };
  }
  function resolveFamily(pd, choice) {
    const S = G.state();
    const p = G.player(pd.id);
    const tour = G.event().kind === 'tour';
    if (choice === 'allow') { p.awayGames = tour ? 2 : 1; mood(p, 2); S.morale = clamp(S.morale + 1, 0, 100); S.fans = clamp(S.fans + 1, 0, 100); G.addNews('チーム', `${p.name}が家族の事情で一時離脱。監督が快く送り出した。`); return `${p.name}を送り出した。${tour ? '2試合' : '次の試合'}は不在になる。`; }
    mood(p, -2.5); S.morale = clamp(S.morale - 2, 0, 100);
    let line = `${p.name}にはチームに残ってもらった。本人は複雑な表情だ。`;
    if (rnd() < 0.4) { S.fans = clamp(S.fans - 3, 0, 100); G.addNews('メディア', `${p.name}の一時帰国を監督が認めず。「人としてどうなのか」と批判も。`, 'bad'); line += '報道されて批判を浴びた。'; }
    return line;
  }
  // 大会中の申し出（試合の合間）
  function maybeLeave() {
    const S = G.state();
    if (G.event().kind !== 'tour' || S.cur.leaveReq || rnd() > 0.035) return;
    const sq = S.squad.map(G.player).filter(Boolean);
    const r = familyRequest(sq);
    if (r) S.cur.leaveReq = r;
  }
  function resolveLeave(choice) {
    const S = G.state();
    const r = S.cur.leaveReq;
    if (!r) return null;
    S.cur.leaveReq = null;
    const line = resolveFamily(r, choice);
    G.save();
    return line;
  }

  // ---------- コンビと競争 ----------
  function pairs(xi) {
    const ps = xi.map(G.player).filter(Boolean);
    const out = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.club === b.club && !W.isYouth(a.club)) out.push({ a: a.id, b: b.id, why: `${a.club}のチームメイト`, v: 0.25 });
      else if (a.caps >= 12 && b.caps >= 12 && (a.chem || 0) >= 75 && (b.chem || 0) >= 75 && E.POS_GROUP[a.pos] === E.POS_GROUP[b.pos]) out.push({ a: a.id, b: b.id, why: '代表で長く組んできたコンビ', v: 0.15 });
      else if ((a.moves || []).concat(b.moves || []).some(m => m.from === a.club || m.from === b.club) && ((a.moves || []).some(m => m.from === b.club) || (b.moves || []).some(m => m.from === a.club))) out.push({ a: a.id, b: b.id, why: 'かつてのチームメイト', v: 0.1 });
    }
    return out;
  }
  function pairBonus(xi) { return Math.min(1.5, pairs(xi).reduce((s, x) => s + x.v, 0)); }
  function rivals(ids) {
    const ps = ids.map(G.player).filter(p => p && G.age(p) >= 23 && p.pos !== 'GK');
    const out = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.pos === b.pos && Math.abs(a.ovr - b.ovr) <= 2.5) out.push([a.id, b.id]);
    }
    return out;
  }
  // 先発争いに敗れた側は気持ちが沈む
  function rivalryAfter(r, us) {
    const S = G.state();
    rivals(S.squad).forEach(([a, b]) => {
      const xa = r.players[us].find(x => x.id === a), xb = r.players[us].find(x => x.id === b);
      if (xa && xa.minutes >= 60 && !xb) mood(G.player(b), -0.25);
      if (xb && xb.minutes >= 60 && !xa) mood(G.player(a), -0.25);
    });
  }

  // ---------- プレッシャーと前日会見 ----------
  function pressure(fx) {
    const S = G.state();
    let p = fx.comp === 'friendly' ? 0 : ['q2', 'q3', 'q4'].includes(fx.comp) ? 1 : fx.comp === 'e1' ? 0.5 : 1.5;
    if (fx.knockout) p = /決勝|3位/.test(fx.label) ? 3 : 2.5;
    if (fx.comp === 'wc') p += 0.5;
    const reg = root.SBExtra ? root.SBExtra.regionOf(fx.opp) : '';
    if (fx.venue === 'away' && ['ME', 'EA', 'CA', 'SEA'].includes(reg)) p += 0.8;
    const pp = S.cur.prePress && S.cur.prePress[fx.label + fx.opp];
    if (pp && pp.done === 'calm') p -= 1;
    if (pp && pp.done === 'bold') p += 0.5;
    return Math.max(0, p);
  }
  function pressureLabel(v) { return v >= 3 ? '極大' : v >= 2 ? '大' : v >= 1 ? '中' : v > 0 ? '小' : 'なし'; }
  // 経験の浅い選手は硬くなり、修羅場をくぐったベテランは落ち着く
  function pressureForm(p, v, xi) {
    const S = G.state();
    if (!v) return 0;
    const protect = S.cur.protectYoung ? 0.5 : 1;
    const cap = xi.includes(S.captain) && root.SBExtra && root.SBExtra.leadership(G.player(S.captain)) >= 40 ? 0.7 : 1;
    if (p.caps < 5 || G.age(p) < 22) return -v * 0.3 * protect * cap;
    if (p.caps >= 30) return Math.min(0.4, v * 0.15);
    return -v * 0.08 * cap;
  }
  function needsPrePress(fx) {
    const S = G.state();
    if (!fx) return false;
    const big = fx.knockout || fx.comp === 'wc' || (['q3', 'q4'].includes(fx.comp)) || (fx.comp === 'asiancup') || G.nation(fx.opp).rating >= (S.jpnRating || 79) + 3;
    if (!big) return false;
    const pp = S.cur.prePress && S.cur.prePress[fx.label + fx.opp];
    return !(pp && pp.done);
  }
  function prePressQuestion(fx) {
    const n = G.nname(fx.opp);
    if (fx.knockout) return { q: `負ければ終わりの${n}戦。PK戦も含めて、準備はできていますか？`, a: [['bold', '強気', '勝つのは日本です。90分で決めます'], ['calm', '平常心', 'いつも通りの準備をするだけです'], ['protect', '選手を守る', '責任は私が負う。選手には思い切りやってほしい']] };
    return { q: `明日の${n}戦への意気込みを聞かせてください。`, a: [['bold', '強気', '勝ち点3以外は考えていません'], ['calm', '平常心', '一つの試合として、やるべきことをやるだけです'], ['protect', '選手を守る', '若い選手には伸び伸びやってほしい']] };
  }
  function answerPrePress(fx, key) {
    const S = G.state();
    S.cur.prePress = S.cur.prePress || {};
    const k = fx.label + fx.opp;
    S.cur.prePress[k] = { done: key };
    if (key === 'bold') { S.morale = clamp(S.morale + 3, 0, 100); S.fans = clamp(S.fans + 1, 0, 100); S.cur.promise = 'win:' + fx.opp; }
    if (key === 'protect') S.cur.protectYoung = true;
    const head = { bold: `${S.coach}監督「${fx.knockout ? '90分で決める' : '勝ち点3以外は考えていない'}」強気の勝利宣言`, calm: `${S.coach}監督、${G.nname(fx.opp)}戦へ平常心を強調`, protect: `${S.coach}監督「責任は私が負う」選手を守る姿勢` }[key];
    G.addNews('会見', `前日会見：${head}`);
    G.save();
  }

  // ---------- 天候・ピッチ・審判 ----------
  const REF_NAT = ['オーストラリア', 'カタール', 'ウズベキスタン', '韓国', 'サウジアラビア', 'イングランド', 'イタリア', 'ドイツ', 'フランス', 'スペイン', 'アルゼンチン', 'ブラジル', 'メキシコ', 'アメリカ', 'モロッコ', 'ポーランド', 'オランダ'];
  function matchConditions(fx) {
    const S = G.state();
    const m = S.date.m;
    const loc = root.SBExtra ? root.SBExtra.venueInfo(fx).loc : 'JP';
    let weather = '晴れ';
    const r = rnd();
    if (loc === 'ME') weather = r < 0.05 ? '強風' : '晴れ';
    else if (loc === 'SEA') weather = r < 0.35 ? '雨' : r < 0.45 ? '大雨' : '晴れ';
    else if (loc === 'CA' && [11, 12, 1, 2, 3].includes(m)) weather = r < 0.25 ? '雪' : '晴れ';
    else weather = r < 0.2 ? '雨' : r < 0.25 ? '大雨' : r < 0.32 ? '強風' : '晴れ';
    const pitch = (fx.venue === 'away' && ['SEA', 'CA', 'SA', 'ME'].includes(loc) && rnd() < 0.35) || weather === '大雨' ? '荒れ' : '良好';
    const nat = pickW(REF_NAT.filter(x => x !== G.nname(fx.opp)), () => 1);
    const strict = Math.round((0.75 + rnd() * 0.6) * 100) / 100;
    return { weather, pitch, ref: { nat, strict, label: strict >= 1.15 ? 'カードを出しやすい' : strict <= 0.9 ? '流す傾向' : '標準的' } };
  }

  root.SBLife = { makeConsults, resolveConsult, afterMatch, onAnnounce, familyRequest, resolveFamily, maybeLeave, resolveLeave, pairs, pairBonus, rivals, rivalryAfter, pressure, pressureLabel, pressureForm, needsPrePress, prePressQuestion, answerPrePress, matchConditions };
})(typeof window !== 'undefined' ? window : globalThis);
