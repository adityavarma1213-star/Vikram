'use strict';
const {FREQUENCY}=require('./types');
function evaluateDeduplication(candidate,previous,lastAlert,frequency,now=new Date()){if(!previous)return{shouldAlert:true,reason:'FIRST_MATCH'};if(previous.isCurrentlyMatching&&frequency===FREQUENCY.NEW_MATCH_ONLY)return{shouldAlert:false,reason:'STILL_MATCHING'};if(previous.isCurrentlyMatching&&frequency===FREQUENCY.ONCE_PER_STOCK_PER_DAY&&lastAlert){const a=new Date(lastAlert).toISOString().slice(0,10),b=new Date(now).toISOString().slice(0,10);if(a===b)return{shouldAlert:false,reason:'ALREADY_ALERTED_TODAY'};}return{shouldAlert:true,reason:'RE_ENTERED_MATCH'};}
module.exports={evaluateDeduplication};
