'use strict';
async function detectNewMatches(pool, scannerId, matches){
  if(!Array.isArray(matches)||!matches.length)return[];
  const client=await pool.connect(), out=[];
  try{await client.query('BEGIN');for(const m of matches){const q=await client.query('SELECT 1 FROM scanner_matches_seen WHERE scanner_id=$1 AND symbol=$2 AND trade_date=$3',[scannerId,m.symbol,m.tradeDate]);if(!q.rowCount){await client.query('INSERT INTO scanner_matches_seen(scanner_id,symbol,trade_date) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[scannerId,m.symbol,m.tradeDate]);out.push(m);}}await client.query('COMMIT');return out;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
module.exports={detectNewMatches};
