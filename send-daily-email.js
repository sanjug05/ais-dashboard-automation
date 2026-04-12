// send-daily-email.js - FINAL WORKING VERSION
// Uses Firestore REST API (no gRPC/SSL issues)

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY_EMAILJS = process.env.EMAILJS_PRIVATE_KEY;
const MANUAL_RECIPIENT = process.env.MANUAL_RECIPIENT;
const FORCE_RUN = process.env.FORCE_RUN === 'true';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ais-showroom-dashboard';
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

const DEFAULT_RECIPIENTS = [
  'sanju.gupta@aisglass.com',
 ];

const PHASES_CONFIG = [
  { id: 'dim', name: "Dimensions Submission", days: 5 },
  { id: 'cad', name: "CAD Preparation", days: 12 },
  { id: 'plan', name: "Planning & Order Loading", days: 15 },
  { id: 'civil', name: "Structure & Civil Work", days: 30 },
  { id: 'interior', name: "Interior Development", days: 50 },
  { id: 'brand', name: "Branding & Display Setup", days: 55 },
  { id: 'delivery', name: "Window Delivery", days: 65 },
  { id: 'window', name: "Window Installation", days: 80 },
  { id: 'launch', name: "Final Handover / Launch", days: 90 }
];

const STAGE_TARGETS = {
  'Interested': 0, 'Shortlisted': 3, 'CFT Selected': 8, 
  'Documentation': 15, 'Onboarded': 22
};

const DELAY_THRESHOLDS = { WARNING: 6, CRITICAL: 10 };

let reportData = {
  totalShowrooms: 0, completedShowrooms: 0, activeDelayCount: 0, criticalShowrooms: 0,
  avgCompletion: 0, globalAvgDelay: 0, totalDealers: 0, activeDealers: 0,
  completedDealers: 0, delayedDealers: 0, criticalDealers: 0, conversionRate: 0,
  totalCritical: 0, totalDelayedProjects: 0
};

function formatPrivateKey(key) {
  if (!key) return '';
  return key.replace(/\\n/g, '\n');
}

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJWT() {
  const privateKey = formatPrivateKey(FIREBASE_PRIVATE_KEY);
  
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  
  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  sign.end();
  const signature = sign.sign(privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `${signatureInput}.${signature}`;
}

async function getAccessToken() {
  const jwt = createJWT();
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  
  const data = await response.json();
  return data.access_token;
}

function parseFirestoreValue(value) {
  if (value === undefined || value === null) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return parseInt(value.integerValue);
  if (value.doubleValue !== undefined) return parseFloat(value.doubleValue);
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.nullValue !== undefined) return null;
  if (value.timestampValue !== undefined) return value.timestampValue;
  
  if (value.mapValue && value.mapValue.fields) {
    const obj = {};
    for (const [key, val] of Object.entries(value.mapValue.fields)) {
      obj[key] = parseFirestoreValue(val);
    }
    return obj;
  }
  
  if (value.arrayValue && value.arrayValue.values) {
    return value.arrayValue.values.map(v => parseFirestoreValue(v));
  }
  
  return null;
}

async function fetchCollection(collectionName) {
  try {
    console.log(`   Fetching ${collectionName}...`);
    
    const accessToken = await getAccessToken();
    
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.documents) {
      console.log(`   ✅ ${collectionName}: 0 documents`);
      return [];
    }
    
    const docs = data.documents.map(doc => {
      const result = { id: doc.name.split('/').pop() };
      if (doc.fields) {
        for (const [key, value] of Object.entries(doc.fields)) {
          result[key] = parseFirestoreValue(value);
        }
      }
      return result;
    });
    
    console.log(`   ✅ ${collectionName}: ${docs.length} documents`);
    return docs;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return [];
  }
}

