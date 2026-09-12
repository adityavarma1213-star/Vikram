// Scanner table controls: text filter, column sort, pagination. Pure logic over already-loaded
// real rows — no new data source, no invented values.
(function (root, factory) {
  const impl = factory();
  if (typeof module === 'object' && module.exports) module.exports = impl;
  else root.VikramTableControls = impl;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Text filter: matches symbol or company name (case-insensitive substring). Empty query
  // matches everything.
  function filterRows(rows, query) {
    const q = String(query || '').trim().toUpperCase();
    if (!q) return rows.slice();
    return (rows || []).filter(r =>
      String(r.symbol || '').toUpperCase().includes(q) ||
      String(r.companyName || '').toUpperCase().includes(q)
    );
  }

  const SORT_ACCESSORS = {
    symbol: r => String(r.symbol || ''),
    score: r => Number(r.score) || 0,
    close: r => Number(r.metrics?.close) || 0,
    priceChangePct: r => Number(r.metrics?.priceChangePct) || 0,
    volumeRatio: r => Number(r.metrics?.volumeRatio) || 0,
    deliveryPct: r => Number(r.metrics?.deliveryPct) || 0
  };

  // Stable sort by a known column key. Unknown keys return the input order unchanged (never
  // silently sorts by a guessed field).
  function sortRows(rows, key, direction = 'desc') {
    const accessor = SORT_ACCESSORS[key];
    if (!accessor) return rows.slice();
    const withIndex = rows.map((r, i) => ({ r, i }));
    withIndex.sort((a, b) => {
      const av = accessor(a.r); const bv = accessor(b.r);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return (direction === 'asc' ? cmp : -cmp) || (a.i - b.i); // stable
    });
    return withIndex.map(x => x.r);
  }

  // Pagination: returns the slice for `page` (1-indexed) at `pageSize`, plus real page-count
  // metadata — never silently clamps to page 1 without saying so.
  function paginate(rows, page, pageSize) {
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const start = (clampedPage - 1) * pageSize;
    return {
      pageRows: rows.slice(start, start + pageSize),
      page: clampedPage,
      totalPages,
      totalRows: total,
      wasClamped: clampedPage !== page
    };
  }

  return { filterRows, sortRows, paginate, SORT_ACCESSORS };
});
