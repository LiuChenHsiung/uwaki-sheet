(() => {
  'use strict';
  const D = globalThis.SHEET_DATA;
  const C = globalThis.SheetCore;
  const STORAGE_KEY = 'uwaki-sheet-bilingual-v1';
  const root = document.getElementById('root');
  const circles = ['①', '②', '③'];
  let state = C.initialState();
  let renderId = 0;
  let toastTimer;
  let advanceTimer;
  let previewUrls = [];
  let summaryImage = null;
  try { state = C.normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { /* Use a fresh sheet if storage cannot be read. */ }
  const queryLang = new URL(location.href).searchParams.get('lang');
  if (['zh', 'ja'].includes(queryLang)) state.lang = queryLang;
  const t = () => D.ui[state.lang];
  const q = index => D.questions[index][state.lang === 'ja' ? 0 : 1];
  const pad = n => String(n).padStart(2, '0');
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const format = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { toast(t().unsaved); }
  }
  function toast(message) {
    const element = document.getElementById('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
  }
  function changeView(view, index, focus = true) {
    clearTimeout(advanceTimer);
    state.view = view;
    if (Number.isInteger(index)) state.index = Math.min(39, Math.max(0, index));
    save();
    render();
    if (focus) document.getElementById('view-heading')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function continueAnswering() {
    const first = C.firstUnanswered(state);
    if (first !== -1) changeView('question', first);
    else changeView(typeof state.reflection === 'boolean' ? 'result' : 'reflection');
  }
  function header() {
    const u = t();
    const count = C.answered(state);
    const label = { intro: 'START', reflection: 'LAST', result: 'RESULT', sheet: `${count} / 40` }[state.view] || `${pad(state.index + 1)} / 40`;
    return `<div class="tools"><nav class="language-switch" aria-label="語言 / 言語"><button id="lang-zh" data-lang="zh" lang="zh-TW" aria-pressed="${state.lang === 'zh'}">繁體中文</button><button id="lang-ja" data-lang="ja" lang="ja" aria-pressed="${state.lang === 'ja'}">日本語</button></nav><button class="link mode-link" id="toggle-view">${state.view === 'sheet' ? u.questionView : u.sheetView}</button></div>
      <div class="topbar"><div class="xs" aria-hidden="true">✕✕</div><div class="pill" role="progressbar" aria-label="${u.progress}" aria-valuemin="0" aria-valuemax="40" aria-valuenow="${count}"><div class="fill" style="width:${count / 40 * 100}%"></div><span>${label}</span></div><div class="xs" aria-hidden="true">✕✕</div></div>`;
  }
  const legend = () => `<div class="legend">${t().labels.map((label, i) => `<span>${circles[i]} ${label}</span>`).join('')}</div>`;
  function intro() {
    const u = t();
    return `<div class="intro"><p class="lead">${u.introLead}</p><h1 id="view-heading" tabindex="-1"><small>${u.titleTop}</small><br>${u.titleLine}</h1>${legend()}<p>${u.introText}</p><button class="btn solid" id="start">${C.answered(state) ? u.resume : u.start}</button>${C.answered(state) ? `<button class="link" id="reset">${u.reset}</button>` : ''}</div>`;
  }
  function question() {
    const u = t();
    const i = state.index;
    return `<div class="qwrap"><div class="qnum" aria-hidden="true">${pad(i + 1)}<span>.</span></div><h2 class="qtext" id="view-heading" tabindex="-1">${esc(q(i))}</h2><hr class="rule"><div class="choices" role="group" aria-labelledby="view-heading">${u.labels.map((label, k) => `<button class="choice ${state.answers[i] === k + 1 ? 'on' : ''}" id="answer-${k + 1}" data-choice="${k + 1}" aria-pressed="${state.answers[i] === k + 1}"><span class="box" aria-hidden="true">${state.answers[i] === k + 1 ? '✓' : ''}</span><span>${circles[k]} ${label}</span></button>`).join('')}</div><div class="nav"><button class="link" id="previous">← ${u.previous}</button><button class="link" id="next" ${state.answers[i] ? '' : 'disabled'}>${u.next} →</button></div></div>`;
  }
  function reflectionChoices(name = 'reflection') {
    const u = t();
    return `<div class="yn">${[true, false].map((v, k) => `<button class="btn ${state.reflection === v ? 'solid' : ''}" id="${name}-${k}" data-reflection="${v}" aria-pressed="${state.reflection === v}">${v ? u.yesShort : u.noShort}</button>`).join('')}</div>`;
  }
  function reflection() {
    const u = t();
    return `<div class="qwrap"><div class="qnum final-num" aria-hidden="true">LAST<span>.</span></div><h2 class="qtext" id="view-heading" tabindex="-1">${u.reflection.replace('\n', '')}</h2><hr class="rule">${reflectionChoices()}<div class="nav"><button class="link" id="back-final">← ${u.previous}</button>${C.isComplete(state) ? `<button class="link" id="show-result">${u.resultButton} →</button>` : ''}</div>${C.answered(state) < 40 ? `<button class="link" id="continue">${format(u.missing, { n: 40 - C.answered(state) })}</button>` : ''}</div>`;
  }
  function tableRows(group) {
    const u = t();
    return state.answers.slice(group.start, group.end).map((a, k) => {
      const i = group.start + k;
      return `<div class="table-row" role="group" aria-labelledby="row-${i}"><p class="row-text" id="row-${i}"><span class="n">${pad(i + 1)}.</span><span>${esc(q(i))}</span></p>${u.labels.map((label, n) => `<label class="table-choice ${a === n + 1 ? 'selected' : ''}" for="table-${i}-${n}"><input id="table-${i}-${n}" type="radio" name="row-${i}" value="${n + 1}" data-answer="${i}" aria-label="${pad(i + 1)}. ${esc(q(i))}：${label}" ${a === n + 1 ? 'checked' : ''}><span class="small-box" aria-hidden="true">${a === n + 1 ? '✓' : ''}</span></label>`).join('')}</div>`;
    }).join('');
  }
  function sheet() {
    const u = t();
    return `<div class="sheet-content"><h1 id="view-heading" tabindex="-1" class="sheet-heading">${u.sheetHeading}</h1>${legend()}${D.groups.map((g, k) => `<section class="sheet-chapter"><div class="table-head"><span>${k + 1} / 3</span><span>1</span><span>2</span><span>3</span></div>${tableRows(g)}</section>`).join('')}<hr class="rule"><h2 class="sheet-final">${u.reflection.replace('\n', '')}</h2>${reflectionChoices('table-reflection')}<button id="show-result" class="btn solid" ${C.isComplete(state) ? '' : 'disabled'}>${u.resultButton}</button>${C.answered(state) < 40 ? `<button class="link" id="continue">${format(u.missing, { n: 40 - C.answered(state) })}</button>` : ''}<button class="link" id="reset">${u.reset}</button></div>`;
  }
  function result() {
    const u = t();
    const type = D.types[C.resultIndex(state)][state.lang];
    const counts = C.counts(state);
    const text = shareText();
    const intent = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
    return `<div class="result-content"><p class="lead result-lead">${u.resultKicker}</p><h2 id="view-heading" tabindex="-1" class="res-type">${type.name}</h2><p class="res-desc">${type.desc}</p><div class="counts">${counts.map((n, i) => `<div class="count ${i === 0 ? 'c1' : i === 1 ? 'c2' : ''}"><b>${n}</b><small>${circles[i]} ${u.shortLabels[i]}</small></div>`).join('')}</div><img class="card-img" id="card-image" alt="${u.resultAlt}" width="1200" height="1200"><div class="actions"><button id="export-summary" class="btn solid">${u.export}</button><a class="btn solid" href="${intent}" target="_blank" rel="noopener noreferrer">𝕏 ${u.post}</a><a id="share-facebook" class="btn solid" href="https://facebook.com/" target="_blank" rel="noopener noreferrer" data-platform-share aria-disabled="true">${u.postFacebook}</a><a id="share-instagram" class="btn solid" href="https://instagram.com/" target="_blank" rel="noopener noreferrer" data-platform-share aria-disabled="true">${u.postInstagram}</a><p class="platform-share-status" id="platform-share-status" role="status" hidden></p><button id="copy-result" class="link">${u.copy}</button></div><textarea id="share-text" class="share-text" aria-label="${u.shareText}">${esc(text)}</textarea><details class="export-details"><summary>${u.exportSheet}</summary><div class="export-pages">${D.groups.map((g, k) => `<div class="export-page"><img id="preview-${k}" alt="${u.savePreview} · ${format(u.sheetPage, { n: k + 1 })}" width="1500" height="2000"><button class="link" data-download="${k}">${format(u.download, { n: k + 1 })}</button></div>`).join('')}</div></details><details class="answers-details"><summary>${u.allAnswers}</summary><ol class="alist">${state.answers.map((a, i) => `<li><span class="n">${pad(i + 1)}.</span><span class="t">${esc(q(i))}</span><button class="a k${a}" data-jump="${i}" aria-label="${u.edit} ${pad(i + 1)}">${circles[a - 1]}</button></li>`).join('')}</ol></details><div class="nav"><button class="link" id="edit">← ${u.edit}</button><button class="link" id="reset">${u.reset}</button></div></div>`;
  }
  function footer() {
    const u = t();
    return `<footer class="credit">${u.credit}（<a href="${D.source}" target="_blank" rel="noopener noreferrer">@sukosuko_sukoya</a>）<br>${u.designCredit}（<a href="${D.design}" target="_blank" rel="noopener noreferrer">@air_trpg</a>）<br><a href="${D.reference}" target="_blank" rel="noopener noreferrer">${u.referenceCredit}</a></footer>`;
  }
  function render(focusId) {
    clearTimeout(advanceTimer);
    const generation = ++renderId;
    for (const url of previewUrls) URL.revokeObjectURL(url);
    previewUrls = [];
    summaryImage = null;
    const u = t();
    document.documentElement.lang = u.htmlLang;
    document.title = u.pageTitle;
    document.querySelector('meta[name="description"]').content = u.introText;
    const views = { intro, question, reflection, sheet, result };
    root.innerHTML = `<div class="wrap">${header()}<main class="sheet" id="content">${views[state.view]()}</main>${footer()}</div>`;
    document.getElementById('reset-title').textContent = u.resetTitle;
    document.getElementById('reset-description').textContent = u.resetDescription;
    document.getElementById('cancel-reset').textContent = u.cancel;
    document.getElementById('confirm-reset').textContent = u.confirm;
    bind();
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    if (state.view === 'result') {
      const snapshot = structuredClone(state);
      for (const page of [null, 0, 1, 2]) {
        createImage(snapshot, page).then(blob => {
          if (generation !== renderId) return;
          const url = URL.createObjectURL(blob);
          previewUrls.push(url);
          document.getElementById(page === null ? 'card-image' : `preview-${page}`).src = url;
          if (page === null) {
            summaryImage = blob;
            root.querySelectorAll('[data-platform-share]').forEach(link => link.removeAttribute('aria-disabled'));
          }
        }).catch(() => { if (generation === renderId) toast(t().exportFailed); });
      }
    }
  }
  function selectChoice(value) {
    const index = state.index;
    state.answers[index] = value;
    save();
    render(`answer-${value}`);
    advanceTimer = setTimeout(() => { if (state.view === 'question' && state.index === index) next(); }, 170);
  }
  function bind() {
    root.querySelectorAll('[data-lang]').forEach(button => button.onclick = () => {
      const y = scrollY;
      state.lang = button.dataset.lang;
      clearTimeout(toastTimer);
      document.getElementById('toast').classList.remove('show');
      save();
      try { const url = new URL(location.href); url.searchParams.set('lang', state.lang); history.replaceState(null, '', url); } catch { /* file previews need no history support */ }
      render(`lang-${state.lang}`);
      window.scrollTo({ top: y, behavior: 'instant' });
    });
    root.querySelectorAll('[data-jump]').forEach(button => button.onclick = () => changeView('question', Number(button.dataset.jump)));
    root.querySelectorAll('[data-choice]').forEach(button => button.onclick = () => selectChoice(Number(button.dataset.choice)));
    root.querySelectorAll('[data-answer]').forEach(input => input.onchange = () => {
      const y = scrollY;
      state.answers[Number(input.dataset.answer)] = Number(input.value);
      save();
      render(input.id);
      window.scrollTo({ top: y, behavior: 'instant' });
    });
    root.querySelectorAll('[data-reflection]').forEach(button => button.onclick = () => {
      state.reflection = button.dataset.reflection === 'true';
      if (state.view === 'reflection' && C.isComplete(state)) changeView('result');
      else { const y = scrollY; save(); render(button.id); window.scrollTo({ top: y, behavior: 'instant' }); }
    });
    const click = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    click('start', continueAnswering);
    click('continue', continueAnswering);
    click('toggle-view', () => changeView(state.view === 'sheet' ? 'question' : 'sheet', state.index));
    click('previous', () => state.index === 0 ? changeView('intro') : changeView('question', state.index - 1));
    click('next', next);
    click('back-final', () => changeView('question', 39));
    click('show-result', () => { if (C.isComplete(state)) changeView('result'); });
    click('edit', () => changeView('sheet'));
    click('reset', () => { clearTimeout(advanceTimer); document.getElementById('reset-dialog').showModal(); });
    click('export-summary', () => downloadImage(null));
    click('copy-result', copyResult);
    root.querySelectorAll('[data-platform-share]').forEach(link => link.onclick = shareToPlatform);
    root.querySelectorAll('[data-download]').forEach(button => button.onclick = () => downloadImage(Number(button.dataset.download)));
  }
  function next() {
    if (!state.answers[state.index]) return;
    changeView(state.index === 39 ? 'reflection' : 'question', state.index + 1);
  }
  document.getElementById('cancel-reset').onclick = () => document.getElementById('reset-dialog').close();
  document.getElementById('confirm-reset').onclick = () => {
    const lang = state.lang;
    state = { ...C.initialState(), lang };
    save();
    document.getElementById('reset-dialog').close();
    render('start');
  };
  document.addEventListener('keydown', event => {
    if (document.getElementById('reset-dialog').open || event.ctrlKey || event.metaKey || event.altKey || state.view !== 'question') return;
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (['1', '2', '3'].includes(event.key)) { event.preventDefault(); selectChoice(Number(event.key)); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
    else if (event.key === 'ArrowLeft' && state.index > 0) { event.preventDefault(); changeView('question', state.index - 1); }
  });
  function shareText() {
    const u = t();
    const type = D.types[C.resultIndex(state)][state.lang];
    const url = new URL(location.href);
    url.search = `?lang=${state.lang}`;
    url.hash = '';
    return [u.shareText, `【${type.name}】`, ...C.counts(state).map((n, i) => format(u.shareCount, { label: u.labels[i], n })), `${u.reflectionLabel}${state.reflection ? u.yesShort : u.noShort}`, u.footerLine, url.protocol.startsWith('http') ? url.href : 'https://liuchenhsiung.github.io/uwaki-sheet/'].join('\n');
  }
  async function copyResult() {
    const textarea = document.getElementById('share-text');
    try { await navigator.clipboard.writeText(textarea.value); toast(t().copied); }
    catch { textarea.focus(); textarea.select(); toast(t().copyFailed); }
  }
  function shareToPlatform(event) {
    if (!summaryImage) {
      event.preventDefault();
      toast(t().sharePreparing);
      return;
    }
    const u = t();
    const textarea = document.getElementById('share-text');
    const status = document.getElementById('platform-share-status');
    // Start clipboard access while this page still has focus. The anchor opens
    // the platform normally after this synchronous click handler returns.
    let copied;
    try { copied = navigator.clipboard.writeText(textarea.value).then(() => true, () => false); }
    catch { copied = Promise.resolve(false); }
    saveImageBlob(summaryImage, `uwaki-sheet-${state.lang}-result.png`);
    status.hidden = false;
    status.textContent = u.shareManual;
    copied.then(success => {
      if (!status.isConnected) return;
      status.textContent = success ? u.shareCopied : u.shareManual;
      if (!success) { textarea.focus({ preventScroll: true }); textarea.select(); }
    });
  }

  /* Export images are rendered in the browser. */
  const fontStack = lang => lang === 'ja' ? '"Zen Maru Gothic","Yu Gothic","Meiryo",sans-serif' : '"Sheet Chinese","Microsoft JhengHei","PingFang TC",sans-serif';
  function canvasText(g, text, x, y, width, fontSize, { weight = 600, color = '#ff33c4', lineHeight = 1.65, align = 'left', minSize = fontSize, maxLines = 3 } = {}) {
    let lines;
    let size = fontSize;
    do {
      g.font = `${weight} ${size}px ${g.canvas.dataset.font}`;
      lines = [];
      let line = '';
      for (const ch of String(text)) {
        if (ch === '\n') { lines.push(line); line = ''; }
        else if (line && g.measureText(line + ch).width > width) { lines.push(line); line = ch; }
        else line += ch;
      }
      if (line) lines.push(line);
      if (lines.length <= maxLines || size <= minSize) break;
      size -= 1;
    } while (true);
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'top';
    lines.forEach((line, k) => g.fillText(line, x, y + k * size * lineHeight));
    return lines.length * size * lineHeight;
  }
  function line(g, x1, y1, x2, y2, color = '#ff33c4', width = 3) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = color; g.lineWidth = width; g.stroke();
  }
  function check(g, x, y, size) {
    g.beginPath(); g.moveTo(x + size * .16, y + size * .51); g.lineTo(x + size * .4, y + size * .78); g.lineTo(x + size * .87, y + size * .15); g.strokeStyle = '#43313d'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
  }
  function drawSheet(s, page) {
    const u = D.ui[s.lang];
    const group = D.groups[page];
    const cv = document.createElement('canvas'); cv.width = 1500; cv.height = 2000; cv.dataset.font = fontStack(s.lang);
    const g = cv.getContext('2d');
    g.fillStyle = '#e4e5e8'; g.fillRect(0, 0, 1500, 2000);
    canvasText(g, '× × × ×', 72, 44, 330, 48, { weight: 700 });
    canvasText(g, '× × × ×', 1428, 44, 330, 48, { weight: 700, align: 'right' });
    g.fillStyle = '#ff33c4'; g.beginPath(); g.roundRect(490, 48, 520, 54, 27); g.fill();
    canvasText(g, `${page + 1} / 3`, 750, 59, 450, 27, { color: 'white', align: 'center', lineHeight: 1 });
    line(g, 57, 157, 57, 1860, '#ff33c4', 13); line(g, 1443, 157, 1443, 1860, '#ff33c4', 13);
    canvasText(g, u.sheetHeading, 750, 157, 1250, 65, { weight: 800, align: 'center', minSize: 54, maxLines: 1 });
    canvasText(g, `${pad(page + 1)}  ${group[s.lang]}`, 140, 263, 1200, 25, { weight: 600 });
    g.fillStyle = '#ff33c4'; g.fillRect(135, 317, 1230, 55);
    u.labels.forEach((label, k) => canvasText(g, `${k + 1}. ${label}`, [167, 490, 1030][k], 331, [300, 525, 300][k], 24, { color: 'white', weight: 700 }));
    const cols = [1120, 1215, 1310];
    cols.forEach((x, k) => canvasText(g, k + 1, x, 399, 70, 38, { align: 'center', weight: 800 }));
    const top = 465;
    const rowHeight = 96;
    for (let i = group.start; i < group.end; i++) {
      const row = i - group.start;
      const cy = top + row * rowHeight;
      canvasText(g, `${pad(i + 1)}.`, 140, cy + 5, 100, 43, { weight: 800 });
      const text = D.questions[i][s.lang === 'ja' ? 0 : 1];
      const nLines = canvasText(g, text, 247, cy + 6, 785, 27, { weight: 650, lineHeight: 1.5, minSize: 22, maxLines: 2 });
      if (nLines > rowHeight - 12) throw new Error(`Export text overflows at question ${i + 1}`);
      cols.forEach((x, k) => {
        g.strokeStyle = '#ff33c4'; g.lineWidth = 3.5; g.strokeRect(x - 24, cy + 5, 48, 48);
        if (s.answers[i] === k + 1) check(g, x - 24, cy + 5, 48);
      });
      line(g, 135, cy + rowHeight - 13, 1365, cy + rowHeight - 13, '#ff33c4', 2);
    }
    if (page === 2) {
      canvasText(g, u.reflectionLabel, 140, 1726, 1000, 30, { maxLines: 2 });
      canvasText(g, s.reflection ? u.yesShort : u.noShort, 1315, 1726, 180, 35, { align: 'right', weight: 800 });
      line(g, 135, 1790, 1365, 1790);
    }
    canvasText(g, u.footerLine, 750, 1890, 1300, 19, { align: 'center', color: '#4a2140' });
    canvasText(g, 'liuchenhsiung.github.io/uwaki-sheet', 750, 1930, 1300, 17, { align: 'center', color: '#4a2140' });
    return cv;
  }
  function drawSummary(s) {
    const u = D.ui[s.lang];
    const type = D.types[C.resultIndex(s)][s.lang];
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 1200; cv.dataset.font = fontStack(s.lang);
    const g = cv.getContext('2d');
    g.fillStyle = '#e4e5e8'; g.fillRect(0, 0, 1200, 1200);
    canvasText(g, '✕✕✕', 44, 44, 250, 52, { weight: 900 });
    canvasText(g, '✕✕✕', 1156, 44, 250, 52, { weight: 900, align: 'right' });
    g.fillStyle = '#ff33c4'; g.beginPath(); g.roundRect(300, 46, 600, 52, 26); g.fill();
    canvasText(g, 'R E S U L T', 600, 56, 550, 26, { weight: 800, color: 'white', align: 'center' });
    line(g, 49, 140, 49, 1140, '#ff33c4', 18); line(g, 1151, 140, 1151, 1140, '#ff33c4', 18);
    canvasText(g, u.pageTitle, 600, 158, 1000, 30, { align: 'center', weight: 900 });
    canvasText(g, u.resultKicker, 600, 231, 980, 34, { align: 'center', color: '#4a2140' });
    g.canvas.dataset.font = s.lang === 'ja' ? '"Dela Gothic One",sans-serif' : fontStack(s.lang);
    canvasText(g, type.name, 600, 300, 1000, 110, { weight: s.lang === 'ja' ? 400 : 900, align: 'center', minSize: 58, maxLines: 1 });
    g.canvas.dataset.font = fontStack(s.lang);
    canvasText(g, type.desc, 600, 437, 950, 27, { align: 'center', color: '#4a2140', maxLines: 2, minSize: 23, lineHeight: 1.5 });
    const counts = C.counts(s);
    counts.forEach((n, k) => {
      const x = 120 + k * 330;
      g.fillStyle = k === 0 ? '#ff33c4' : k === 1 ? '#ffc2ec' : '#e4e5e8'; g.fillRect(x, 530, 300, 170);
      g.strokeStyle = '#ff33c4'; g.lineWidth = 6; g.strokeRect(x, 530, 300, 170);
      canvasText(g, n, x + 150, 543, 280, 96, { weight: 900, color: k === 0 ? 'white' : '#ff33c4', align: 'center' });
      canvasText(g, `${circles[k]} ${u.shortLabels[k]}`, x + 150, 656, 280, 25, { weight: 900, color: k === 0 ? 'white' : '#ff33c4', align: 'center' });
    });
    for (let i = 0; i < 40; i++) {
      const x = 187 + i % 10 * 84;
      const y = 760 + Math.floor(i / 10) * 84;
      const a = s.answers[i];
      g.fillStyle = a === 1 ? '#ff33c4' : a === 2 ? '#ffc2ec' : '#e4e5e8'; g.fillRect(x, y, 70, 70);
      g.strokeStyle = '#ff33c4'; g.lineWidth = 6;
      if (a !== 1) g.strokeRect(x + 3, y + 3, 64, 64);
      canvasText(g, pad(i + 1), x + 35, y + 22, 60, 24, { weight: 900, color: a === 1 ? 'white' : '#d61fa3', align: 'center' });
    }
    line(g, 150, 1110, 1050, 1110, '#ff33c4', 4);
    canvasText(g, `${u.reflectionLabel} → ${s.reflection ? u.yesShort : u.noShort}`, 600, 1125, 980, 25, { color: '#4a2140', align: 'center' });
    canvasText(g, u.footerLine, 600, 1167, 1000, 18, { align: 'center' });
    return cv;
  }

  async function createImage(snapshot, page) {
    await Promise.all([document.fonts.load('900 30px "Zen Maru Gothic"'), document.fonts.load('400 60px "Dela Gothic One"'), document.fonts.load('900 30px "Sheet Chinese"')]);
    return new Promise((resolve, reject) => {
      try {
        const cv = page === null ? drawSummary(snapshot) : drawSheet(snapshot, page);
        cv.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')), 'image/png');
      } catch (error) { reject(error); }
    });
  }
  async function downloadImage(page) {
    const snapshot = structuredClone(state);
    try {
      const blob = await createImage(snapshot, page);
      saveImageBlob(blob, `uwaki-sheet-${snapshot.lang}-${page === null ? 'result' : `page-${page + 1}`}.png`);
      toast(t().exportDone);
    } catch (error) { console.error('Image export failed', error); toast(t().exportFailed); }
  }
  function saveImageBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  save();
  render();
})();
