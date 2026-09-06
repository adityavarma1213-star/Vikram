'use strict';
const ENDPOINT='https://api.resend.com/emails';
const isConfigured=()=>!!(process.env.RESEND_API_KEY&&process.env.ALERT_EMAIL_FROM);
async function send(message){if(!isConfigured())return{status:'FAILED',error:'Email provider not configured: RESEND_API_KEY and ALERT_EMAIL_FROM are required.'};try{const r=await fetch(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.ALERT_EMAIL_FROM,to:[message.to],subject:message.subject,html:message.html})});const b=await r.json().catch(()=>({}));return r.ok?{status:'SENT',providerId:b.id}:{status:'FAILED',error:b.message||`Resend returned ${r.status}`};}catch(e){return{status:'FAILED',error:e.message};}}
function buildAlertEmail({symbol,verdict,score,scannerId,deepLink}){return{subject:`VIKRAM Alert: ${symbol} matched ${scannerId}`,html:`<p><strong>${symbol}</strong> matched <strong>${scannerId}</strong>.</p><p>Verdict: ${verdict||'N/A'}${score!=null?` (score ${score})`:''}</p><p><a href="${deepLink}">Open in VIKRAM</a></p>`};}
module.exports={send,isConfigured,buildAlertEmail};
