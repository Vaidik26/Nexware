export function escHtml(s: string | null | undefined) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

export const n4 = (v: any) => (v == null || v === '' || isNaN(v) ? '-' : Number(v).toFixed(4));
export const n3 = (v: any) => (v == null || isNaN(v) ? '-' : Number(v).toFixed(3));
export const n2 = (v: any) => (v == null || isNaN(v) ? '-' : Number(v).toFixed(2));
export const pc = (v: any) => (v == null || isNaN(v) ? '-' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%');
export const qfmt = (q: any) => (q == null ? '-' : Number(q).toLocaleString(undefined, { maximumFractionDigits: 0 }));

export function effM(rmName: string, sk: any, settings: any) {
  if (settings.globalOn) return settings.globalM;
  if (sk && settings.skuM[rmName + '||' + sk.name] != null) return settings.skuM[rmName + '||' + sk.name];
  if (settings.grpM[rmName] != null) return settings.grpM[rmName];
  return sk ? Math.max(0, sk.mNow || 0) : settings.globalM;
}

export function pmax(sk: any, m: number) {
  if (!sk.q || !sk.sp) return null;
  return (sk.sp * (1 - m - sk.oh - sk.reb) - sk.pkg) / (1 + sk.loss) / sk.q;
}

export function groupCalc(r: any, settings: any) {
  const inScope = (s: any) => s.scope === 'In scope';
  const rows = r.skus
    .filter(inScope)
    .map((sk: any) => {
      const m = effM(r.name, sk, settings);
      return { sk, m, p: pmax(sk, m) };
    })
    .filter((x: any) => x.p != null)
    .sort((a: any, b: any) => a.p - b.p);

  if (!rows.length) return { rows: [], ceil: null, max: null, spread: null, bind: null, bindM: settings.globalM, headroom: null };

  const ceil = rows[0].p;
  const max = rows[rows.length - 1].p;
  
  return {
    rows,
    ceil,
    max,
    spread: ceil ? max / ceil - 1 : null,
    bind: rows[0].sk.name,
    bindM: rows[0].m,
    headroom: r.cost != null && ceil != null ? ceil - r.cost : null,
  };
}

export const MKTS: Record<string, string> = { DUBAI: 'Dubai', INT: 'International', OMAN: 'Oman' };
export const MKTS_S: Record<string, string> = { DUBAI: 'Dubai', INT: 'Intl', OMAN: 'Oman' };
export const mktName = (m: string) => MKTS[m] || m;
export const mktShort = (m: string) => MKTS_S[m] || m;

export const purOf = (r: any, m: string) => (r.pur && r.pur[m]) || null;
export const basisOf = (m: string, inco: string) => (m === 'INT' ? inco : 'LOCAL');
export const chKeyOf = (m: string, inco: string) => m + '|' + basisOf(m, inco);
export function chOf(r: any, m: string, inco: string) {
  return r.ch ? r.ch[chKeyOf(m, inco)] : null;
}

export function procName(r: any, ch: any) {
  const c = ch && ch.commodity ? String(ch.commodity).trim() : '';
  return c || r.name;
}

export function nameSrc(r: any, ch: any, m: string, inco: string) {
  const c = procName(r, ch);
  if (c === r.name) return `Purchase register item description. The ${mktName(m)} market sheet quotes it under the same name.`;
  return `Quoted as "${c}" in the ${mktName(m)} market-price workbook` + (m === 'INT' ? ' on ' + inco : '') + `. Mapped to raw material ${r.name} (${r.code}) for the MPPI target.`;
}

export function stockOf(r: any, settings: any) {
  const st = r.stock;
  if (!st) {
    return {
      days: null,
      band: 'na',
      label: 'No stock data',
      why: 'This raw material has no purchase history, so no cover can be modelled.',
    };
  }
  const d = st.days;
  const hi = settings.cover * 2;
  const band = d < settings.reorder ? 'crit' : d < settings.cover ? 'low' : d < hi ? 'ok' : 'high';
  const label = { crit: 'Below reorder', low: 'Low', ok: 'Healthy', high: 'Excess' }[band];
  return {
    days: d,
    band,
    label,
    kg: st.kg,
    use: st.use,
    lot: st.lot,
    cycle: st.cycle,
    since: st.since,
    n: st.n,
    why: `About ${qfmt(st.kg)} kg on hand at ${n2(st.use)} kg a day.`,
  };
}

export function ps(px: any, t: any, meta: any) {
  if (px == null) return { t: 'No quote', c: 'x', g: '-' };
  if (t == null || t <= 0) return { t: 'No target', c: 'x', g: '-' };
  const tol = meta.tol;
  if (px <= t * (1 - tol)) return { t: 'Under target', c: 'p', g: '▼' };
  if (px <= t * (1 + tol)) return { t: 'At target', c: 'w', g: '◆' };
  return { t: 'Above target', c: 'n', g: '▲' };
}

export function vd(px: any, t: any, band: string, meta: any) {
  const p = ps(px, t, meta);
  const low = band === 'crit';
  if (p.c === 'x') return { t: low ? 'Review' : 'No quote', c: 'x', g: p.g, ps: p };
  if (p.c !== 'n') return { t: 'Buy', c: 'p', g: p.g, ps: p };
  return low ? { t: 'Bridge buy', c: 'w', g: p.g, ps: p } : { t: 'Hold', c: 'n', g: p.g, ps: p };
}

export function deskRow(r: any, m: string, settings: any, meta: any) {
  const ch = chOf(r, m, settings.inco);
  const g = groupCalc(r, settings);
  const target = g.ceil;
  const px = ch ? ch.cur : null;
  const bench = ch ? (ch.ly != null ? ch.ly : ch.avg6) : null;
  const pl = purOf(r, m);
  const pur = pl ? pl.price : null;
  
  const purElse = r.pur ? Object.keys(r.pur).filter(k => k !== m).map(k => ({ m: k, ...r.pur[k] })) : [];
  const v = (a: any, b: any) => (a != null && b != null && b !== 0) ? a / b - 1 : null;
  const st = stockOf(r, settings);
  
  return {
    r,
    m,
    ch,
    g,
    target,
    px,
    bench,
    pur,
    pl,
    purElse,
    st,
    name: procName(r, ch),
    nameWhy: nameSrc(r, ch, m, settings.inco),
    vT: v(px, target),
    vP: v(px, pur),
    vB: v(px, bench),
    ps: ps(px, target, meta),
    verdict: vd(px, target, st.band, meta),
  };
}
