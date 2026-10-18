// メンバー発表・記者会見・メディアの反応
(function (root) {
  'use strict';
  const G = root.SBGame, W = root.SBWorld, E = root.SBEngine;
  const { clamp, pickW } = E;
  const rnd = () => Math.random();

  // 架空の媒体
  const OUTLETS = ['東都スポーツ', '週刊フットボール通信', 'デイリー蹴球', 'サッカー新報WEB'];

  // 人気：代表での実績・能力・クラブの格
  function pop(p) {
    return clamp((p.ovr - 72) * 4 + Math.min(40, p.caps * 1.2) + (p.real ? 12 : 0) + (p.tier <= 2 ? 10 : p.tier === 3 ? 4 : 0) + (p.chem || 0) * 0.15, 0, 100);
  }

  // ---------- メンバー発表 ----------
  function announcement() {
    const S = G.state();
    const prev = S.cur.prevSquad || [];
    const ps = S.squad.map(G.player).filter(Boolean);
    const firsts = ps.filter(p => !p.campCount);
    const returns = ps.filter(p => p.campCount && !prev.includes(p.id) && p.lastCamp && (S.date.y * 12 + S.date.m) - p.lastCamp >= 8);
    // 注目の落選：人気があり、前回いた or 好調
    const omissions = G.active().filter(p => !S.squad.includes(p.id) && G.available(p) && pop(p) >= 45 && (prev.includes(p.id) || p.form >= 1)).sort((a, b) => pop(b) - pop(a)).slice(0, 3);
    const injuredStars = G.active().filter(p => p.injury > 0 && pop(p) >= 50).sort((a, b) => pop(b) - pop(a)).slice(0, 2);
    return { firsts: firsts.map(p => p.id), returns: returns.map(p => p.id), omissions: omissions.map(p => p.id), injured: injuredStars.map(p => p.id) };
  }

  // 発表直後の反応（世論と選手の気持ち）
  function applyAnnouncement(an) {
    const S = G.state();
    an.firsts.forEach(id => { const p = G.player(id); p.mood = clamp((p.mood || 0) + 1.2, -3, 3); });
    an.returns.forEach(id => { const p = G.player(id); p.mood = clamp((p.mood || 0) + 1, -3, 3); });
    let df = 0;
    an.omissions.forEach(id => {
      const p = G.player(id);
      p.mood = clamp((p.mood || 0) - 1.2, -3, 3);
      df -= pop(p) >= 70 ? 3 : 1.5;
      if (rnd() < 0.6) G.addNews('メディア', `落選の${p.name}「${pickW(['悔しい。クラブで結果を出して見返すだけ', '監督の判断を尊重する。また呼ばれるように頑張る', '正直、驚いている。でも下を向いている暇はない'], () => 1)}」`);
    });
    an.firsts.forEach(id => { const p = G.player(id); if (p.form >= 1 || (p.season && p.season.g >= 5)) df += 1; });
    S.fans = clamp(S.fans + df, 0, 100);
    if (an.firsts.length) G.addNews('発表', `日本代表メンバー発表。初招集は${an.firsts.map(id => G.player(id).name).join('・')}。`, 'good');
    else G.addNews('発表', '日本代表メンバー発表。初招集はなし、継続性を重視した選考に。');
  }

  // ---------- 記者会見 ----------
  // 効果：morale(士気) fans(世論) board(協会) chem fam mood[[id,±]] young/vet(世代別のやる気) promise rush rotate
  function questions() {
    const S = G.state();
    const ev = G.event();
    const an = S.cur.announce || { firsts: [], omissions: [], injured: [], returns: [] };
    const sq = S.squad.map(G.player).filter(Boolean);
    const qs = [];
    const reporter = () => pickW(OUTLETS, () => 1);
    const add = q => { q.from = reporter(); qs.push(q); };

    add({
      q: '今回の選考で重視したポイントは？',
      a: [
        { t: '競争です。名前ではなく、いま良い選手を呼んだ。', tone: '強気', eff: { morale: 2, fans: 1 }, head: '「名前では選ばない」競争を強調' },
        { t: '継続性です。積み上げてきたものを熟成させたい。', tone: '慎重', eff: { chem: 3, fam: 2 }, head: '継続路線を明言「熟成させたい」' },
        { t: '目の前の試合に勝つための、ベストの26人です。', tone: '誠実', eff: { board: 1, morale: 1 }, head: '「勝つためのベストの26人」' }
      ]
    });

    if (an.firsts.length) {
      const p = G.player(an.firsts.sort((a, b) => G.player(b).ovr - G.player(a).ovr)[0]);
      add({
        q: `初招集の${p.name}選手（${p.club}）を選んだ理由を教えてください。`,
        a: [
          { t: 'クラブでの活躍を見れば当然です。即戦力として期待しています。', tone: '強気', eff: { mood: [[p.id, 1.5]], fans: 1 }, head: `初招集・${p.name}に「即戦力」と太鼓判` },
          { t: 'まずは代表の空気を感じてほしい。焦らず育てます。', tone: '慎重', eff: { mood: [[p.id, 0.4]], board: 1 }, head: `${p.name}は「焦らず育てる」` },
          { t: 'サプライズではありません。誰にでも扉は開いています。', tone: '誠実', eff: { morale: 2, fans: 1 }, head: '「誰にでも扉は開いている」' }
        ]
      });
    }

    if (an.omissions.length) {
      const p = G.player(an.omissions[0]);
      const why = p.status === 'bench' ? 'クラブで出場機会がない' : 'コンディション';
      add({
        q: `${p.name}選手の落選について、ファンからは疑問の声も上がっています。`,
        a: [
          { t: '扉は閉じていません。今回は総合的に判断しました。', tone: '慎重', eff: { mood: [[p.id, 0.6]], fans: -1 }, head: `${p.name}落選に「扉は閉じていない」` },
          { t: `今の彼は${why}。まずはそこから取り戻してほしい。`, tone: '誠実', eff: { mood: [[p.id, -1]], fans: 1, board: 1 }, head: `${p.name}落選の理由を明言「${why}」` },
          { t: 'チームのバランスを考えた結果です。それ以上は言えません。', tone: 'はぐらかす', eff: { fans: -3, morale: 1 }, head: `${p.name}落選、説明は「バランス」のみ` }
        ]
      });
    }

    if (an.injured.length) {
      const p = G.player(an.injured[0]);
      const tour = ev.kind === 'tour';
      add({
        q: `負傷中の${p.name}選手（${p.inj ? p.inj.t : '負傷'}）の状態は？`,
        a: [
          { t: '回復が最優先です。無理はさせません。', tone: '慎重', eff: { mood: [[p.id, 1]], board: 1 }, head: `${p.name}は「回復最優先」` },
          { t: `${tour ? '大会' : '次の活動'}には間に合うと信じています。`, tone: '強気', eff: { fans: 2, rush: p.id }, head: `${p.name}の早期復帰に期待「間に合うと信じている」` },
          { t: 'いない選手の話はしません。ここにいる26人で戦います。', tone: '強気', eff: { morale: 2, mood: [[p.id, -0.8]] }, head: '「ここにいる26人で戦う」' }
        ]
      });
    }

    const last = S.matches.slice(0, 3);
    const losses = last.filter(m => m.out === 'L').length;
    if (losses >= 2 || (last[0] && last[0].out === 'L' && last[0].ga - last[0].gf >= 2)) {
      add({
        q: '前回の結果を受けて、采配への批判が強まっています。',
        a: [
          { t: '責任はすべて私にあります。選手は全力を尽くしてくれた。', tone: '誠実', eff: { morale: 4, fans: 2, board: -1 }, head: '「責任はすべて私に」選手をかばう' },
          { t: '内容は悪くなかった。結果は必ずついてきます。', tone: '強気', eff: { fans: -2, morale: 1 }, head: '「内容は悪くなかった」強気の姿勢崩さず' },
          { t: '正直、選手のパフォーマンスには満足していません。', tone: '強気', eff: { morale: -5, board: 1, sharpen: true }, head: '選手に苦言「満足していない」' }
        ]
      });
    }

    if (ev.kind === 'tour') {
      add({
        q: `${ev.title}の目標を聞かせてください。`,
        a: [
          { t: '優勝しか考えていません。', tone: '強気', eff: { morale: 4, fans: 4, promise: 'champion' }, head: '「優勝しか考えていない」' },
          { t: 'ベスト4以上。そこから先は勢いです。', tone: '誠実', eff: { morale: 1, fans: 1, promise: 'semi' }, head: '目標は「ベスト4以上」' },
          { t: 'まずはグループ突破。一戦一戦です。', tone: '慎重', eff: { fans: -2, promise: 'ko' }, head: '「一戦一戦」慎重な目標設定' }
        ]
      });
    } else {
      const opps = (S.cur.friendlies || []).concat(nextQualOpp(S));
      const strong = opps.map(c => G.nation(c)).sort((a, b) => b.rating - a.rating)[0];
      if (strong) {
        add({
          q: `${strong.name}戦にはどんな狙いで臨みますか？`,
          a: [
            { t: '勝ちにいきます。それ以外はありません。', tone: '強気', eff: { morale: 3, fans: 3, promise: 'win:' + strong.code }, head: `${strong.name}戦へ「勝ちにいく」` },
            { t: '現在地を測る絶好の機会。課題を洗い出したい。', tone: '慎重', eff: { fans: -1, promise: 'test:' + strong.code }, head: `${strong.name}戦は「現在地を測る機会」` },
            { t: '相手をリスペクトしつつ、自分たちのサッカーを貫きます。', tone: '誠実', eff: { morale: 1, fam: 2 }, head: '「自分たちのサッカーを貫く」' }
          ]
        });
      }
    }

    const young = sq.filter(p => G.age(p) < 23);
    const vets = sq.filter(p => G.age(p) >= 30);
    if (young.length >= 4 || (young.length >= 2 && vets.length >= 4)) {
      add({
        q: `若手が${young.length}人選ばれました。世代交代を意識していますか？`,
        a: [
          { t: '実力があれば年齢は関係ありません。', tone: '誠実', eff: { young: 0.8 }, head: '「実力があれば年齢は関係ない」' },
          { t: '経験のある選手の存在は欠かせません。', tone: '慎重', eff: { vet: 1, young: -0.3 }, head: 'ベテランの経験を重視' },
          { t: '世代交代は避けて通れません。若手には期待しています。', tone: '強気', eff: { young: 1.5, vet: -1.2, morale: -1 }, head: '世代交代を明言' }
        ]
      });
    }

    const slump = sq.filter(p => p.form <= -1 && pop(p) >= 50).sort((a, b) => pop(b) - pop(a))[0];
    if (slump) {
      add({
        q: `クラブで不調の${slump.name}選手を呼んだ理由は？`,
        a: [
          { t: '彼の力は誰もが知っている。信頼しています。', tone: '強気', eff: { mood: [[slump.id, 2]], fans: -1 }, head: `不調の${slump.name}に全幅の信頼` },
          { t: '代表で状態を取り戻してほしい。競争の中で。', tone: '慎重', eff: { mood: [[slump.id, 0.5]] }, head: `${slump.name}に「競争の中で取り戻して」` },
          { t: '結果を出さなければ、次の席はありません。', tone: '強気', eff: { mood: [[slump.id, -1]], morale: -1, fans: 1 }, head: `${slump.name}に異例の厳命` }
        ]
      });
    }

    const tired = sq.filter(p => (p.load || 0) > 450).length;
    if (tired >= 4) {
      add({
        q: '欧州組は過密日程です。コンディション面の配慮は？',
        a: [
          { t: 'コンディション最優先。ローテーションも考えます。', tone: '慎重', eff: { rotate: true, board: 1 }, head: '欧州組に配慮「ローテーションも」' },
          { t: '代表に来た以上、ベストメンバーで戦います。', tone: '強気', eff: { morale: 1, fans: 1, risk: true }, head: '「ベストメンバーで戦う」' },
          { t: 'クラブとは密に連絡を取っています。問題ありません。', tone: 'はぐらかす', eff: {}, head: 'クラブとの連携を強調' }
        ]
      });
    }

    const jCount = sq.filter(p => W.isJ(p.club)).length;
    if (jCount <= 2) {
      add({
        q: `国内組は${jCount}人。Jリーグの選手にチャンスはありますか？`,
        a: [
          { t: 'Jリーグも毎週視察しています。もちろんチャンスはあります。', tone: '誠実', eff: { fans: 2, jmood: 1 }, head: '「Jリーグにもチャンスはある」' },
          { t: '現時点では欧州組が上回っている。それが事実です。', tone: '強気', eff: { fans: -2, jmood: -1 }, head: '「現時点では欧州組が上」' },
          { t: '所属リーグで選んではいません。', tone: 'はぐらかす', eff: { fans: 0 }, head: '「リーグでは選んでいない」' }
        ]
      });
    }

    // 4問まで（冒頭の質問は固定）
    const head = qs[0], rest = qs.slice(1);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const pri = q => /落選|初招集|批判|目標/.test(q.q) ? 1 : 0;
    rest.sort((a, b) => pri(b) - pri(a));
    return [head].concat(rest.slice(0, 3));
  }

  function nextQualOpp(S) {
    const ev = G.event();
    if (ev.kind !== 'qual' && ev.kind !== 'q4') return [];
    const comp = S.comps[ev.comp];
    if (!comp || !S.cur.mds) return [];
    return S.cur.mds.map(md => comp.rounds[md] && comp.rounds[md].find(m => m.h === 'JPN' || m.a === 'JPN')).filter(Boolean).map(m => m.h === 'JPN' ? m.a : m.h);
  }

  function applyEffects(e) {
    const S = G.state();
    if (e.morale) S.morale = clamp(S.morale + e.morale, 0, 100);
    if (e.fans) S.fans = clamp(S.fans + e.fans, 0, 100);
    if (e.board) S.board = clamp(S.board + e.board, 0, 100);
    if (e.fam) S.fam[S.formation] = Math.min(100, S.fam[S.formation] + e.fam);
    const sq = S.squad.map(G.player).filter(Boolean);
    if (e.chem) sq.forEach(p => { p.chem = Math.min(100, p.chem + e.chem); });
    (e.mood || []).forEach(([id, d]) => { const p = G.player(id); if (p) p.mood = clamp((p.mood || 0) + d, -3, 3); });
    if (e.young) sq.filter(p => G.age(p) < 23).forEach(p => { p.mood = clamp((p.mood || 0) + e.young, -3, 3); });
    if (e.vet) sq.filter(p => G.age(p) >= 30).forEach(p => { p.mood = clamp((p.mood || 0) + e.vet, -3, 3); });
    if (e.jmood) G.active().filter(p => W.isJ(p.club)).forEach(p => { p.mood = clamp((p.mood || 0) + e.jmood * 0.5, -3, 3); });
    if (e.sharpen) sq.forEach(p => { p.form = clamp(p.form + 0.3, -3, 3); });
    if (e.promise) S.cur.promise = e.promise;
    if (e.rush) { const p = G.player(e.rush); if (p && p.injury > 1) { p.injury = Math.max(0.5, p.injury - 1); p.rushed = true; } }
    if (e.rotate) S.cur.rotatePromise = true;
    if (e.risk) S.cur.injuryRisk = true;
  }

  // 会見後の報道
  function pressReaction(press) {
    const S = G.state();
    const picks = press.answers.map((ai, qi) => ({ q: press.qs[qi], a: press.qs[qi].a[ai] }));
    const dramatic = picks.slice().sort((x, y) => (y.a.tone === '強気' ? 2 : y.a.tone === 'はぐらかす' ? 1 : 0) - (x.a.tone === '強気' ? 2 : x.a.tone === 'はぐらかす' ? 1 : 0));
    const coach = S.coach;
    const heads = dramatic.slice(0, 3).map((x, i) => ({ outlet: OUTLETS[i], text: `${coach}監督、${x.a.head}` }));
    const tones = picks.map(x => x.a.tone);
    const evasive = tones.filter(t => t === 'はぐらかす').length;
    const bold = tones.filter(t => t === '強気').length;
    const fans = [];
    if (bold >= 2) fans.push(pickW(['強気な監督は嫌いじゃない。結果で示してくれ', 'ビッグマウスで終わらないことを祈る', '言ったからには勝ってくれよ'], () => 1));
    if (evasive >= 1) fans.push(pickW(['説明になってない…', '肝心なところははぐらかすんだな', 'もう少しちゃんと話してほしい'], () => 1));
    if (tones.filter(t => t === '誠実').length >= 2) fans.push(pickW(['言葉に誠実さを感じた', '選手をちゃんと見てる監督だと思う', '納得の説明だった'], () => 1));
    const an = S.cur.announce || { omissions: [], firsts: [] };
    if (an.omissions.length) fans.push(`${G.player(an.omissions[0]).name}を外すのは理解できない`);
    if (an.firsts.length) fans.push(`${G.player(an.firsts[0]).name}の初招集は楽しみ！`);
    if (!fans.length) fans.push('淡々とした会見だった');
    return { heads, fans: fans.slice(0, 4) };
  }

  // ---------- 試合後の報道 ----------
  function matchReaction(rec, extra) {
    const S = G.state();
    const opp = G.nname(rec.opp);
    const strong = G.nation(rec.opp).rating > (S.jpnRating || 79) + 3;
    const big = Math.abs(rec.gf - rec.ga) >= 3;
    let head, fansD = 0, moraleD = 0;
    const hat = rec.scorers.find(x => /×[3-9]/.test(x));
    const star = hat ? `${hat.replace(/×\d/, '')}がハットトリック` : `${rec.motm || (rec.scorers[0] || '').replace(/×\d/, '')}が輝く`;
    if (rec.out === 'W') {
      head = strong ? `歴史的勝利！日本、${opp}を撃破　${star}` : big ? `日本、${opp}に${rec.gf}発大勝　${star}` : `日本、${opp}に${rec.gf}-${rec.ga}で勝利`;
      fansD = strong ? 6 : big ? 3 : 2; moraleD = strong ? 8 : 4;
    } else if (rec.out === 'D') {
      head = strong ? `日本、${opp}と互角の戦い　手応えのドロー` : `日本、${opp}とドロー　決定力不足が課題`;
      fansD = strong ? 2 : -2; moraleD = strong ? 2 : -1;
    } else {
      head = strong ? `日本、${opp}に${rec.gf}-${rec.ga}で敗戦　世界との差を痛感` : big ? `屈辱の大敗…日本、${opp}に${rec.ga}失点　采配に疑問の声` : `日本、${opp}に痛恨の敗戦`;
      fansD = strong ? -2 : big ? -8 : -5; moraleD = strong ? -3 : -7;
    }
    const pr = S.cur.promise || '';
    if (pr === 'win:' + rec.opp) {
      if (rec.out === 'W') { fansD += 4; head += '　有言実行'; } else { fansD -= 4; head += '　「勝ちにいく」宣言も空回り'; }
    }
    if (pr === 'test:' + rec.opp && rec.out === 'L') fansD += 2;
    if (extra && extra.subsLate) head += '';
    const comments = [];
    if (rec.out === 'W') comments.push(pickW(['最高！', 'これは強い', `${rec.motm}がMVP`, 'このメンバーでW杯行こう'], () => 1));
    if (rec.out === 'L') comments.push(pickW(['交代が遅い', 'このままで大丈夫か？', '内容も結果も物足りない', `${S.coach}監督の采配に疑問`], () => 1));
    if (rec.out === 'D') comments.push(pickW(['悪くはないけど勝ちきれない', 'もう一点取りたかった', '収穫と課題が見えた試合'], () => 1));
    if (rec.poss >= 60 && rec.out !== 'W') comments.push('ボールは持てても崩しきれない');
    if (rec.xg[0] > rec.xg[1] + 1 && rec.out !== 'W') comments.push('内容では勝っていた。運がなかった');
    return { head, fansD, moraleD, comments: comments.slice(0, 3), outlet: pickW(OUTLETS, () => 1) };
  }

  // 公約の評価（大会終了時）
  function promiseResult(finish) {
    const S = G.state();
    const pr = S.cur.promise;
    if (!pr || !finish) return 0;
    const rank = { '優勝': 6, '準優勝': 5, 'ベスト4': 4, 'ベスト8': 3, 'ベスト16': 2, 'ベスト32': 1, 'グループリーグ敗退': 0 }[finish];
    const need = { champion: 6, semi: 4, ko: 1 }[pr];
    if (need == null) return 0;
    return rank >= need ? 5 : -(need - rank) * 2;
  }

  root.SBMedia = { OUTLETS, pop, announcement, applyAnnouncement, questions, applyEffects, pressReaction, matchReaction, promiseResult };
})(typeof window !== 'undefined' ? window : globalThis);
