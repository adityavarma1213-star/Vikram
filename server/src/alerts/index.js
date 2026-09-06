'use strict';
const {runAlertPipeline,deepLinkFor}=require('./alertEngine');
const {detectNewMatches}=require('./newMatchDetector');
const email=require('./providers/email'); const push=require('./providers/push');
module.exports={runAlertPipeline,deepLinkFor,detectNewMatches,email,push};
