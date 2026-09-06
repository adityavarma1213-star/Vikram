'use strict';
function num(v){return Number.isFinite(Number(v))?Number(v):null;}
function closes(history){return (history||[]).map(x=>num(x.close??x.CLOSE??x.Close)).filter(v=>v!==null);}
function sma(values,n){if(values.length<n)return null;return values.slice(-n).reduce((a,b)=>a+b,0)/n;}
function ema(values,n){if(values.length<n)return null;let e=sma(values.slice(0,n),n);const k=2/(n+1);for(let i=n;i<values.length;i++)e=values[i]*k+e*(1-k);return e;}
function rsi(values,n=14){if(values.length<=n)return null;let g=0,l=0;for(let i=1;i<=n;i++){const d=values[i]-values[i-1];if(d>0)g+=d;else l-=d;}let ag=g/n,al=l/n;for(let i=n+1;i<values.length;i++){const d=values[i]-values[i-1];ag=(ag*(n-1)+Math.max(d,0))/n;al=(al*(n-1)+Math.max(-d,0))/n;}if(al===0)return 100;return 100-100/(1+ag/al);}
function indicator(name,history){const v=closes(history);const n=Number(String(name).match(/\d+/)?.[0]||14);switch(String(name).toUpperCase()){case 'SMA':return sma(v,n);case 'EMA':return ema(v,n);case 'RSI':return rsi(v,n);default:return null;}}
module.exports={sma,ema,rsi,indicator};
