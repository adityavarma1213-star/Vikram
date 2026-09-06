#!/usr/bin/env node
'use strict';

/**
 * VIKRAM Lite official-file downloader
 *
 * Downloads only exchange-published files from NSE archives.
 * No third-party market-data API is used.
 *
 * Usage:
 *   node tools/vikram-lite-downloader.js
 *   node tools/vikram-lite-downloader.js 2026-09-05
 *
 * The date must be a trading/report date in YYYY-MM-DD format.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { Readable } = require('stream');
const unzipper = require('../server/node_modules/unzipper');

const ROOT = path.resolve(__dirname, '..', 'VIKRAM DATA');
const FOLDERS = {
  bhavcopy: path.join(ROOT, 'BhavCopy'),
  delivery: path.join(ROOT, 'Delivery'),
  corporate: path.join(ROOT, 'Corporate Actions'),
  financial: path.join(ROOT, 'Financial Results'),
  shareholding: path.join(ROOT, 'Shareholding'),
  institutional: path.join(ROOT, 'MF-FII-DII'),
  highlow: path.join(ROOT, '52 Week High Low'),
  news: path.join(ROOT, 'News')
};

function ensureFolders() {
  for (const folder of Object.values(FOLDERS)) fs.mkdirSync(folder, { recursive: true });
}

function getDateArg() {
  const value = process.argv[2];
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parts(iso) {
  const [yyyy, mm, dd] = iso.split('-');
  return {
    yyyy, mm, dd,
    yyyymmdd: `${yyyy}${mm}${dd}`,
    ddmmyyyy: `${dd}${mm}${yyyy}`,
    ddmmyy: `${dd}${mm}${yyyy.slice(2)}`
  };
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'VIKRAM-Lite/1.0',
        'Accept': '*/*',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Referer': 'https://www.nseindia.com/'
      }
    }, response => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        return download(response.headers.location, destination).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }
      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(destination)));
      file.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(45000, () => request.destroy(new Error(`Timeout: ${url}`)));
  });
}

async function downloadAndExtractZip(url, zipPath, extractDir) {
  await download(url, zipPath);
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();
  fs.unlinkSync(zipPath);
}

async function tryDownload(label, url, destination, extractZip = false) {
  process.stdout.write(`- ${label}: `);
  try {
    if (extractZip) {
      const tempZip = `${destination}.zip`;
      await downloadAndExtractZip(url, tempZip, path.dirname(destination));
    } else {
      await download(url, destination);
    }
    const stat = fs.statSync(destination);
    console.log(`OK (${stat.size.toLocaleString()} bytes)`);
    return true;
  } catch (error) {
    console.log(`NOT AVAILABLE (${error.message})`);
    return false;
  }
}

async function main() {
  ensureFolders();
  const iso = getDateArg();
  const p = parts(iso);

  console.log(`\nVIKRAM Lite — official EOD downloader`);
  console.log(`Report date: ${iso}`);
  console.log(`Storage: ${ROOT}\n`);

  const nseUdiff = `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${p.yyyymmdd}_F_0000.csv.zip`;
  const nseFull = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${p.ddmmyyyy}.csv`;
  const nseHighLow = `https://nsearchives.nseindia.com/content/equities/CM_52_wk_High_low_${p.ddmmyyyy}.csv`;

  // UDiFF contains the official NSE equity bhavcopy. Keep the original CSV from the ZIP.
  await tryDownload(
    'NSE CM-UDiFF Common Bhavcopy Final',
    nseUdiff,
    path.join(FOLDERS.bhavcopy, `BhavCopy_NSE_CM_${p.yyyymmdd}_F_0000.csv`),
    true
  );

  // Full Bhavcopy + Security Deliverable data is a convenient official delivery source.
  await tryDownload(
    'NSE Full Bhavcopy and Security Deliverable data',
    nseFull,
    path.join(FOLDERS.delivery, `sec_bhavdata_full_${p.ddmmyyyy}.csv`)
  );

  await tryDownload(
    'NSE 52 Week High Low Report',
    nseHighLow,
    path.join(FOLDERS.highlow, `CM_52_wk_High_low_${p.ddmmyyyy}.csv`)
  );

  console.log('\nOfficial portals for files that require company/date selection or exchange-page access:');
  console.log('NSE All Reports : https://www.nseindia.com/all-reports');
  console.log('BSE Market Downloads : https://www.bseindia.com/markets/MarketInfo/DownloadAttach.aspx');
  console.log('NSE Corporate Actions : https://www.nseindia.com/companies-listing/corporate-filings-actions');
  console.log('NSE Shareholding : https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern');
  console.log('NSE financial filings : https://www.nseindia.com/companies-listing/corporate-filings-financial-results');
  console.log('\nNotes:');
  console.log('* A missing file normally means the selected date was a weekend/holiday or the report was not published yet.');
  console.log('* VIKRAM Lite never substitutes a third-party data source when an official file is unavailable.');
  console.log('* The NSE All Reports page currently lists CM-UDiFF Common Bhavcopy Final, Security-wise Delivery Positions, Full Bhavcopy and Security Deliverable data, and 52 Week High Low Report.');
  console.log('* BSE automation is deliberately not hard-coded to an unstable guessed URL; the official BSE download page is used instead.');
}

main().catch(error => {
  console.error(`\nVIKRAM Lite downloader failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
