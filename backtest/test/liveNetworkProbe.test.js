// LIVE NETWORK PROBE — this is NOT a synthetic test and does not use fixtures.
// It attempts one real HTTPS request to NSE's archive host and records
// exactly what happened. Per requirement #11 ("if NSE blocks access, STOP the
// real backtest and report exactly what was blocked"), this script's job is
// to produce that exact evidence — it does not pass/fail in the usual sense,
// it reports ground truth.

const { formatYmdCompact, addDays, toIstCalendarDate } = require('../lib/dateUtils');

async function probe() {
  const today = toIstCalendarDate();
  const url = `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${formatYmdCompact(addDays(today, -1))}_F_0000.csv.zip`;
  console.log(`Probing real NSE archive endpoint: ${url}`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
    const denyReason = res.headers.get('x-deny-reason');
    if (res.status === 403 && denyReason) {
      console.log(`RESULT: BLOCKED at network egress layer. HTTP ${res.status}, x-deny-reason: ${denyReason}`);
      console.log('This means the request never reached NSE — it was rejected by this execution environment\'s own egress allowlist.');
      console.log('ACTION REQUIRED: add nsearchives.nseindia.com / www.nseindia.com to network egress settings before a real download can run.');
      return { reachable: false, blockedBy: 'sandbox_egress_allowlist', httpStatus: res.status, denyReason };
    }
    const body = await res.arrayBuffer();
    console.log(`RESULT: request reached NSE. HTTP ${res.status}, ${body.byteLength} bytes received.`);
    return { reachable: true, httpStatus: res.status, bytes: body.byteLength };
  } catch (error) {
    console.log(`RESULT: request failed before receiving a response: ${error.message}`);
    return { reachable: false, blockedBy: 'network_error', error: error.message };
  }
}

if (require.main === module) {
  probe().then(result => {
    console.log(JSON.stringify(result, null, 2));
    // Exit non-zero when NSE was not actually reachable — this probe should
    // read as RED until run in an environment with real NSE egress, not green.
    process.exit(result.reachable ? 0 : 3);
  });
}

module.exports = { probe };
