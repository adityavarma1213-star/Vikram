'use strict';

const { detectNewMatches } = require('./newMatchDetector');
const email = require('./providers/email');
const push = require('./providers/push');

function deepLinkFor(symbol) {
  const base = process.env.VIKRAM_PUBLIC_URL || '';
  return `${base}/index.html#companyOverview?symbol=${encodeURIComponent(symbol)}`;
}

async function record(pool, payload) {
  try {
    await pool.query(
      `INSERT INTO alert_history
        (owner_key,scanner_id,symbol,trade_date,channel,status,error,deep_link,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [
        payload.ownerKey,
        payload.scannerId,
        payload.symbol,
        payload.tradeDate,
        payload.channel,
        payload.status,
        payload.error || null,
        payload.deepLink
      ]
    );
  } catch (error) {
    console.error('Alert history:', error.message);
  }
}

async function runAlertPipeline(pool, scannerId, matches) {
  const summary = { newMatches: 0, sent: 0, failed: 0 };
  if (!Array.isArray(matches) || matches.length === 0) return summary;

  let fresh;
  try {
    fresh = await detectNewMatches(
      pool,
      scannerId,
      matches.map(match => ({ symbol: match.symbol, tradeDate: match.tradeDate }))
    );
  } catch (error) {
    console.error('Alert dedup failed:', error.message);
    return summary;
  }

  summary.newMatches = fresh.length;
  if (!fresh.length) return summary;

  const bySymbol = new Map(matches.map(match => [match.symbol, match]));
  let preferences;
  try {
    preferences = (
      await pool.query(
        'SELECT * FROM alert_preferences WHERE scanner_id=$1 AND (email_enabled OR push_enabled)',
        [scannerId]
      )
    ).rows;
  } catch (error) {
    console.error('Alert preferences:', error.message);
    return summary;
  }

  for (const preference of preferences) {
    for (const detected of fresh) {
      const source = bySymbol.get(detected.symbol) || {};
      const match = { ...detected, ...source };
      const deepLink = deepLinkFor(match.symbol);

      if (preference.email_enabled) {
        try {
          const to = String(preference.owner_key || '').includes('@') ? preference.owner_key : null;
          const result = to
            ? await email.send({
                to,
                ...email.buildAlertEmail({
                  symbol: match.symbol,
                  verdict: match.verdict,
                  score: match.score,
                  scannerId,
                  deepLink
                })
              })
            : { status: 'FAILED', error: 'owner_key is not an email address' };

          await record(pool, {
            ownerKey: preference.owner_key,
            scannerId,
            symbol: match.symbol,
            tradeDate: match.tradeDate,
            channel: 'email',
            status: result.status,
            error: result.error,
            deepLink
          });

          if (result.status === 'SENT') summary.sent += 1;
          else summary.failed += 1;
        } catch (error) {
          await record(pool, {
            ownerKey: preference.owner_key,
            scannerId,
            symbol: match.symbol,
            tradeDate: match.tradeDate,
            channel: 'email',
            status: 'FAILED',
            error: error.message,
            deepLink
          });
          summary.failed += 1;
        }
      }

      if (preference.push_enabled) {
        let subscriptions = [];
        try {
          subscriptions = (
            await pool.query(
              'SELECT * FROM push_subscriptions WHERE owner_key=$1 AND invalidated_at IS NULL',
              [preference.owner_key]
            )
          ).rows;
        } catch (error) {
          console.error('Push subscriptions:', error.message);
        }

        for (const subscription of subscriptions) {
          try {
            const result = await push.send(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth }
              },
              push.buildAlertPayload({
                symbol: match.symbol,
                verdict: match.verdict,
                score: match.score,
                scannerId,
                deepLink
              })
            );

            await record(pool, {
              ownerKey: preference.owner_key,
              scannerId,
              symbol: match.symbol,
              tradeDate: match.tradeDate,
              channel: 'push',
              status: result.status,
              error: result.error,
              deepLink
            });

            if (result.status === 'SENT') summary.sent += 1;
            else summary.failed += 1;

            if (result.invalid) {
              await pool.query(
                'UPDATE push_subscriptions SET invalidated_at=now() WHERE id=$1',
                [subscription.id]
              );
            }
          } catch (error) {
            await record(pool, {
              ownerKey: preference.owner_key,
              scannerId,
              symbol: match.symbol,
              tradeDate: match.tradeDate,
              channel: 'push',
              status: 'FAILED',
              error: error.message,
              deepLink
            });
            summary.failed += 1;
          }
        }
      }
    }
  }

  return summary;
}

module.exports = { runAlertPipeline, deepLinkFor };
