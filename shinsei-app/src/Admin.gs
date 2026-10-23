/**
 * 管理機能（マスター編集・設定・概要）
 */
var Admin = (function () {

  /** 管理画面から編集できるシート（他ファイルの定数を参照するため関数にして読み込み順に依存しない） */
  function editable_() { return [SHEET.USERS, SHEET.ROLES, SHEET.TYPES, SHEET.ROUTES, SHEET.CHAT_SPACES]; }

  function overview() {
    var settings = getSettings_();
    var ss = getSpreadsheet_();
    return {
      settings: DEFAULT_SETTINGS.map(function (d) {
        return { key: d[0], value: settings[d[0]] !== undefined ? settings[d[0]] : d[1], description: d[2] };
      }),
      mode: isTestMode_() ? MODE.TEST : MODE.PROD,
      spreadsheetUrl: ss.getUrl(),
      webAppUrl: (function () { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } })(),
      editableSheets: editable_(),
      roles: ALL_ROLES,
      envValues: [ENV.BOTH, ENV.PROD, ENV.TEST],
      typeIds: RequestTypes.allIds(),
      types: RequestTypes.allIds().map(function (id) { var d = RequestTypes.get(id); return { id: id, name: d.name, formTitle: d.formTitle }; }),
      roleAssignments: Db.readAll(SHEET.ROLES).map(function (r) {
        return { role: String(r['役割']), email: String(r['メールアドレス']), name: String(r['氏名'] || ''), env: String(r['環境'] || ''), enabled: r['有効'] === '' || isTrue_(r['有効']) };
      }),
      chatConfigured: !!PropertiesService.getScriptProperties().getProperty('CHAT_SERVICE_ACCOUNT_JSON'),
      counts: {
        requests: Db.readAll(SHEET.REQUESTS).length,
        users: Users.listUsers().length
      }
    };
  }

  function getSheet(name) {
    if (editable_().indexOf(name) < 0) throw new Error('このシートは管理画面から編集できません: ' + name);
    var sheet = Db.getSheet(name);
    var headers = HEADERS[name];
    var lastRow = sheet.getLastRow();
    var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
    rows = rows.filter(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); })
      .map(function (r) { return r.map(function (v) { return v instanceof Date ? formatDate_(v, 'yyyy/MM/dd HH:mm:ss') : (v === null ? '' : String(v)); }); });
    return { name: name, headers: headers, rows: rows, hints: hintsFor_(name) };
  }

  function hintsFor_(name) {
    var h = {};
    if (name === SHEET.ROLES) {
      h['役割'] = { options: ALL_ROLES };
      h['環境'] = { options: [ENV.BOTH, ENV.PROD, ENV.TEST] };
      h['有効'] = { options: ['TRUE', 'FALSE'] };
    }
    if (name === SHEET.USERS) h['有効'] = { options: ['TRUE', 'FALSE'] };
    if (name === SHEET.TYPES) {
      h['種別ID'] = { options: RequestTypes.allIds() };
      h['有効'] = { options: ['TRUE', 'FALSE'] };
    }
    if (name === SHEET.ROUTES) {
      h['申請種別ID'] = { options: ['*'].concat(RequestTypes.allIds()) };
      h['ステップ種類'] = { options: [STEP_TYPE.APPROVAL, STEP_TYPE.RECEIPT] };
      h['選択方式'] = { options: [SELECT_MODE.APPLICANT, SELECT_MODE.ROLE] };
    }
    return h;
  }

  function saveSheet(name, rows, editorEmail) {
    if (editable_().indexOf(name) < 0) throw new Error('このシートは管理画面から編集できません: ' + name);
    var headers = HEADERS[name];
    var clean = (rows || []).map(function (r) {
      return headers.map(function (_, i) { return r[i] === undefined || r[i] === null ? '' : String(r[i]).trim(); });
    });
    validateSheet_(name, headers, clean);
    Db.withLock(function () { Db.replaceAll(name, clean); });
    CacheService.getScriptCache().removeAll(['settings']);
    log_('INFO', 'マスター更新: ' + name, { by: editorEmail, rows: clean.length });
    return getSheet(name);
  }

  function validateSheet_(name, headers, rows) {
    var idx = function (h) { return headers.indexOf(h); };
    if (name === SHEET.ROLES) {
      rows.forEach(function (r, i) {
        if (ALL_ROLES.indexOf(r[idx('役割')]) < 0) throw new Error((i + 1) + '行目: 役割「' + r[idx('役割')] + '」は無効です。');
        if (!/@/.test(r[idx('メールアドレス')])) throw new Error((i + 1) + '行目: メールアドレスが正しくありません。');
      });
      if (!rows.some(function (r) { return r[idx('役割')] === ROLE.ADMIN; })) {
        throw new Error('システム管理者が1人もいなくなります。少なくとも1人は残してください。');
      }
    }
    if (name === SHEET.ROUTES) {
      rows.forEach(function (r, i) {
        if (!r[idx('ステップ名')]) throw new Error((i + 1) + '行目: ステップ名は必須です。');
        if (!r[idx('役割')]) throw new Error((i + 1) + '行目: 役割は必須です。');
        if ([STEP_TYPE.APPROVAL, STEP_TYPE.RECEIPT].indexOf(r[idx('ステップ種類')]) < 0) throw new Error((i + 1) + '行目: ステップ種類は「承認」か「受理」にしてください。');
      });
    }
    if (name === SHEET.TYPES) {
      rows.forEach(function (r, i) {
        if (!RequestTypes.get(r[idx('種別ID')])) throw new Error((i + 1) + '行目: 種別ID「' + r[idx('種別ID')] + '」はプログラムに定義がありません。');
      });
    }
  }

  function saveSettings(settings, editorEmail) {
    var allowed = {};
    DEFAULT_SETTINGS.forEach(function (d) { allowed[d[0]] = d[2]; });
    Db.withLock(function () {
      var rows = Db.readAll(SHEET.SETTINGS);
      Object.keys(settings || {}).forEach(function (key) {
        if (!allowed[key]) return;
        var value = settings[key] === null || settings[key] === undefined ? '' : String(settings[key]).trim();
        if (key === 'MODE' && [MODE.TEST, MODE.PROD].indexOf(value.toUpperCase()) < 0) throw new Error('MODE は TEST か PROD にしてください。');
        if (key === 'MODE') value = value.toUpperCase();
        var row = rows.filter(function (r) { return String(r['キー']).trim() === key; })[0];
        if (row) Db.updateRow(SHEET.SETTINGS, row._row, { '値': value });
        else Db.insert(SHEET.SETTINGS, { 'キー': key, '値': value, '説明': allowed[key] });
      });
    });
    clearSettingsCache_();
    log_('INFO', '設定更新', { by: editorEmail, keys: Object.keys(settings || {}) });
    return overview();
  }

  return { overview: overview, getSheet: getSheet, saveSheet: saveSheet, saveSettings: saveSettings };
})();
