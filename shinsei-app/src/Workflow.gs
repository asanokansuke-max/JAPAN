/**
 * 申請・承認ワークフロー
 *
 * 承認経路は「承認経路」シートで申請種別ごとに定義する（無い場合は既定経路 "*"）。
 *   ステップ種類 = 承認 … 承認・却下を行う段階（上長、常務 など）
 *   ステップ種類 = 受理 … 承認ではなく「提出先」。受理の記録だけを行う（総務課・社長）
 *
 * 申請作成時に経路のスナップショット（承認経路JSON）を保存する。
 * 役割で決まるステップ（選択方式=役割全員）の承認者は、承認時点の役割マスターから毎回求めるため、
 * 役員交代などがあってもマスターを変えるだけで反映される。
 */
var Workflow = (function () {

  // ---------------------------------------------------------------- 経路
  function routeRows_(typeId) {
    var all = Db.readAll(SHEET.ROUTES).filter(function (r) { return r['ステップ名'] && r['役割']; });
    var own = all.filter(function (r) { return String(r['申請種別ID']).trim() === typeId; });
    var rows = own.length ? own : all.filter(function (r) { return String(r['申請種別ID']).trim() === '*'; });
    rows.sort(function (a, b) { return Number(a['順序'] || 0) - Number(b['順序'] || 0); });
    return rows.map(function (r) {
      return {
        name: String(r['ステップ名']).trim(),
        type: String(r['ステップ種類'] || STEP_TYPE.APPROVAL).trim() === STEP_TYPE.RECEIPT ? STEP_TYPE.RECEIPT : STEP_TYPE.APPROVAL,
        roles: String(r['役割']).split(/[,、，\s]+/).map(function (x) { return x.trim(); }).filter(String),
        selectMode: String(r['選択方式'] || SELECT_MODE.ROLE).trim() === SELECT_MODE.APPLICANT ? SELECT_MODE.APPLICANT : SELECT_MODE.ROLE
      };
    });
  }

  /** 申請フォームで申請者が選ぶ必要のあるステップ（通常は上長）と候補者 */
  function applicantSelections(typeId) {
    return routeRows_(typeId).map(function (step, idx) {
      if (step.selectMode !== SELECT_MODE.APPLICANT) return null;
      var seen = {};
      var cands = [];
      step.roles.forEach(function (role) {
        Users.candidatesForRole(role).forEach(function (c) { if (!seen[c.email]) { seen[c.email] = true; cands.push(c); } });
      });
      return { stepIndex: idx, stepName: step.name, roles: step.roles, candidates: cands };
    }).filter(Boolean);
  }

  function buildRoute_(typeId, selections) {
    var steps = routeRows_(typeId);
    if (!steps.length) throw new Error('承認経路が設定されていません。「承認経路」シートを確認してください。');
    if (!steps.some(function (s) { return s.type === STEP_TYPE.APPROVAL; })) throw new Error('承認ステップが1つも無い経路です。');
    steps.forEach(function (step, idx) {
      step.approvers = [];
      step.approvedBy = '';
      step.approvedAt = '';
      step.receivedBy = [];
      if (step.selectMode === SELECT_MODE.APPLICANT) {
        var picked = Users.normalize(selections && selections[String(idx)]);
        if (!picked) throw new Error('「' + step.name + '」の承認者を選択してください。');
        var ok = step.roles.some(function (role) { return Users.emailsForRole(role).indexOf(picked) >= 0; });
        if (!ok) throw new Error('選択された承認者は「' + step.name + '」の権限を持っていません。');
        step.approvers = [picked];
      }
    });
    return steps;
  }

  /** ステップの現在の担当者（役割ステップは今の役割マスターから） */
  function stepMembers_(step) {
    if (step.selectMode === SELECT_MODE.APPLICANT) return step.approvers || [];
    return Users.emailsForRoles(step.roles);
  }

  // ---------------------------------------------------------------- 申請データ
  function parse_(row) {
    if (!row) return null;
    var req = {
      id: String(row['申請ID']),
      typeId: String(row['申請種別ID']),
      typeName: String(row['申請種別名']),
      applicantEmail: Users.normalize(row['申請者メール']),
      applicantName: String(row['申請者名']),
      submittedAt: String(row['申請日時']),
      status: String(row['状態']),
      currentStep: Number(row['現在ステップ'] || 0),
      firstApproverEmail: Users.normalize(row['第1承認者メール']),
      firstApproverName: String(row['第1承認者名'] || ''),
      summary: String(row['概要'] || ''),
      values: safeJson_(row['内容JSON'], {}),
      route: safeJson_(row['承認経路JSON'], []),
      finalApprovedAt: String(row['最終承認日時'] || ''),
      receivedAt: String(row['受理日時'] || ''),
      updatedAt: String(row['更新日時'] || ''),
      rejectReason: String(row['却下理由'] || ''),
      _row: row._row
    };
    req.statusLabel = statusLabel(req);
    return req;
  }

  function safeJson_(s, fallback) {
    try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  }

  function toRow_(req) {
    return {
      '申請ID': req.id,
      '申請種別ID': req.typeId,
      '申請種別名': req.typeName,
      '申請者メール': req.applicantEmail,
      '申請者名': req.applicantName,
      '申請日時': req.submittedAt,
      '状態': req.status,
      '現在ステップ': req.currentStep,
      '第1承認者メール': req.firstApproverEmail,
      '第1承認者名': req.firstApproverName,
      '概要': req.summary,
      '内容JSON': JSON.stringify(req.values),
      '承認経路JSON': JSON.stringify(req.route),
      '最終承認日時': req.finalApprovedAt,
      '受理日時': req.receivedAt,
      '更新日時': nowString_(),
      '却下理由': req.rejectReason
    };
  }

  function loadAll_() {
    return Db.readAll(SHEET.REQUESTS).map(parse_);
  }

  function get(id) {
    var row = Db.find(SHEET.REQUESTS, function (r) { return String(r['申請ID']) === String(id); });
    return parse_(row);
  }

  function save_(req) {
    Db.updateRow(SHEET.REQUESTS, req._row, toRow_(req));
  }

  function history_(req, action, actorEmail, stepName, comment) {
    Db.insert(SHEET.HISTORY, {
      '日時': nowString_(),
      '申請ID': req.id,
      '操作': action,
      '操作者メール': actorEmail,
      '操作者名': actorEmail ? Users.displayName(actorEmail) : 'システム',
      'ステップ': stepName || '',
      'コメント': comment || '',
      '環境': isTestMode_() ? ENV.TEST : ENV.PROD
    });
  }

  function historyOf(id) {
    return Db.filter(SHEET.HISTORY, function (r) { return String(r['申請ID']) === String(id); }).map(function (r) {
      return {
        at: String(r['日時']), action: String(r['操作']), actorEmail: String(r['操作者メール'] || ''),
        actorName: String(r['操作者名'] || ''), step: String(r['ステップ'] || ''), comment: String(r['コメント'] || '')
      };
    });
  }

  function generateId_() {
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var rand = Math.floor(Math.random() * 900 + 100);
    return (isTestMode_() ? 'T' : 'R') + stamp + '-' + rand;
  }

  // ---------------------------------------------------------------- 状態表示
  function receiptStepIndex_(req) {
    for (var i = 0; i < req.route.length; i++) if (req.route[i].type === STEP_TYPE.RECEIPT) return i;
    return -1;
  }

  function statusLabel(req) {
    var steps = req.route || [];
    switch (req.status) {
      case STATUS.PENDING: {
        var cur = steps[req.currentStep];
        var curName = cur ? cur.name.replace(/承認$/, '') : '承認者';
        if (req.currentStep === 0) return '申請中（' + curName + 'の承認待ち）';
        var prev = steps[req.currentStep - 1];
        return (prev ? prev.name.replace(/承認$/, '') + '承認済み' : '承認済み') + '（' + curName + 'の承認待ち）';
      }
      case STATUS.SUBMITTED: {
        var r = steps[receiptStepIndex_(req)];
        return '最終承認済み・' + (r ? r.name.replace(/受理$/, '') : '総務課・社長') + 'へ提出済み（受理待ち）';
      }
      case STATUS.RECEIVED: return '受理済み';
      case STATUS.REJECTED: return '却下';
      case STATUS.WITHDRAWN: return '取下げ';
      default: return req.status;
    }
  }

  function statusGroup(req) {
    if (req.status === STATUS.PENDING || req.status === STATUS.SUBMITTED) return 'open';
    return 'closed';
  }

  /** 各ステップの状態だけを求める（一覧の押印欄用。担当者名は引かないので軽い） */
  function stepStates_(req) {
    return req.route.map(function (step, idx) {
      var state = 'todo';
      if (step.type === STEP_TYPE.APPROVAL) {
        if (step.approvedBy) state = 'done';
        else if (req.status === STATUS.PENDING && req.currentStep === idx) state = 'current';
        else if (req.status === STATUS.REJECTED && req.currentStep === idx) state = 'rejected';
        else if (req.status === STATUS.WITHDRAWN && req.currentStep === idx) state = 'withdrawn';
      } else {
        if (req.status === STATUS.RECEIVED) state = 'done';
        else if (req.status === STATUS.SUBMITTED) state = 'current';
      }
      return { name: step.name, state: state };
    });
  }

  /** 進捗（画面のステップ表示用） */
  function progress(req) {
    var out = [{ name: '申請', state: 'done', by: req.applicantName, at: req.submittedAt }];
    req.route.forEach(function (step, idx) {
      var item = { name: step.name, state: 'todo', by: '', at: '', members: stepMembers_(step).map(Users.displayName) };
      if (step.type === STEP_TYPE.APPROVAL) {
        if (step.approvedBy) { item.state = 'done'; item.by = Users.displayName(step.approvedBy); item.at = step.approvedAt; }
        else if (req.status === STATUS.PENDING && req.currentStep === idx) item.state = 'current';
        else if (req.status === STATUS.REJECTED && req.currentStep === idx) { item.state = 'rejected'; item.by = step.rejectedBy ? Users.displayName(step.rejectedBy) : ''; item.at = step.rejectedAt || ''; }
        else if (req.status === STATUS.WITHDRAWN && req.currentStep === idx) item.state = 'withdrawn';
      } else {
        var received = (step.receivedBy || []).map(function (x) { return Users.displayName(x.email) + ' ' + x.at; });
        if (req.status === STATUS.RECEIVED) { item.state = 'done'; item.by = received.join(' / '); item.at = req.receivedAt; }
        else if (req.status === STATUS.SUBMITTED) { item.state = 'current'; item.by = received.join(' / '); }
      }
      out.push(item);
    });
    return out;
  }

  // ---------------------------------------------------------------- 操作
  function create(applicantEmail, typeId, values, selections) {
    var enabled = RequestTypes.listEnabled().some(function (t) { return t.id === typeId; });
    if (!enabled) throw new Error('この申請種別は現在利用できません。');
    var normalized = RequestTypes.normalizeValues(typeId, values || {});
    var errors = RequestTypes.validate(typeId, normalized);
    if (errors.length) throw new Error(errors.join('\n'));
    var route = buildRoute_(typeId, selections);
    if (!isTestMode_()) {
      route.forEach(function (step) {
        if (step.selectMode === SELECT_MODE.APPLICANT && step.approvers.indexOf(applicantEmail) >= 0) {
          throw new Error('自分自身を承認者に選ぶことはできません。');
        }
      });
    }
    var firstSel = route.filter(function (s) { return s.selectMode === SELECT_MODE.APPLICANT; })[0];
    var req = {
      id: generateId_(),
      typeId: typeId,
      typeName: RequestTypes.nameOf(typeId),
      applicantEmail: applicantEmail,
      applicantName: Users.displayName(applicantEmail),
      submittedAt: nowString_(),
      status: STATUS.PENDING,
      currentStep: 0,
      firstApproverEmail: firstSel ? firstSel.approvers[0] : '',
      firstApproverName: firstSel ? Users.displayName(firstSel.approvers[0]) : '',
      summary: RequestTypes.summary(typeId, normalized),
      values: normalized,
      route: route,
      finalApprovedAt: '',
      receivedAt: '',
      rejectReason: ''
    };
    Db.withLock(function () {
      req._row = Db.insert(SHEET.REQUESTS, toRow_(req));
      history_(req, ACTION.SUBMIT, applicantEmail, '', req.summary);
    });
    req.statusLabel = statusLabel(req);
    Notify.approvalRequest(req, route[0], stepMembers_(route[0]));
    return get(req.id);
  }

  function assertCurrentApprover_(req, actorEmail) {
    if (req.status !== STATUS.PENDING) throw new Error('この申請は既に処理済みです（' + statusLabel(req) + '）。');
    var step = req.route[req.currentStep];
    if (!step || step.type !== STEP_TYPE.APPROVAL) throw new Error('承認ステップではありません。');
    var members = stepMembers_(step);
    if (members.indexOf(actorEmail) < 0 && !Users.isAdmin(actorEmail)) {
      throw new Error('この申請を承認する権限がありません。');
    }
    if (!isTestMode_() && actorEmail === req.applicantEmail && !Users.isAdmin(actorEmail)) {
      throw new Error('自分の申請を自分で承認することはできません。');
    }
    return step;
  }

  function approve(id, actorEmail, comment) {
    var result = Db.withLock(function () {
      var req = get(id);
      if (!req) throw new Error('申請が見つかりません: ' + id);
      var step = assertCurrentApprover_(req, actorEmail);
      step.approvedBy = actorEmail;
      step.approvedAt = nowString_();
      step.comment = comment || '';
      history_(req, ACTION.APPROVE, actorEmail, step.name, comment);
      // 次のステップへ
      var next = req.currentStep + 1;
      var nextStep = req.route[next];
      var info = { req: req, step: step, nextStep: nextStep || null, final: false };
      if (!nextStep) {
        // 受理ステップが無い経路: 最終承認で完了
        req.status = STATUS.RECEIVED;
        req.finalApprovedAt = step.approvedAt;
        req.receivedAt = step.approvedAt;
        req.currentStep = next;
        history_(req, ACTION.FINAL_APPROVE, actorEmail, step.name, '');
        info.final = true;
        info.noReceipt = true;
      } else if (nextStep.type === STEP_TYPE.RECEIPT) {
        req.status = STATUS.SUBMITTED;
        req.finalApprovedAt = step.approvedAt;
        req.currentStep = next;
        history_(req, ACTION.FINAL_APPROVE, actorEmail, step.name, '');
        history_(req, ACTION.FORWARD, '', nextStep.name, nextStep.roles.join('・') + 'へ提出');
        info.final = true;
      } else {
        req.currentStep = next;
      }
      save_(req);
      req.statusLabel = statusLabel(req);
      return info;
    });
    var req = result.req;
    if (result.final) {
      Notify.finalApproved(req, actorEmail);
      if (result.nextStep && !result.noReceipt) Notify.forwarded(req, result.nextStep, stepMembers_(result.nextStep));
    } else {
      Notify.stepApproved(req, result.step, actorEmail, result.nextStep);
      Notify.approvalRequest(req, result.nextStep, stepMembers_(result.nextStep));
    }
    return get(id);
  }

  function reject(id, actorEmail, reason) {
    if (!reason || !String(reason).trim()) throw new Error('却下理由を入力してください。');
    var req = Db.withLock(function () {
      var r = get(id);
      if (!r) throw new Error('申請が見つかりません: ' + id);
      var step = assertCurrentApprover_(r, actorEmail);
      step.rejectedBy = actorEmail;
      step.rejectedAt = nowString_();
      r.status = STATUS.REJECTED;
      r.rejectReason = String(reason).trim();
      history_(r, ACTION.REJECT, actorEmail, step.name, r.rejectReason);
      save_(r);
      r.statusLabel = statusLabel(r);
      return r;
    });
    Notify.rejected(req, actorEmail);
    return get(id);
  }

  function receive(id, actorEmail, comment) {
    var done = Db.withLock(function () {
      var req = get(id);
      if (!req) throw new Error('申請が見つかりません: ' + id);
      if (req.status !== STATUS.SUBMITTED) throw new Error('受理待ちの申請ではありません（' + statusLabel(req) + '）。');
      var step = req.route[req.currentStep];
      if (!step || step.type !== STEP_TYPE.RECEIPT) throw new Error('受理ステップではありません。');
      var members = stepMembers_(step);
      if (members.indexOf(actorEmail) < 0 && !Users.isAdmin(actorEmail)) throw new Error('受理する権限がありません。');
      step.receivedBy = step.receivedBy || [];
      if (step.receivedBy.some(function (x) { return x.email === actorEmail; })) throw new Error('既に受理済みです。');
      step.receivedBy.push({ email: actorEmail, at: nowString_() });
      history_(req, ACTION.RECEIVE, actorEmail, step.name, comment || '');
      var rule = getSetting_('RECEIPT_RULE', 'ANY').toUpperCase();
      var complete = rule !== 'ALL' || members.every(function (m) {
        return step.receivedBy.some(function (x) { return x.email === m; });
      });
      if (complete) {
        req.status = STATUS.RECEIVED;
        req.receivedAt = nowString_();
      }
      save_(req);
      req.statusLabel = statusLabel(req);
      return { req: req, complete: complete };
    });
    if (done.complete) Notify.received(done.req, actorEmail);
    return get(id);
  }

  function withdraw(id, actorEmail) {
    if (!isTrue_(getSetting_('ALLOW_WITHDRAW', 'TRUE'))) throw new Error('申請の取下げは許可されていません。');
    var req = Db.withLock(function () {
      var r = get(id);
      if (!r) throw new Error('申請が見つかりません: ' + id);
      if (r.applicantEmail !== actorEmail) throw new Error('自分の申請のみ取下げできます。');
      if (r.status !== STATUS.PENDING || r.currentStep !== 0) throw new Error('上長の承認前の申請のみ取下げできます。');
      r.status = STATUS.WITHDRAWN;
      history_(r, ACTION.WITHDRAW, actorEmail, r.route[0].name, '');
      save_(r);
      r.statusLabel = statusLabel(r);
      return r;
    });
    Notify.withdrawn(req, stepMembers_(req.route[0]));
    return get(id);
  }

  // ---------------------------------------------------------------- 一覧
  function brief_(req) {
    return {
      id: req.id, typeId: req.typeId, typeName: req.typeName, applicantEmail: req.applicantEmail, applicantName: req.applicantName,
      submittedAt: req.submittedAt, status: req.status, statusLabel: req.statusLabel, summary: req.summary,
      currentStep: req.currentStep, currentStepName: req.route[req.currentStep] ? req.route[req.currentStep].name : '',
      firstApproverName: req.firstApproverName, updatedAt: req.updatedAt, group: statusGroup(req),
      steps: stepStates_(req)
    };
  }

  function sortDesc_(a, b) { return a.submittedAt < b.submittedAt ? 1 : -1; }

  function listMine(email) {
    return loadAll_().filter(function (r) { return r.applicantEmail === email; }).sort(sortDesc_).map(brief_);
  }

  /** 自分が承認すべき案件（承認待ち） */
  function listPendingFor(email) {
    return loadAll_().filter(function (r) {
      if (r.status !== STATUS.PENDING) return false;
      var step = r.route[r.currentStep];
      return step && step.type === STEP_TYPE.APPROVAL && stepMembers_(step).indexOf(email) >= 0;
    }).sort(sortDesc_).map(brief_);
  }

  /** 自分が承認・却下した案件、または自分の担当ステップを他の人（代理）が処理した案件 */
  function listHandledBy(email) {
    return loadAll_().filter(function (r) {
      return r.route.some(function (step) {
        if (step.type !== STEP_TYPE.APPROVAL) return false;
        if (step.approvedBy === email || step.rejectedBy === email) return true;
        return (step.approvedBy || step.rejectedBy) && stepMembers_(step).indexOf(email) >= 0;
      });
    }).sort(sortDesc_).map(function (r) {
      var b = brief_(r);
      var mine = r.route.filter(function (s) { return s.approvedBy === email || s.rejectedBy === email; })[0];
      b.myAction = mine ? (mine.approvedBy === email ? '承認' : '却下') : '他の承認者が処理';
      return b;
    });
  }

  /** 受理担当者向け: 受理待ち / 受理済み */
  function listForReceipt(email) {
    var all = loadAll_().filter(function (r) {
      var idx = receiptStepIndex_(r);
      if (idx < 0) return false;
      return stepMembers_(r.route[idx]).indexOf(email) >= 0 || Users.isAdmin(email);
    });
    return {
      pending: all.filter(function (r) { return r.status === STATUS.SUBMITTED; }).sort(sortDesc_).map(brief_),
      done: all.filter(function (r) { return r.status === STATUS.RECEIVED; }).sort(sortDesc_).map(brief_)
    };
  }

  function listAll() {
    return loadAll_().sort(sortDesc_).map(brief_);
  }

  /** 閲覧権限: 申請者、経路上の担当者、管理者 */
  function canView(req, email) {
    if (!req) return false;
    if (req.applicantEmail === email || Users.isAdmin(email)) return true;
    return req.route.some(function (step) { return stepMembers_(step).indexOf(email) >= 0; });
  }

  /** 詳細（画面表示用） */
  function detail(id, email) {
    var req = get(id);
    if (!req) throw new Error('申請が見つかりません: ' + id);
    if (!canView(req, email)) throw new Error('この申請を閲覧する権限がありません。');
    var step = req.route[req.currentStep];
    var canApprove = req.status === STATUS.PENDING && step && step.type === STEP_TYPE.APPROVAL &&
      stepMembers_(step).indexOf(email) >= 0 && (isTestMode_() || email !== req.applicantEmail);
    var canReceive = req.status === STATUS.SUBMITTED && step && step.type === STEP_TYPE.RECEIPT &&
      (stepMembers_(step).indexOf(email) >= 0 || Users.isAdmin(email)) &&
      !(step.receivedBy || []).some(function (x) { return x.email === email; });
    var canWithdraw = req.applicantEmail === email && req.status === STATUS.PENDING && req.currentStep === 0 &&
      isTrue_(getSetting_('ALLOW_WITHDRAW', 'TRUE'));
    return {
      request: brief_(req),
      rows: RequestTypes.displayRows(req.typeId, req.values),
      progress: progress(req),
      history: historyOf(id),
      rejectReason: req.rejectReason,
      finalApprovedAt: req.finalApprovedAt,
      receivedAt: req.receivedAt,
      can: { approve: !!canApprove, receive: !!canReceive, withdraw: !!canWithdraw }
    };
  }

  return {
    applicantSelections: applicantSelections,
    get: get,
    create: create,
    approve: approve,
    reject: reject,
    receive: receive,
    withdraw: withdraw,
    listMine: listMine,
    listPendingFor: listPendingFor,
    listHandledBy: listHandledBy,
    listForReceipt: listForReceipt,
    listAll: listAll,
    detail: detail,
    canView: canView,
    statusLabel: statusLabel,
    stepMembers: stepMembers_,
    receiptStepIndex: receiptStepIndex_
  };
})();
