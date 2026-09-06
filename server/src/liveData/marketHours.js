'use strict';
const IST_OFFSET_MS=5.5*60*60*1000;
function istParts(date=new Date()){const d=new Date(date.getTime()+IST_OFFSET_MS);return{day:d.getUTCDay(),minutes:d.getUTCHours()*60+d.getUTCMinutes()};}
function isMarketOpen(date=new Date()){const {day,minutes}=istParts(date);return day>=1&&day<=5&&minutes>=555&&minutes<930;}
function statusForAvailability(quote,now=new Date(),staleMs=15000){if(!isMarketOpen(now))return 'MARKET CLOSED';if(!quote?.timestamp)return 'LIVE DATA UNAVAILABLE';const age=now-Date.parse(quote.timestamp);return age>staleMs?'LIVE DATA STALE':'LIVE';}
module.exports={istParts,isMarketOpen,statusForAvailability};
