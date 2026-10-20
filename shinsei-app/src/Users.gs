/**
 * 利用者・役割の管理
 *
 * - 利用者は Google Workspace アカウント（メールアドレス）で識別する
 * - 役割は「役割マスター」シートで管理し、同じ人が複数の役割を兼任できる
 * - 「環境」列（本番 / テスト / 共通）で、運用モードごとに有効な役割を切り替える
 */
var Users = (function () {

  function currentEmail() {
    var email = Session.getActiveUser().getEmail();
    if (!email) email = Session.getEffectiveUser().getEmail();
    if (!email) throw new Error('ログインユーザーを識別できません。Google Workspace のアカウントでアクセスしてください。');
    return String(email).trim().toLowerCase();
  }

  function normalize_(email) {
    return String(email || '').trim().toLowerCase();
  }

  /** 利用者マスターの有効な利用者一覧 */
  function listUsers() {
    return Db.readAll(SHEET.USERS).filter(function (u) {
      return u['メールアドレス'] && (u['有効'] === '' || isTrue_(u['有効']));
    }).map(function (u) {
      return {
        email: normalize_(u['メールアドレス']),
        name: String(u['氏名'] || '').trim() || normalize_(u['メールアドレス']),
        dept: String(u['部署'] || ''),
        row: u._row
      };
    });
  }

  function findUser(email) {
    var e = normalize_(email);
    var users = listUsers();
    for (var i = 0; i < users.length; i++) if (users[i].email === e) return users[i];
    return null;
  }

  /** 表示名（マスターに無ければメールの @ より前） */
  function displayName(email) {
    var u = findUser(email);
    if (u) return u.name;
    var roleRow = Db.find(SHEET.ROLES, function (r) { return normalize_(r['メールアドレス']) === normalize_(email) && r['氏名']; });
    if (roleRow) return String(roleRow['氏名']);
    return normalize_(email).split('@')[0];
  }

  /** 初回アクセス時に利用者マスターへ自動登録 */
  function ensureRegistered(email) {
    var e = normalize_(email);
    if (findUser(e)) return;
    Db.withLock(function () {
      if (findUser(e)) return;
      Db.insert(SHEET.USERS, {
        'メールアドレス': e,
        '氏名': e.split('@')[0],
        '部署': '',
        '有効': 'TRUE',
        '備考': '初回アクセス時に自動登録 ' + nowString_()
      });
    });
  }

  /** 現在の運用モードで有効な役割マスター行 */
  function activeRoleRows_() {
    var test = isTestMode_();
    return Db.readAll(SHEET.ROLES).filter(function (r) {
      if (!r['役割'] || !r['メールアドレス']) return false;
      if (r['有効'] !== '' && !isTrue_(r['有効'])) return false;
      var env = String(r['環境'] || ENV.BOTH).trim();
      if (env === ENV.BOTH || env === '') return true;
      return test ? env === ENV.TEST : env === ENV.PROD;
    });
  }

  /** 指定役割を持つ人のメール一覧 */
  function emailsForRole(role) {
    var seen = {};
    var out = [];
    activeRoleRows_().forEach(function (r) {
      if (String(r['役割']).trim() !== role) return;
      var e = normalize_(r['メールアドレス']);
      if (!seen[e]) { seen[e] = true; out.push(e); }
    });
    return out;
  }

  function emailsForRoles(roles) {
    var seen = {};
    var out = [];
    (roles || []).forEach(function (role) {
      emailsForRole(role).forEach(function (e) {
        if (!seen[e]) { seen[e] = true; out.push(e); }
      });
    });
    return out;
  }

  /** 指定役割の候補者（名前付き） */
  function candidatesForRole(role) {
    return emailsForRole(role).map(function (e) { return { email: e, name: displayName(e) }; });
  }

  /** ユーザーの役割一覧（一般申請者は全員に付与） */
  function rolesOf(email) {
    var e = normalize_(email);
    var roles = [ROLE.APPLICANT];
    activeRoleRows_().forEach(function (r) {
      if (normalize_(r['メールアドレス']) === e) {
        var role = String(r['役割']).trim();
        if (roles.indexOf(role) < 0) roles.push(role);
      }
    });
    return roles;
  }

  function hasRole(email, role) {
    return rolesOf(email).indexOf(role) >= 0;
  }

  function hasAnyRole(email, roles) {
    var mine = rolesOf(email);
    return (roles || []).some(function (r) { return mine.indexOf(r) >= 0; });
  }

  function isAdmin(email) {
    if (hasRole(email, ROLE.ADMIN)) return true;
    // 管理者が一人も登録されていない場合はスプレッドシートの所有者を管理者とみなす
    if (emailsForRole(ROLE.ADMIN).length === 0) {
      try {
        var owner = getSpreadsheet_().getOwner();
        if (owner && normalize_(owner.getEmail()) === normalize_(email)) return true;
      } catch (e) { /* ignore */ }
      return normalize_(Session.getEffectiveUser().getEmail()) === normalize_(email);
    }
    return false;
  }

  return {
    currentEmail: currentEmail,
    normalize: normalize_,
    listUsers: listUsers,
    findUser: findUser,
    displayName: displayName,
    ensureRegistered: ensureRegistered,
    emailsForRole: emailsForRole,
    emailsForRoles: emailsForRoles,
    candidatesForRole: candidatesForRole,
    rolesOf: rolesOf,
    hasRole: hasRole,
    hasAnyRole: hasAnyRole,
    isAdmin: isAdmin
  };
})();