function calculateShowroomStats(s) {
  if (!s?.startDate) return { pct: 0, avgDelay: 0, totalDelay: 0, maxDelay: 0, completedPhases: 0 };
  const start = new Date(s.startDate), today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(start.getTime())) return { pct: 0, avgDelay: 0, totalDelay: 0, maxDelay: 0, completedPhases: 0 };

  let comp = 0, totalDelay = 0, delayCount = 0, maxDelay = 0;
  PHASES_CONFIG.forEach(p => {
    const target = new Date(start); target.setDate(start.getDate() + p.days);
    const phaseData = s.data?.[p.id] || {};
    const actualDate = phaseData.actualDate || null;

    if (actualDate) {
      comp++;
      const actual = new Date(actualDate);
      const diff = Math.ceil((actual - target) / (1000 * 60 * 60 * 24));
      if (diff > 0) { totalDelay += diff; delayCount++; maxDelay = Math.max(maxDelay, diff); }
    } else {
      const diff = Math.ceil((today - target) / (1000 * 60 * 60 * 24));
      if (diff > 0) { totalDelay += diff; delayCount++; maxDelay = Math.max(maxDelay, diff); }
    }
  });

  return {
    pct: Math.round((comp / PHASES_CONFIG.length) * 100),
    avgDelay: delayCount > 0 ? Math.round(totalDelay / delayCount) : 0,
    totalDelay, maxDelay, completedPhases: comp
  };
}

function calculateDealerTimeline(d) {
  if (!d?.startDate) return { delayDays: 0, isDelayed: false, level: 'normal', daysElapsed: 0 };
  const start = new Date(d.startDate), today = new Date();
  const daysElapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  const currentStage = d.currentStage || 'Interested';
  const targetDays = STAGE_TARGETS[currentStage] || 0;
  const delayDays = Math.max(0, daysElapsed - targetDays);
  let level = 'normal';
  if (delayDays >= DELAY_THRESHOLDS.CRITICAL) level = 'critical';
  else if (delayDays >= DELAY_THRESHOLDS.WARNING) level = 'warning';
  return { delayDays, isDelayed: delayDays >= DELAY_THRESHOLDS.WARNING, level, daysElapsed };
}

function isDropped(dealer) {
  if (!dealer) return true;
  const f = dealer.flags || {};
  return dealer.status === 'Dropped' || f.cftRejected === true || f.prospectBackout === true;
}

function getFormattedDate() {
  const now = new Date();
  return now.toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata', 
    day: '2-digit', month: 'short', year: 'numeric', 
    hour: '2-digit', minute: '2-digit', hour12: false 
  }).replace(',', ' ·');
}

function isHoliday() {
  const today = new Date();
  const day = today.getDay();
  const date = today.getDate();
  if (day === 0) return true;
  if (day === 6) {
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstSaturday = firstDayOfMonth.getDay() === 6 ? 1 : 7 - firstDayOfMonth.getDay();
    const saturdayCount = Math.ceil((date - firstSaturday + 1) / 7);
    if (saturdayCount === 2 || saturdayCount === 4) return true;
  }
  return false;
}

function calculateReportData(showrooms, dealers) {
  reportData = { 
    totalShowrooms: 0, completedShowrooms: 0, activeDelayCount: 0, criticalShowrooms: 0,
    avgCompletion: 0, globalAvgDelay: 0, totalDealers: 0, activeDealers: 0,
    completedDealers: 0, delayedDealers: 0, criticalDealers: 0, conversionRate: 0,
    totalCritical: 0, totalDelayedProjects: 0 
  };
  
  reportData.totalShowrooms = showrooms.length;
  let totalPct = 0, totalAvgDelaySum = 0;
  for (const s of showrooms) {
    const stats = calculateShowroomStats(s);
    totalPct += stats.pct;
    if (stats.pct === 100) reportData.completedShowrooms++;
    if (stats.maxDelay > 0) { totalAvgDelaySum += stats.avgDelay; reportData.activeDelayCount++; }
    if (stats.maxDelay >= DELAY_THRESHOLDS.CRITICAL) reportData.criticalShowrooms++;
  }
  reportData.avgCompletion = reportData.totalShowrooms > 0 ? Math.round(totalPct / reportData.totalShowrooms) : 0;
  reportData.globalAvgDelay = reportData.activeDelayCount > 0 ? Math.round(totalAvgDelaySum / reportData.activeDelayCount) : 0;

  reportData.totalDealers = dealers.length;
  for (const d of dealers) {
    if (isDropped(d)) continue;
    if (d.status === 'Active') reportData.activeDealers++;
    if (d.status === 'Completed') reportData.completedDealers++;
    const tl = calculateDealerTimeline(d);
    if (tl.isDelayed) reportData.delayedDealers++;
    if (tl.level === 'critical') reportData.criticalDealers++;
  }
  const convBase = reportData.activeDealers + reportData.completedDealers;
  reportData.conversionRate = convBase > 0 ? Math.round((reportData.completedDealers / convBase) * 100) : 0;
  reportData.totalDelayedProjects = reportData.activeDelayCount + reportData.delayedDealers;
  reportData.totalCritical = reportData.criticalShowrooms + reportData.criticalDealers;

  console.log(`\n📊 Showrooms: ${reportData.totalShowrooms} total | ${reportData.completedShowrooms} completed | ${reportData.activeDelayCount} delayed`);
  console.log(`📊 Dealers: ${reportData.totalDealers} total | ${reportData.activeDealers} active | ${reportData.completedDealers} completed`);
}

