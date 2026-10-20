/**
 * スプレッドシートを簡易データベースとして扱うためのヘルパー。
 * - ヘッダー行をキーにしたオブジェクト配列で読み書きする
 * - 書き込みは LockService で直列化し、承認の重複や上書きを防ぐ
 */
var Db = (function () {

  function getSheet(baseName, opt_noCreate) {
    var name = dataSheetName_(baseName);
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      if (opt_noCreate) return null;
      sheet = ss.insertSheet(name);
      var headers = HEADERS[baseName];
      if (headers) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
    }
    return sheet;
  }

  function headersOf_(sheet) {
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return [];
    return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  }

  /** 全行をオブジェクト配列で返す。各オブジェクトには _row（シート上の行番号）が付く */
  function readAll(baseName) {
    var sheet = getSheet(baseName);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var headers = headersOf_(sheet);
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var out = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var empty = row.every(function (v) { return v === '' || v === null; });
      if (empty) continue;
      var obj = { _row: i + 2 };
      for (var j = 0; j < headers.length; j++) {
        if (headers[j]) obj[headers[j]] = row[j];
      }
      out.push(obj);
    }
    return out;
  }

  function find(baseName, predicate) {
    var rows = readAll(baseName);
    for (var i = 0; i < rows.length; i++) if (predicate(rows[i])) return rows[i];
    return null;
  }

  function filter(baseName, predicate) {
    return readAll(baseName).filter(predicate);
  }

  /** オブジェクトを1行として追加 */
  function insert(baseName, obj) {
    var sheet = getSheet(baseName);
    var headers = headersOf_(sheet);
    var row = headers.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; });
    sheet.appendRow(row);
    return sheet.getLastRow();
  }

  /** 指定行の一部の列を更新（obj に含まれる列のみ） */
  function updateRow(baseName, rowNumber, obj) {
    var sheet = getSheet(baseName);
    var headers = headersOf_(sheet);
    var current = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    var changed = false;
    headers.forEach(function (h, idx) {
      if (h && Object.prototype.hasOwnProperty.call(obj, h)) {
        current[idx] = obj[h] === undefined || obj[h] === null ? '' : obj[h];
        changed = true;
      }
    });
    if (changed) sheet.getRange(rowNumber, 1, 1, headers.length).setValues([current]);
  }

  /** マスターシート全体を置き換える（ヘッダーは維持） */
  function replaceAll(baseName, rows2d) {
    var sheet = getSheet(baseName);
    var headers = HEADERS[baseName] || headersOf_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), headers.length)).clearContent();
    var clean = (rows2d || []).filter(function (r) {
      return r && r.some(function (v) { return v !== '' && v !== null && v !== undefined; });
    }).map(function (r) {
      var row = [];
      for (var i = 0; i < headers.length; i++) row.push(r[i] === undefined || r[i] === null ? '' : r[i]);
      return row;
    });
    if (clean.length) sheet.getRange(2, 1, clean.length, headers.length).setValues(clean);
  }

  /** 排他ロック付きで関数を実行 */
  function withLock(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  return {
    getSheet: getSheet,
    readAll: readAll,
    find: find,
    filter: filter,
    insert: insert,
    updateRow: updateRow,
    replaceAll: replaceAll,
    withLock: withLock
  };
})();
