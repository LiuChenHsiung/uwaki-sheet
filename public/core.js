globalThis.SheetCore = (() => {
  const TOTAL = 40;
  const initialState = () => ({ version: 1, lang: 'zh', view: 'intro', index: 0, answers: Array(TOTAL).fill(0), reflection: null });
  function normalizeState(raw) {
    const base = initialState();
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return base;
    if (raw.lang === 'ja') base.lang = 'ja';
    if (Array.isArray(raw.answers) && raw.answers.length === TOTAL) base.answers = raw.answers.map(v => [1, 2, 3].includes(v) ? v : 0);
    if ([true, false].includes(raw.reflection)) base.reflection = raw.reflection;
    if (Number.isInteger(raw.index)) base.index = Math.min(TOTAL - 1, Math.max(0, raw.index));
    if (['intro', 'question', 'sheet', 'reflection', 'result'].includes(raw.view)) base.view = raw.view;
    if (base.view === 'result' && !isComplete(base)) base.view = 'intro';
    return base;
  }
  const counts = state => [1, 2, 3].map(v => state.answers.filter(a => a === v).length);
  const answered = state => state.answers.filter(v => [1, 2, 3].includes(v)).length;
  const isComplete = state => answered(state) === TOTAL && typeof state.reflection === 'boolean';
  const firstUnanswered = state => state.answers.findIndex(v => !v);
  const groupIndex = index => index < 13 ? 0 : index < 27 ? 1 : 2;
  const resultIndex = state => {
    const values = counts(state);
    const score = values[0] * 2 + values[1];
    return score <= 15 ? 0 : score <= 35 ? 1 : score <= 55 ? 2 : 3;
  };
  return { TOTAL, initialState, normalizeState, counts, answered, isComplete, firstUnanswered, groupIndex, resultIndex };
})();
