'use strict';
// #3 remediation: the previous implementation did SELECT (has this scanner_id/symbol/trade_date
// been seen?) followed by a separate INSERT. Under Postgres's default READ COMMITTED isolation,
// two concurrent runs of the ingestion/alert pipeline (e.g. a manual re-run overlapping a
// scheduled run) could both execute the SELECT before either committed the INSERT, both see "not
// seen yet", and both conclude the match was new — producing duplicate alert emails/push
// notifications for the same symbol/date. The unique constraint on scanner_matches_seen
// (scanner_id,symbol,trade_date) prevented a duplicate *row*, but did nothing to prevent both
// callers from independently believing they'd found a genuinely new match, since that decision
// was made before either row existed.
//
// Fix: replace the read-then-write check with a single atomic INSERT ... ON CONFLICT DO NOTHING
// RETURNING. Postgres serializes concurrent inserts targeting the same unique key: only the
// transaction that actually wins the row gets it back from RETURNING, so "is this new" and
// "claim it as seen" happen as one indivisible operation. There is no window where two
// concurrent callers can both observe "not seen yet".
async function detectNewMatches(pool, scannerId, matches){
  if(!Array.isArray(matches)||!matches.length)return[];
  const client=await pool.connect(), out=[];
  try{
    await client.query('BEGIN');
    for(const m of matches){
      const q=await client.query(
        'INSERT INTO scanner_matches_seen(scanner_id,symbol,trade_date) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1',
        [scannerId,m.symbol,m.tradeDate]
      );
      if(q.rowCount)out.push(m);
    }
    await client.query('COMMIT');
    return out;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
module.exports={detectNewMatches};
