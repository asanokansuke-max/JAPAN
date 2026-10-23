/**
 * Webアプリ（クライアント）から google.script.run で呼び出す API
 * すべての関数でログインユーザーを取得し、サーバー側で権限を確認する。
 */

function apiOk_(data) { return { ok: true, data: data }; }
function apiError_(e) {
  log_('WARN', 'API エラー', String(e && e.stack || e));
  return { ok: false, error: String(e && e.message || e) };
}
function api_(fn) {
  try { return apiOk_(fn(Users.currentEmail())); } catch (e) { return apiError_(e); }
}

/** 初期表示に必要な情報 */
function apiBootstrap() {
  return api_(function (email) {
    Users.ensureRegistered(email);
    var roles = Users.rolesOf(email);
    var isAdmin = Users.isAdmin(email);
    var receipt = Workflow.listForReceipt(email);
    var canReceive = Users.hasAnyRole(email, [ROLE.GENERAL_AFFAIRS, ROLE.PRESIDENT]) || isAdmin;
    return {
      user: { email: email, name: Users.displayName(email), roles: roles, isAdmin: isAdmin,
        dept: (Users.findUser(email) || {}).dept || '' },
      mode: isTestMode_() ? MODE.TEST : MODE.PROD,
      testNotifyEmail: getSetting_('TEST_NOTIFY_EMAIL', ''),
      types: RequestTypes.listEnabled(),
      flags: {
        approver: Users.hasAnyRole(email, [ROLE.MANAGER, ROLE.DIRECTOR, ROLE.DEPUTY]) || isAdmin,
        receiver: canReceive,
        admin: isAdmin
      },
      counts: {
        pendingApprovals: Workflow.listPendingFor(email).length,
        pendingReceipts: canReceive ? receipt.pending.length : 0,
        myOpen: Workflow.listMine(email).filter(function (r) { return r.group === 'open'; }).length
      },
      appName: APP_NAME
    };
  });
}

/** 申請フォームの定義（項目・説明文・承認者候補） */
function apiFormDefinition(typeId) {
  return api_(function (email) {
    var def = RequestTypes.formDefinition(typeId);
    def.selections = Workflow.applicantSelections(typeId);
    def.applicant = { email: email, name: Users.displayName(email) };
    return def;
  });
}

/** 申請の送信 */
function apiSubmitRequest(typeId, values, selections) {
  return api_(function (email) {
    var req = Workflow.create(email, typeId, values || {}, selections || {});
    return { id: req.id, statusLabel: req.statusLabel };
  });
}

function apiMyRequests() {
  return api_(function (email) { return Workflow.listMine(email); });
}

function apiApprovals() {
  return api_(function (email) {
    return { pending: Workflow.listPendingFor(email), done: Workflow.listHandledBy(email) };
  });
}

function apiReceipts() {
  return api_(function (email) {
    if (!Users.hasAnyRole(email, [ROLE.GENERAL_AFFAIRS, ROLE.PRESIDENT]) && !Users.isAdmin(email)) throw new Error('受理画面を表示する権限がありません。');
    return Workflow.listForReceipt(email);
  });
}

function apiRequestDetail(id) {
  return api_(function (email) { return Workflow.detail(id, email); });
}

function apiApprove(id, comment) {
  return api_(function (email) { Workflow.approve(id, email, comment); return Workflow.detail(id, email); });
}

function apiReject(id, reason) {
  return api_(function (email) { Workflow.reject(id, email, reason); return Workflow.detail(id, email); });
}

function apiReceive(id, comment) {
  return api_(function (email) { Workflow.receive(id, email, comment); return Workflow.detail(id, email); });
}

function apiWithdraw(id) {
  return api_(function (email) { Workflow.withdraw(id, email); return Workflow.detail(id, email); });
}

// ---------------------------------------------------------------- 管理画面
function requireAdmin_(email) {
  if (!Users.isAdmin(email)) throw new Error('管理者権限が必要です。');
}

function apiAdminOverview() {
  return api_(function (email) {
    requireAdmin_(email);
    return Admin.overview();
  });
}

function apiAdminGetSheet(name) {
  return api_(function (email) { requireAdmin_(email); return Admin.getSheet(name); });
}

function apiAdminSaveSheet(name, rows) {
  return api_(function (email) { requireAdmin_(email); return Admin.saveSheet(name, rows, email); });
}

function apiAdminSaveSettings(settings) {
  return api_(function (email) { requireAdmin_(email); return Admin.saveSettings(settings, email); });
}

function apiAdminSaveDescription(typeId, html) {
  return api_(function (email) { requireAdmin_(email); return { html: Descriptions.save(typeId, html, email) }; });
}

function apiAdminGetDescription(typeId) {
  return api_(function (email) { requireAdmin_(email); return { html: Descriptions.getHtml(typeId) }; });
}

function apiAdminSendTestNotification(target) {
  return api_(function (email) {
    requireAdmin_(email);
    Notify.sendTest(target || email);
    return { sent: true, to: isTestMode_() ? getSetting_('TEST_NOTIFY_EMAIL', '') : (target || email) };
  });
}

function apiAdminAllRequests() {
  return api_(function (email) { requireAdmin_(email); return Workflow.listAll(); });
}

function apiAdminChatSpaces() {
  return api_(function (email) { requireAdmin_(email); return ChatApp.listRegistered(); });
}
