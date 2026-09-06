'use strict';
const STATUS=Object.freeze({LIVE:'LIVE',LIVE_STALE:'LIVE DATA STALE',UNAVAILABLE:'LIVE DATA UNAVAILABLE',EOD:'EOD VERIFIED',CLOSED:'MARKET CLOSED'});
function numberOrNull(v){return v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);}
function normalizedQuote(input={}){return {symbol:input.symbol??null,exchange:input.exchange??'NSE',instrumentToken:input.instrumentToken??null,ltp:numberOrNull(input.ltp),previousClose:numberOrNull(input.previousClose),dayChange:numberOrNull(input.dayChange),dayChangePercent:numberOrNull(input.dayChangePercent),dayOpen:numberOrNull(input.dayOpen),dayHigh:numberOrNull(input.dayHigh),dayLow:numberOrNull(input.dayLow),volume:numberOrNull(input.volume),timestamp:input.timestamp??null,source:input.source??'UNAVAILABLE',marketStatus:input.marketStatus??STATUS.UNAVAILABLE};}
module.exports={STATUS,normalizedQuote,numberOrNull};
