// TEST FIXTURE — NOT THE REAL VIKRAM ACCUMULATION ENGINE.
// Used only to prove the reference Python bridge can invoke Node.js,
// pass JSON over stdin, and parse a JSON verdict. Its logic is arbitrary
// and has no relationship to VIKRAM scoring.

const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    console.error('FIXTURE: invalid JSON input: ' + e.message);
    process.exit(1);
  }

  const bars = input.bars_up_to_t0 || [];
  let verdict = null;
  if (bars.length >= 3) {
    const last3 = bars.slice(-3);
    const allUp = last3.every((b, i) => i === 0 || b.close > last3[i - 1].close);
    if (allUp) verdict = 'FIXTURE_TEST_VERDICT';
  }

  process.stdout.write(JSON.stringify({
    verdict,
    engine: 'TEST_FIXTURE_NOT_REAL_VIKRAM',
    bars_seen: bars.length,
  }));
});
