/**
 * 申請ごとの説明文（注意事項・社内ルール）
 * 「申請説明文」シートに HTML で保存し、管理画面のリッチテキストエディタから編集する。
 * 保存時にスクリプトなど危険なタグ・属性を除去する。
 */
var Descriptions = (function () {

  var ALLOWED_TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h1', 'h2', 'h3', 'h4', 'h5',
    'ul', 'ol', 'li', 'a', 'span', 'font', 'div', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'small', 'sub', 'sup'];
  var ALLOWED_ATTRS = { 'a': ['href', 'target', 'rel'], 'span': ['style'], 'font': ['color', 'size'], 'div': ['style'], 'p': ['style'],
    'td': ['colspan', 'rowspan'], 'th': ['colspan', 'rowspan'], 'li': ['style'], 'h1': ['style'], 'h2': ['style'], 'h3': ['style'], 'h4': ['style'] };

  function sanitize(html) {
    if (!html) return '';
    var s = String(html);
    // script / style / iframe などは中身ごと削除
    s = s.replace(/<(script|style|iframe|object|embed|form|input|textarea|button|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<(script|style|iframe|object|embed|form|input|textarea|button|meta|link)[^>]*\/?>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    // タグごとに検査
    s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, function (whole, tag, attrs) {
      tag = tag.toLowerCase();
      if (ALLOWED_TAGS.indexOf(tag) < 0) return '';
      if (whole.charAt(1) === '/') return '</' + tag + '>';
      var allowed = ALLOWED_ATTRS[tag] || [];
      var kept = '';
      var re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
      var m;
      while ((m = re.exec(attrs)) !== null) {
        var name = m[1].toLowerCase();
        var value = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5]);
        if (allowed.indexOf(name) < 0) continue;
        if (/^on/i.test(name)) continue;
        if (tag === 'a' && (name === 'target' || name === 'rel')) continue; // 後で固定値を付ける
        if (name === 'href' && /^\s*(javascript|data|vbscript):/i.test(value)) continue;
        if (name === 'style') {
          // color / background-color / font-weight / text-decoration / font-size のみ許可
          var safe = [];
          value.split(';').forEach(function (decl) {
            var kv = decl.split(':');
            if (kv.length < 2) return;
            var prop = kv[0].trim().toLowerCase();
            var val = kv.slice(1).join(':').trim();
            if (['color', 'background-color', 'font-weight', 'text-decoration', 'font-size', 'font-style'].indexOf(prop) >= 0 &&
                !/url\(|expression|javascript/i.test(val)) safe.push(prop + ': ' + val);
          });
          if (!safe.length) continue;
          value = safe.join('; ');
        }
        kept += ' ' + name + '="' + value.replace(/"/g, '&quot;') + '"';
      }
      if (tag === 'a') kept += ' target="_blank" rel="noopener"';
      return '<' + tag + kept + '>';
    });
    return s;
  }

  function getHtml(typeId) {
    var row = Db.find(SHEET.DESCRIPTIONS, function (r) { return String(r['種別ID']).trim() === typeId; });
    return row ? sanitize(row['説明HTML']) : '';
  }

  function save(typeId, html, editorEmail) {
    var clean = sanitize(html);
    Db.withLock(function () {
      var row = Db.find(SHEET.DESCRIPTIONS, function (r) { return String(r['種別ID']).trim() === typeId; });
      var data = { '種別ID': typeId, '説明HTML': clean, '更新日時': nowString_(), '更新者': editorEmail };
      if (row) Db.updateRow(SHEET.DESCRIPTIONS, row._row, data); else Db.insert(SHEET.DESCRIPTIONS, data);
    });
    return clean;
  }

  /** HTML からテキストだけ取り出す（Chat 通知用） */
  function toPlainText(html) {
    return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  return { sanitize: sanitize, getHtml: getHtml, save: save, toPlainText: toPlainText };
})();