function buildHtmlReport(dateStr) {
  const urgencyConfig = reportData.totalCritical > 0 
    ? { bg: '#DC2626', border: '#B91C1C', icon: '🚨', title: 'CRITICAL ACTION REQUIRED', message: `${reportData.totalCritical} project${reportData.totalCritical > 1 ? 's' : ''} critically delayed.` }
    : reportData.totalDelayedProjects > 0 
    ? { bg: '#F59E0B', border: '#D97706', icon: '⚠️', title: 'ATTENTION NEEDED', message: `${reportData.totalDelayedProjects} project${reportData.totalDelayedProjects > 1 ? 's' : ''} delayed.` }
    : { bg: '#10B981', border: '#059669', icon: '✅', title: 'ALL SYSTEMS OPERATIONAL', message: 'No delayed projects.' };

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>AIS Command Center</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;background:#EDF1F7;padding:24px}.container{max-width:680px;margin:0 auto;background:#FFF;border-radius:28px;box-shadow:0 8px 32px rgba(0,0,0,0.08);overflow:hidden;border:1px solid #E2E8F0}.header{background:linear-gradient(135deg,#0F1C2E 0%,#162438 100%);padding:28px 32px}.header span{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:700;color:#FFF}.header-title{font-family:'Syne',sans-serif;font-size:2rem;font-weight:700;color:#FFF;margin-top:8px}.header-sub{font-size:.85rem;color:rgba(255,255,255,0.5);margin-top:8px}.kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:24px}.kpi-card{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:20px;padding:20px;position:relative}.kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent,#2563EB)}.kpi-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-bottom:14px;background:var(--icon-bg,#EFF6FF);color:var(--accent,#2563EB)}.kpi-label{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748B;margin-bottom:6px}.kpi-value{font-family:'DM Mono',monospace;font-size:2.2rem;font-weight:500;color:#0F172A}.kpi-trend{font-size:.7rem;color:#64748B;margin-top:4px}.trend-up{color:#059669}.trend-warn{color:#D97706}.stats-row{display:flex;border:1px solid #E2E8F0;border-radius:12px;margin-top:16px}.stat-cell{flex:1;padding:12px 8px;text-align:center;border-right:1px solid #E2E8F0}.stat-cell:last-child{border-right:none}.stat-label{font-size:.55rem;font-weight:700;text-transform:uppercase;color:#64748B}.stat-val{font-family:'DM Mono',monospace;font-size:1.1rem;color:#0F172A}.stat-val.red{color:#DC2626}.stat-val.amber{color:#D97706}.stat-val.green{color:#059669}.urgency-banner{margin:0 24px 24px;padding:20px 24px;border-radius:20px;background:${urgencyConfig.bg};border:1px solid ${urgencyConfig.border}}.urgency-title{font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;color:#FFF;text-transform:uppercase}.urgency-stats{display:flex;gap:24px;margin-top:12px}.urgency-stat{flex:1}.urgency-stat-label{font-size:.65rem;color:rgba(255,255,255,0.7);text-transform:uppercase}.urgency-stat-value{font-family:'DM Mono',monospace;font-size:2.8rem;font-weight:700;color:#FFF}.urgency-message{margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.2);color:#FFF}.footer{background:#F8FAFC;padding:18px 24px;text-align:center;font-size:.7rem;color:#94A3B8}</style>
</head><body><div class="container">
<div class="header"><span>🏢 AIS</span><div class="header-title">Command Center</div><div class="header-sub">Daily Intelligence Report · ${dateStr}</div></div>
<div class="kpi-grid">
<div class="kpi-card" style="--accent:#2563EB;--icon-bg:#EFF6FF"><div class="kpi-icon">🏗️</div><div class="kpi-label">Showroom Execution</div><div class="kpi-value">${reportData.totalShowrooms}</div><div class="kpi-trend ${reportData.avgCompletion >= 70 ? 'trend-up' : 'trend-warn'}">${reportData.avgCompletion}% completion</div>
<div class="stats-row"><div class="stat-cell"><div class="stat-label">Completed</div><div class="stat-val green">${reportData.completedShowrooms}</div></div>
<div class="stat-cell"><div class="stat-label">Delayed</div><div class="stat-val ${reportData.activeDelayCount > 0 ? 'red' : ''}">${reportData.activeDelayCount}</div></div>
<div class="stat-cell"><div class="stat-label">Avg Delay</div><div class="stat-val ${reportData.globalAvgDelay > 0 ? 'amber' : 'green'}">${reportData.globalAvgDelay}d</div></div></div></div>
<div class="kpi-card" style="--accent:#8B5CF6;--icon-bg:#EDE9FE"><div class="kpi-icon">🚗</div><div class="kpi-label">Dealer Onboarding</div><div class="kpi-value">${reportData.totalDealers}</div><div class="kpi-trend ${reportData.conversionRate >= 50 ? 'trend-up' : 'trend-warn'}">${reportData.conversionRate}% conversion</div>
<div class="stats-row"><div class="stat-cell"><div class="stat-label">Active</div><div class="stat-val">${reportData.activeDealers}</div></div>
<div class="stat-cell"><div class="stat-label">Onboarded</div><div class="stat-val green">${reportData.completedDealers}</div></div>
<div class="stat-cell"><div class="stat-label">Delayed</div><div class="stat-val ${reportData.delayedDealers > 0 ? 'red' : ''}">${reportData.delayedDealers}</div></div></div></div></div>
<div class="urgency-banner"><div class="urgency-title">${urgencyConfig.icon} ${urgencyConfig.title}</div><div class="urgency-stats"><div class="urgency-stat"><div class="urgency-stat-label">Delayed Showrooms</div><div class="urgency-stat-value">${reportData.activeDelayCount}</div></div><div class="urgency-stat"><div class="urgency-stat-label">Delayed Dealers</div><div class="urgency-stat-value">${reportData.delayedDealers}</div></div></div><div class="urgency-message">${urgencyConfig.message}</div></div>
<div class="footer">Powered with ❤️ by <strong>Sanju G</strong> · AIS Windows Command Center<br>Automated intelligence report</div>
</div></body></html>`;
}

async function sendEmail(recipient, htmlBody, dateStr) {
  const subject = reportData.totalCritical > 0 ? `🚨 CRITICAL · AIS Command Center · ${dateStr}` 
    : reportData.totalDelayedProjects > 0 ? `⚠️ ATTENTION · AIS Command Center · ${dateStr}` 
    : `✅ AIS Command Center · ${dateStr}`;
  
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: SERVICE_ID, template_id: TEMPLATE_ID, user_id: PUBLIC_KEY, accessToken: PRIVATE_KEY_EMAILJS, template_params: { to_email: recipient, subject, date: dateStr, message: htmlBody } })
    });
    if (res.ok) { console.log(`   ✅ Sent to: ${recipient}`); return true; }
    return false;
  } catch (e) { console.error(`   ❌ Error: ${e.message}`); return false; }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     AIS COMMAND CENTER · INTELLIGENCE REPORT    ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  
  const dateStr = getFormattedDate();
  console.log(`📅 ${dateStr}`);
  
  if (!FORCE_RUN && !MANUAL_RECIPIENT && isHoliday()) { console.log('📅 Holiday. Skipping.\n'); process.exit(0); }
  if (FORCE_RUN) console.log('⚠️  FORCE_RUN enabled\n');
  
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY_EMAILJS) { console.error('❌ Missing EmailJS credentials'); process.exit(1); }
  if (!FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) { console.error('❌ Missing Firebase credentials'); process.exit(1); }
  
  console.log('📡 Fetching data via REST API...');
  const showrooms = await fetchCollection('showrooms');
  const dealers = await fetchCollection('dealerOnboarding');
  
  calculateReportData(showrooms, dealers);
  const htmlBody = buildHtmlReport(dateStr);
  
  const recipients = MANUAL_RECIPIENT?.trim() ? [MANUAL_RECIPIENT] : DEFAULT_RECIPIENTS;
  console.log(`\n📧 Sending to ${recipients.length} recipient(s)...\n`);
  
  let success = 0;
  for (const r of recipients) { if (await sendEmail(r, htmlBody, dateStr)) success++; await new Promise(r => setTimeout(r, 1000)); }
  
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   Complete: ${success}/${recipients.length} delivered                    ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
  process.exit(success === 0 ? 1 : 0);
}

main().catch(err => { console.error('\n❌ Fatal error:', err); process.exit(1); });
