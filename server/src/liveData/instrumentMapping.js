'use strict';
const { assertLiveMarketDataEnabled } = require('./gate');
class InstrumentMapping{constructor({fetchImpl=global.fetch}={}){this.fetch=fetchImpl;this.map=new Map();}load(rows=[]){for(const r of rows){const symbol=String(r.TRADING_SYMBOL||r.trading_symbol||r.symbol||'').toUpperCase();const token=r.SECURITY_ID||r.security_id||r.token;if(symbol&&token&&String(r.EXCH||r.exch||'NSE').toUpperCase()==='NSE')this.map.set(symbol,String(token));}return this;}resolve(symbol){const s=String(symbol||'').trim().toUpperCase();const token=this.map.get(s)||process.env[`INDSTOCKS_TOKEN_${s}`];return token?{symbol:s,exchange:'NSE',instrumentToken:String(token)}:null;}
  // #11 follow-up (found on re-audit): this method reaches the network independently of
  // IndstocksClient.quote() — it must be gated too, or LIVE_MARKET_DATA_ENABLED=false could be
  // bypassed simply by calling refresh() directly.
  async refresh(url=process.env.INDSTOCKS_INSTRUMENTS_URL){assertLiveMarketDataEnabled();if(!url)throw new Error('INDSTOCKS_INSTRUMENTS_URL_NOT_CONFIGURED');const r=await this.fetch(url);if(!r.ok)throw new Error(`INDSTOCKS_INSTRUMENTS_HTTP_${r.status}`);const text=await r.text();const lines=text.trim().split(/\r?\n/);if(lines.length<2)return this;const headers=lines.shift().split(',').map(x=>x.trim());return this.load(lines.map(line=>{const vals=line.split(',');return Object.fromEntries(headers.map((h,i)=>[h,vals[i]]));}));}}
module.exports={InstrumentMapping};
