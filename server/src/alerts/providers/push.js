'use strict';
let webpush=null;try{webpush=require('web-push');}catch{}
const isConfigured=()=>!!(webpush&&process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_CONTACT_EMAIL);
function configure(){if(isConfigured())webpush.setVapidDetails(`mailto:${process.env.VAPID_CONTACT_EMAIL}`,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);}
async function send(subscription,payload){if(!webpush)return{status:'FAILED',error:'web-push package is not installed.'};if(!isConfigured())return{status:'FAILED',error:'Push provider not configured.'};configure();try{await webpush.sendNotification(subscription,JSON.stringify(payload));return{status:'SENT'};}catch(e){return{status:'FAILED',error:e.message,invalid:e.statusCode===404||e.statusCode===410};}}
function buildAlertPayload({symbol,verdict,score,scannerId,deepLink}){return{title:`VIKRAM: ${symbol} matched ${scannerId}`,body:`${verdict||'New match'}${score!=null?` · score ${score}`:''}`,url:deepLink};}
module.exports={send,isConfigured,buildAlertPayload};
