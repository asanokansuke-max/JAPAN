/**
 * 申請種別の定義
 *
 * 新しい申請を追加するときは:
 *   1. ここに定義オブジェクトを追加する（入力項目・チェック・概要の作り方）
 *   2. 「申請種別マスター」シートに 種別ID / 名称 / 有効 / 表示順 を追加する
 *   3. 必要なら「承認経路」シートにその種別専用の経路を追加する（無ければ既定経路 * を使う）
 *   4. 「申請説明文」に注意事項を登録する（管理画面から編集可）
 *
 * 項目タイプ: text / textarea / date / time / number / select / radio / static
 * 共通属性: key, label, type, required, default, hint, options(select/radio), step(time の分単位), width('half')
 * default に '{today}' と書くと当日、'{setting:KEY}' と書くと設定シートの値を初期値にする。
 */
var RequestTypes = (function () {

  var definitions = {};

  // ----------------------------------------------------------------------
  // 1) 早朝残業申請（特別残業事後申請（早朝残業））
  // ----------------------------------------------------------------------
  definitions['early_overtime'] = {
    id: 'early_overtime',
    name: '早朝残業申請',
    formTitle: '特別残業事後申請（早朝残業）',
    icon: '🌅',
    fields: [
      { key: 'work_date', label: '対象日', type: 'date', required: true, default: '{today}', width: 'half',
        hint: '早朝残業を行った日' },
      { key: 'reason', label: '申請理由', type: 'textarea', required: true,
        placeholder: '例）撮影準備のため早朝から機材搬入を行ったため' },
      { key: 'start_time', label: '早出残業とみなす時間帯（開始）', type: 'time', required: true, width: 'half', step: 5,
        hint: '会社が認めた時刻を入力。終了は始業時刻（{setting:EARLY_OT_END_TIME}）で固定です。' },
      { key: 'early_end', label: '早出残業とみなす時間帯（終了）', type: 'static', default: '{setting:EARLY_OT_END_TIME}', width: 'half' },
      { key: 'lunch_break', label: '昼休憩', type: 'select', required: true, default: '60', width: 'half',
        options: [
          { value: '0', label: '取得なし' }, { value: '15', label: '15分取得' }, { value: '30', label: '30分取得' },
          { value: '45', label: '45分取得' }, { value: '60', label: '60分取得' }, { value: '75', label: '75分取得' },
          { value: '90', label: '90分取得' }
        ], hint: '15分単位で記入すること' },
      { key: 'end_time', label: '業務終了時刻', type: 'time', required: true, width: 'half', step: 5,
        default: '{setting:DEFAULT_WORK_END_TIME}', hint: '業務の終了時刻（撮影終了ではありません）' },
      { key: 'evening_break', label: '残業が発生した場合 17:30〜17:45 の休憩', type: 'radio', required: true, default: 'none',
        options: [
          { value: 'taken', label: '取得した' }, { value: 'not_taken', label: 'していない' }, { value: 'none', label: '残業なし' }
        ] }
    ],
    validate: function (v) {
      var errors = [];
      var endSetting = getSetting_('EARLY_OT_END_TIME', '08:20');
      if (v.start_time && toMinutes_(v.start_time) >= toMinutes_(endSetting)) {
        errors.push('早出残業の開始時刻は ' + endSetting + ' より前にしてください。');
      }
      if (v.end_time && v.end_time < '12:00') errors.push('業務終了時刻を確認してください。');
      return errors;
    },
    summary: function (v) {
      var endSetting = getSetting_('EARLY_OT_END_TIME', '08:20');
      var mins = v.start_time ? toMinutes_(endSetting) - toMinutes_(v.start_time) : 0;
      return formatDate_(v.work_date) + ' 早出 ' + toJpTime_(v.start_time) + '〜' + toJpTime_(endSetting) +
        (mins > 0 ? '（' + mins + '分）' : '') + ' / 終了 ' + toJpTime_(v.end_time);
    }
  };

  // ----------------------------------------------------------------------
  // 2) 代休申請
  // ----------------------------------------------------------------------
  definitions['substitute_holiday'] = {
    id: 'substitute_holiday',
    name: '代休申請',
    formTitle: '代休申請',
    icon: '🏖️',
    fields: [
      { key: 'apply_date', label: '申請日', type: 'date', required: true, default: '{today}', width: 'half' },
      { key: 'group_work', label: '休日出勤', type: 'group' },
      { key: 'work_date', label: '出勤日', type: 'date', required: true, width: 'half', group: 'group_work' },
      { key: 'work_start', label: '出勤時刻', type: 'time', required: true, width: 'half', step: 5, group: 'group_work' },
      { key: 'work_end', label: '退勤時刻', type: 'time', required: true, width: 'half', step: 5, group: 'group_work' },
      { key: 'work_reason', label: '出勤理由', type: 'text', required: true, group: 'group_work' },
      { key: 'sub_date', label: '代休取得日', type: 'date', required: true, width: 'half' },
      { key: 'sub_kind', label: '代休区分', type: 'radio', required: true, default: '一日休', width: 'half',
        options: [
          { value: '一日休', label: '一日休' }, { value: '午前休', label: '午前休' }, { value: '午後休', label: '午後休' }
        ] }
    ],
    validate: function (v) {
      var errors = [];
      if (v.work_start && v.work_end && toMinutes_(v.work_end) <= toMinutes_(v.work_start)) {
        errors.push('退勤時刻は出勤時刻より後にしてください。');
      }
      if (v.work_date && v.sub_date && v.work_date === v.sub_date) errors.push('出勤日と代休取得日が同じ日になっています。');
      return errors;
    },
    summary: function (v) {
      return '休日出勤 ' + formatDate_(v.work_date) + ' ' + toJpTime_(v.work_start) + '〜' + toJpTime_(v.work_end) +
        ' → 代休 ' + formatDate_(v.sub_date) + '（' + (v.sub_kind || '') + '）';
    }
  };

  // ----------------------------------------------------------------------
  // 3) 除雪申請（入力項目は仮。GroupSession の稟議に合わせて調整してください）
  // ----------------------------------------------------------------------
  definitions['snow_removal'] = {
    id: 'snow_removal',
    name: '除雪申請',
    formTitle: '除雪作業申請',
    icon: '❄️',
    fields: [
      { key: 'snow_date', label: '除雪実施日', type: 'date', required: true, default: '{today}', width: 'half' },
      { key: 'place', label: '除雪場所', type: 'text', required: true, width: 'half', placeholder: '例）本社駐車場・社屋前歩道' },
      { key: 'start_time', label: '開始時刻', type: 'time', required: true, width: 'half', step: 5 },
      { key: 'end_time', label: '終了時刻', type: 'time', required: true, width: 'half', step: 5 },
      { key: 'members', label: '作業者', type: 'text', hint: '申請者以外に作業した人がいれば記入' },
      { key: 'note', label: '備考', type: 'textarea' }
    ],
    validate: function (v) {
      var errors = [];
      if (v.start_time && v.end_time && toMinutes_(v.end_time) <= toMinutes_(v.start_time)) errors.push('終了時刻は開始時刻より後にしてください。');
      return errors;
    },
    summary: function (v) {
      var mins = (v.start_time && v.end_time) ? toMinutes_(v.end_time) - toMinutes_(v.start_time) : 0;
      return formatDate_(v.snow_date) + ' ' + (v.place || '') + ' ' + toJpTime_(v.start_time) + '〜' + toJpTime_(v.end_time) +
        (mins > 0 ? '（' + mins + '分）' : '');
    }
  };

  // ----------------------------------------------------------------------
  // 共通処理
  // ----------------------------------------------------------------------
  function toMinutes_(hhmm) {
    if (!hhmm) return 0;
    var p = String(hhmm).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
  }

  function toJpTime_(hhmm) {
    if (!hhmm) return '';
    var p = String(hhmm).split(':');
    return parseInt(p[0], 10) + '時' + (p[1] && p[1] !== '00' ? parseInt(p[1], 10) + '分' : '');
  }

  function resolveDefault_(def) {
    if (def === undefined || def === null) return '';
    var s = String(def);
    if (s === '{today}') return formatDate_(new Date(), 'yyyy-MM-dd');
    var m = s.match(/^\{setting:([A-Z0-9_]+)\}$/);
    if (m) return getSetting_(m[1], '');
    return s;
  }

  function resolveText_(text) {
    if (!text) return text;
    return String(text).replace(/\{setting:([A-Z0-9_]+)\}/g, function (_, k) { return getSetting_(k, ''); });
  }

  /** 申請種別マスターと定義を突き合わせて、有効な種別の一覧を返す */
  function listEnabled() {
    var master = Db.readAll(SHEET.TYPES);
    var list = [];
    master.forEach(function (m) {
      var id = String(m['種別ID'] || '').trim();
      var def = definitions[id];
      if (!def) return;
      if (m['有効'] !== '' && !isTrue_(m['有効'])) return;
      list.push({
        id: id,
        name: String(m['名称'] || def.name),
        note: String(m['補足'] || ''),
        icon: def.icon || '📝',
        order: Number(m['表示順'] || 999)
      });
    });
    list.sort(function (a, b) { return a.order - b.order; });
    return list;
  }

  function get(id) {
    return definitions[id] || null;
  }

  function nameOf(id) {
    var m = Db.find(SHEET.TYPES, function (r) { return String(r['種別ID']).trim() === id; });
    if (m && m['名称']) return String(m['名称']);
    var def = definitions[id];
    return def ? def.name : id;
  }

  /** クライアントに渡すためのフォーム定義（初期値・設定値を展開） */
  function formDefinition(id) {
    var def = definitions[id];
    if (!def) throw new Error('未対応の申請種別です: ' + id);
    return {
      id: def.id,
      name: nameOf(id),
      formTitle: def.formTitle || def.name,
      icon: def.icon,
      fields: def.fields.map(function (f) {
        var c = JSON.parse(JSON.stringify(f));
        c.default = resolveDefault_(f.default);
        c.hint = resolveText_(f.hint);
        c.label = resolveText_(f.label);
        return c;
      }),
      description: Descriptions.getHtml(id)
    };
  }

  /** 入力値の検証。エラー文言の配列を返す（空なら OK） */
  function validate(id, values) {
    var def = definitions[id];
    if (!def) return ['未対応の申請種別です'];
    var errors = [];
    def.fields.forEach(function (f) {
      if (f.type === 'group' || f.type === 'static') return;
      var v = values[f.key];
      var empty = v === undefined || v === null || String(v).trim() === '';
      if (f.required && empty) errors.push('「' + f.label + '」は必須です。');
      if (empty) return;
      if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors.push('「' + f.label + '」の日付形式が正しくありません。');
      if (f.type === 'time' && !/^\d{1,2}:\d{2}$/.test(String(v))) errors.push('「' + f.label + '」の時刻形式が正しくありません。');
      if ((f.type === 'select' || f.type === 'radio') && f.options &&
          !f.options.some(function (o) { return String(o.value) === String(v); })) {
        errors.push('「' + f.label + '」の選択値が不正です。');
      }
    });
    if (errors.length === 0 && def.validate) errors = errors.concat(def.validate(values) || []);
    return errors;
  }

  /** 保存用に値を正規化（定義に無いキーは捨てる） */
  function normalizeValues(id, values) {
    var def = definitions[id];
    var out = {};
    def.fields.forEach(function (f) {
      if (f.type === 'group') return;
      if (f.type === 'static') { out[f.key] = resolveDefault_(f.default); return; }
      var v = values[f.key];
      if (v === undefined || v === null) v = '';
      v = String(v).trim();
      if (f.type === 'time' && /^\d:\d{2}$/.test(v)) v = '0' + v;
      out[f.key] = v;
    });
    return out;
  }

  function summary(id, values) {
    var def = definitions[id];
    if (!def) return '';
    try { return def.summary ? def.summary(values) : ''; } catch (e) { return ''; }
  }

  /** 表示用に「項目名: 値」の配列へ変換 */
  function displayRows(id, values) {
    var def = definitions[id];
    if (!def) return [];
    var rows = [];
    def.fields.forEach(function (f) {
      if (f.type === 'group') return;
      var v = values[f.key];
      if (v === undefined || v === null || v === '') return;
      var text = String(v);
      if (f.type === 'date') text = formatDate_(v, 'yyyy/MM/dd (E)');
      if (f.type === 'time' || (f.type === 'static' && /^\d{1,2}:\d{2}$/.test(text))) text = toJpTime_(v);
      if ((f.type === 'select' || f.type === 'radio') && f.options) {
        f.options.forEach(function (o) { if (String(o.value) === String(v)) text = o.label; });
      }
      rows.push({ label: resolveText_(f.label), value: text, key: f.key });
    });
    return rows;
  }

  return {
    listEnabled: listEnabled,
    get: get,
    nameOf: nameOf,
    formDefinition: formDefinition,
    validate: validate,
    normalizeValues: normalizeValues,
    summary: summary,
    displayRows: displayRows,
    allIds: function () { return Object.keys(definitions); }
  };
})();
