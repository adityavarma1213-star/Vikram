(()=>{'use strict';
// HISTORY / WHY THIS FILE SHRANK: this used to also fully re-render #opportunityRadar (and a
// #hiddenGemsPreview element that no longer exists on this page) with its own simplified
// score-only table, via a MutationObserver that re-asserted itself every time the DOM changed —
// silently overwriting the canonical Opportunity Radar implementation (js/opportunityRadar.js +
// the inline script in index.html, which is unit-tested in server/test/opportunityRadar.test.js
// and now also carries real historical research evidence — see
// backtest/lib/researchIntelligence.js). That was a duplicate/competing implementation, not a
// second data source: both read the exact same data/scanner.json. The forensic integration audit
// (FORENSIC_INTEGRATION_REPORT.md) found and removed that takeover so there is exactly ONE
// Opportunity Radar implementation. This file now only keeps its other job: patching the Company
// Overview panel's score/verdict labels when the page is opened with ?symbol=XYZ, in case that
// panel rendered before the real row data was ready.
window.__VIKRAM_DISCOVERY_REPAIR__=true;
const N=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const sym=()=>String(new URLSearchParams(location.search).get('symbol')||new URLSearchParams((location.hash||'').replace(/^#/,'')).get('symbol')||'').trim().toUpperCase();
const verdictClass=v=>{v=String(v||'').toUpperCase();return v.includes('CONFIRMED')?'vd-conf':v.includes('STARTING')?'vd-start':v.includes('QUIET')?'vd-quiet':v.includes('DISTRIBUTION')?'vd-dist':'vd-mix'};
async function get(){if(window.VIKRAM_DATA_ENGINE?.loadSnapshot)return window.VIKRAM_DATA_ENGINE.loadSnapshot();const r=await fetch('data/scanner.json',{cache:'no-store'});if(!r.ok)throw Error(`SNAPSHOT_HTTP_${r.status}`);const s=await r.json();if(s.status!=='ok'||s.dataStatus!=='EOD VERIFIED')throw Error('SNAPSHOT_NOT_VERIFIED');return s}
function normalizeRows(snapshot){const map=new Map();(snapshot.results||[]).forEach(row=>{const symbol=String(row.symbol||row.ticker||'').trim().toUpperCase();if(!symbol||map.has(symbol))return;const m=row.metrics||{};map.set(symbol,{symbol,price:N(m.close??m.last_price),score:N(row.score),change:N(m.priceChangePct),volume:N(m.volumeRatio),delivery:N(m.deliveryPct),obv:N(m.obvTrend),oi:N(m.changeOi),verdict:String(row.verdict||'MIXED / UNCONFIRMED').toUpperCase(),tradeDate:row.tradeDate})});return[...map.values()]}
function repairResearch(rows){const ticker=sym();if(!ticker)return;const r=rows.find(x=>x.symbol===ticker);if(!r)return;const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v==null||v===''?'N/A':v};const lab=document.getElementById('overviewVikramScore')?.previousElementSibling;if(lab)lab.textContent='Accumulation Score';set('overviewVikramScore',r.score==null?'N/A':r.score.toFixed(1));set('overviewRating',r.verdict);['overviewVikramScore','overviewRating'].forEach(id=>{const e=document.getElementById(id);if(e)e.className=verdictClass(r.verdict)})}
async function boot(){const s=await get(),rows=normalizeRows(s);repairResearch(rows)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot().catch(()=>{}),{once:true});else boot().catch(()=>{});
})();
