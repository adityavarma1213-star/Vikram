'use strict';
// Canonical alert engine. This directory is the single alert-engine implementation for VIKRAM;
// the former server/src/alertEngine/ duplicate has been removed (see #7 remediation) and its only
// still-used export (evaluateDeduplication) was migrated to ./deduplication.js.
const {runAlertPipeline,deepLinkFor}=require('./alertEngine');
const {detectNewMatches}=require('./newMatchDetector');
const {evaluateDeduplication}=require('./deduplication');
const {FREQUENCY,CHANNEL,STATUS}=require('./types');
const email=require('./providers/email'); const push=require('./providers/push');
module.exports={runAlertPipeline,deepLinkFor,detectNewMatches,evaluateDeduplication,FREQUENCY,CHANNEL,STATUS,email,push};
