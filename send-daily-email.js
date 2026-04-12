// send-daily-email.js - FIREBASE ADMIN SDK VERSION
// Requires service account for authenticated access

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const MANUAL_RECIPIENT = process.env.MANUAL_RECIPIENT;

// Path to your service account JSON file
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || './service-account.json';

const DEFAULT_RECIPIENTS = [
  'sanju.gupta@aisglass.com',
  'mayank.tomar@aisglass.com',
  'krishna.verma@aisglass.com',
  'nidhi.tiwari@aisglass.com'
];

// Exact match with dashboard PHASES_CONFIG (v2.2)
const PHASES_CONFIG = [
  { id: 'dim',      name: "Dimensions Submission",    days: 5  },
  { id: 'cad',      name: "CAD Preparation",           days: 12 },
  { id: 'plan',     name: "Planning & Order Loading",  days: 15 },
  { id: 'civil',    name: "Structure & Civil Work",    days: 30 },
  { id: 'interior', name: "Interior Development",      days: 50 },
  { id: 'brand',    name: "Branding & Display Setup",  days: 55 },
  { id: 'delivery', name: "Window Delivery",           days: 65 },
  { id: 'window',   name: "Window Installation",       days: 80 },
  { id: 'launch',   name: "Final Handover / Launch",   days: 90 }
];

const STAGE_TARGETS = {
  'Interested': 0,
  'Shortlisted': 3,
  'CFT Selected': 8,
  'Documentation': 15,
  'Onboarded': 22
};

const DELAY_THRESHOLDS = {
  WARNING: 6,
  CRITICAL: 10
};

// Global report data
let reportData = {
  totalShowrooms: 0,
  completedShowrooms: 0,
  activeDelayCount: 0,
  criticalShowrooms: 0,
  avgCompletion: 0,
  globalAvgDelay: 0,
  totalDealers: 0,
  activeDealers: 0,
  completedDealers: 0,
  delayedDealers: 0,
  criticalDealers: 0,
  conversionRate: 0,
  totalCritical: 0,
  totalDelayedProjects: 0
};

let db = null;

// Initialize Firebase Admin
async function initFirebase() {
  try {
    // Try to read service account file
    const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    
    initializeApp({
      credential: cert(serviceAccount),
      projectId: 'ais-showroom-dashboard'
    });
    
    db = getFirestore();
    console.log('✅ Firebase Admin initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.log('\n📋 To fix this:');
    console.log('1. Go to Firebase Console > Project Settings > Service Accounts');
    console.log('2. Click "Generate New Private Key"');
    console.log('3. Save the JSON file as "service-account.json" in this directory');
    console.log('4. Or set SERVICE_ACCOUNT_PATH environment variable\n');
    return false;
  }
}

// Fetch collection using Admin SDK
async function fetchCollection(collectionName) {
  if (!db) {
    console.error(`   ❌ Database not initialized`);
    return [];
  }
  
  try {
    console.log(`   Fetching: ${collectionName}...`);
    const snapshot = await db.collection(collectionName).get();
    
    const docs = [];
    snapshot.forEach(doc => {
      docs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`   ✅ ${collectionName}: ${docs.length} documents`);
    return docs;
  } catch (error) {
    console.error(`   ❌ Error fetching ${collectionName}:`, error.message);
    return [];
  }
}

function calculateShowroomStats(s) {
  if (!s || !s.startDate) {
    return { pct: 0, avgDelay: 0, totalDelay: 0, maxDelay: 0, completedPhases: 0 };
  }
  
  const start = new Date(s.startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (isNaN(start.getTime())) {
    return { pct: 0, avgDelay: 0, totalDelay: 0, maxDelay: 0, completedPhases: 0 };
  }

  let comp = 0, totalDelay = 0, delayCount = 0, maxDelay = 0;

  PHASES_CONFIG.forEach(p => {
    const target = new Date(start);
    target.setDate(start.getDate() + p.days);
    
    const phaseData = (s.data && s.data[p.id]) ? s.data[p.id] : {};
    const actualDate = phaseData.actualDate || null;

    if (actualDate) {
      comp++;
      const actual = new Date(actualDate);
      const diff = Math.ceil((actual - target) / (1000 * 60 * 60 * 24));
      if (diff > 0) {
        totalDelay += diff;
        delayCount++;
        maxDelay = Math.max(maxDelay, diff);
      }
    } else {
      const diff = Math.ceil((today - target) / (1000 * 60 * 60 * 24));
      if (diff > 0) {
        totalDelay += diff;
        delayCount++;
        maxDelay = Math.max(maxDelay, diff);
      }
    }
  });
  
  return {
    pct: Math.round((comp / PHASES_CONFIG.length) * 100),
    avgDelay: delayCount > 0 ? Math.round(totalDelay / delayCount) : 0,
    totalDelay,
    maxDelay,
    completedPhases: comp
  };
}

function calculateDealerTimeline(d) {
  if (!d || !d.startDate) {
    return { delayDays: 0, isDelayed: false, level: 'normal', daysElapsed: 0 };
  }
  
  const start = new Date(d.startDate);
  const today = new Date();
  const daysElapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  
  const currentStage = d.currentStage || 'Interested';
  const targetDays = STAGE_TARGETS[currentStage] || 0;
  const delayDays = Math.max(0, daysElapsed - targetDays);
  
  let level = 'normal';
  if (delayDays >= DELAY_THRESHOLDS.CRITICAL) level = 'critical';
  else if (delayDays >= DELAY_THRESHOLDS.WARNING) level = 'warning';
  
  return {
    delayDays,
    isDelayed: delayDays >= DELAY_THRESHOLDS.WARNING,
    level,
    daysElapsed
  };
}

function isDropped(dealer) {
  if (!dealer) return true;
  const f = dealer.flags || {};
  return dealer.status === 'Dropped' || f.cftRejected === true || f.prospectBackout === true;
}

function getFormattedDate() {
  const now = new Date();
  const options = {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  return now.toLocaleString('en-IN', options).replace(',', ' ·');
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
  // Reset report data
  reportData = {
    totalShowrooms: 0,
    completedShowrooms: 0,
    activeDelayCount: 0,
    criticalShowrooms: 0,
    avgCompletion: 0,
    globalAvgDelay: 0,
    totalDealers: 0,
    activeDealers: 0,
    completedDealers: 0,
    delayedDealers: 0,
    criticalDealers: 0,
    conversionRate: 0,
    totalCritical: 0,
    totalDelayedProjects: 0
  };
  
  // Showroom stats
  reportData.totalShowrooms = showrooms.length;
  let totalPct = 0;
  let totalAvgDelaySum = 0;
  
  for (const showroom of showrooms) {
    const stats = calculateShowroomStats(showroom);
    totalPct += stats.pct;
    if (stats.pct === 100) reportData.completedShowrooms++;
    if (stats.maxDelay > 0) {
      totalAvgDelaySum += stats.avgDelay;
      reportData.activeDelayCount++;
    }
    if (stats.maxDelay >= DELAY_THRESHOLDS.CRITICAL) reportData.criticalShowrooms++;
  }
  
  reportData.avgCompletion = reportData.totalShowrooms > 0 ? Math.round(totalPct / reportData.totalShowrooms) : 0;
  reportData.globalAvgDelay = reportData.activeDelayCount > 0 ? Math.round(totalAvgDelaySum / reportData.activeDelayCount) : 0;
  
  // Dealer stats
  reportData.totalDealers = dealers.length;
  
  for (const dealer of dealers) {
    if (isDropped(dealer)) continue;
    
    if (dealer.status === 'Active') reportData.activeDealers++;
    if (dealer.status === 'Completed') reportData.completedDealers++;
    
    const timeline = calculateDealerTimeline(dealer);
    if (timeline.isDelayed) reportData.delayedDealers++;
    if (timeline.level === 'critical') reportData.criticalDealers++;
  }
  
  const conversionBase = reportData.activeDealers + reportData.completedDealers;
  reportData.conversionRate = conversionBase > 0 ? Math.round((reportData.completedDealers / conversionBase) * 100) : 0;
  
  reportData.totalDelayedProjects = reportData.activeDelayCount + reportData.delayedDealers;
  reportData.totalCritical = reportData.criticalShowrooms + reportData.criticalDealers;
  
  console.log(`\n📊 REPORT SUMMARY:`);
  console.log(`   Showrooms: ${reportData.totalShowrooms} total | ${reportData.completedShowrooms} completed | ${reportData.activeDelayCount} delayed | ${reportData.criticalShowrooms} critical`);
  console.log(`   Dealers:   ${reportData.totalDealers} total | ${reportData.activeDealers} active | ${reportData.completedDealers} completed | ${reportData.delayedDealers} delayed | ${reportData.criticalDealers} critical`);
  console.log(`   Metrics:   ${reportData.avgCompletion}% avg completion | ${reportData.globalAvgDelay}d avg delay | ${reportData.conversionRate}% conversion\n`);
}

function buildHtmlReport(dateStr) {
  const urgencyConfig = reportData.totalCritical > 0 
    ? { bg: '#DC2626', border: '#B91C1C', icon: '🚨', title: 'CRITICAL ACTION REQUIRED', message: `${reportData.totalCritical} project${reportData.totalCritical > 1 ? 's' : ''} critically delayed (10+ days). Immediate escalation required.` }
    : reportData.totalDelayedProjects > 0 
    ? { bg: '#F59E0B', border: '#D97706', icon: '⚠️', title: 'ATTENTION NEEDED', message: `${reportData.totalDelayedProjects} project${reportData.totalDelayedProjects > 1 ? 's' : ''} delayed. Review dashboard for details.` }
    : { bg: '#10B981', border: '#059669', icon: '✅', title: 'ALL SYSTEMS OPERATIONAL', message: 'No delayed projects. All showrooms and dealers on track.' };
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>AIS Command Center · Daily Intelligence</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #EDF1F7;
      -webkit-font-smoothing: antialiased;
      padding: 24px;
    }
    .container {
      max-width: 680px;
      margin: 0 auto;
      background: #FFFFFF;
      border-radius: 28px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
      overflow: hidden;
      border: 1px solid #E2E8F0;
    }
    .header {
      background: linear-gradient(135deg, #0F1C2E 0%, #162438 100%);
      padding: 28px 32px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .header-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .header-logo span {
      font-family: 'Syne', sans-serif;
      font-size: 1.4rem;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: -0.02em;
    }
    .header-title {
      font-family: 'Syne', sans-serif;
      font-size: 2rem;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .header-sub {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.5);
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding: 24px;
    }
    .kpi-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 20px;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--accent, #2563EB);
    }
    .kpi-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      margin-bottom: 14px;
      background: var(--icon-bg, #EFF6FF);
      color: var(--accent, #2563EB);
    }
    .kpi-label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748B;
      margin-bottom: 6px;
    }
    .kpi-value {
      font-family: 'DM Mono', monospace;
      font-size: 2.2rem;
      font-weight: 500;
      color: #0F172A;
      line-height: 1;
      margin-bottom: 6px;
    }
    .kpi-trend {
      font-size: 0.7rem;
      display: flex;
      align-items: center;
      gap: 4px;
      color: #64748B;
      font-weight: 500;
    }
    .trend-up { color: #059669; }
    .trend-warn { color: #D97706; }
    .stats-row {
      display: flex;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      overflow: hidden;
      margin-top: 16px;
    }
    .stat-cell {
      flex: 1;
      padding: 12px 8px;
      text-align: center;
      border-right: 1px solid #E2E8F0;
    }
    .stat-cell:last-child { border-right: none; }
    .stat-label {
      font-size: 0.55rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748B;
      margin-bottom: 4px;
    }
    .stat-val {
      font-family: 'DM Mono', monospace;
      font-size: 1.1rem;
      font-weight: 500;
      color: #0F172A;
    }
    .stat-val.red { color: #DC2626; }
    .stat-val.amber { color: #D97706; }
    .stat-val.green { color: #059669; }
    .urgency-banner {
      margin: 0 24px 24px;
      padding: 20px 24px;
      border-radius: 20px;
      background: ${urgencyConfig.bg};
      border: 1px solid ${urgencyConfig.border};
    }
    .urgency-title {
      font-family: 'Syne', sans-serif;
      font-size: 1rem;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .urgency-stats {
      display: flex;
      gap: 24px;
    }
    .urgency-stat {
      flex: 1;
    }
    .urgency-stat-label {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.7);
      margin-bottom: 4px;
    }
    .urgency-stat-value {
      font-family: 'DM Mono', monospace;
      font-size: 2.8rem;
      font-weight: 700;
      color: #FFFFFF;
      line-height: 1;
    }
    .urgency-message {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.2);
      font-size: 0.85rem;
      color: #FFFFFF;
      font-weight: 500;
    }
    .footer {
      background: #F8FAFC;
      padding: 18px 24px;
      text-align: center;
      font-size: 0.7rem;
      color: #94A3B8;
      border-top: 1px solid #E2E8F0;
    }
    .footer strong { color: #2563EB; font-weight: 700; }
    @media (max-width: 480px) {
      body { padding: 12px; }
      .kpi-grid { grid-template-columns: 1fr; padding: 16px; }
      .header { padding: 20px; }
      .header-title { font-size: 1.5rem; }
      .urgency-banner { margin: 0 16px 16px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-logo"><span>🏢 AIS</span></div>
      <div class="header-title">Command Center</div>
      <div class="header-sub">
        <span>Daily Intelligence Report</span>
        <i>·</i>
        <span>${dateStr}</span>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card" style="--accent: #2563EB; --icon-bg: #EFF6FF;">
        <div class="kpi-icon">🏗️</div>
        <div class="kpi-label">Showroom Execution</div>
        <div class="kpi-value">${reportData.totalShowrooms}</div>
        <div class="kpi-trend ${reportData.avgCompletion >= 70 ? 'trend-up' : 'trend-warn'}">
          ${reportData.avgCompletion >= 70 ? '▲' : '▼'} ${reportData.avgCompletion}% completion
        </div>
        <div class="stats-row">
          <div class="stat-cell"><div class="stat-label">Completed</div><div class="stat-val green">${reportData.completedShowrooms}</div></div>
          <div class="stat-cell"><div class="stat-label">Delayed</div><div class="stat-val ${reportData.activeDelayCount > 0 ? 'red' : ''}">${reportData.activeDelayCount}</div></div>
          <div class="stat-cell"><div class="stat-label">Avg Delay</div><div class="stat-val ${reportData.globalAvgDelay > 0 ? 'amber' : 'green'}">${reportData.globalAvgDelay}d</div></div>
        </div>
      </div>
      <div class="kpi-card" style="--accent: #8B5CF6; --icon-bg: #EDE9FE;">
        <div class="kpi-icon">🚗</div>
        <div class="kpi-label">Dealer Onboarding</div>
        <div class="kpi-value">${reportData.totalDealers}</div>
        <div class="kpi-trend ${reportData.conversionRate >= 50 ? 'trend-up' : 'trend-warn'}">
          ${reportData.conversionRate}% conversion
        </div>
        <div class="stats-row">
          <div class="stat-cell"><div class="stat-label">Active</div><div class="stat-val">${reportData.activeDealers}</div></div>
          <div class="stat-cell"><div class="stat-label">Onboarded</div><div class="stat-val green">${reportData.completedDealers}</div></div>
          <div class="stat-cell"><div class="stat-label">Delayed</div><div class="stat-val ${reportData.delayedDealers > 0 ? 'red' : ''}">${reportData.delayedDealers}</div></div>
        </div>
      </div>
    </div>
    <div class="urgency-banner">
      <div class="urgency-title">${urgencyConfig.icon} ${urgencyConfig.title}</div>
      <div class="urgency-stats">
        <div class="urgency-stat"><div class="urgency-stat-label">Delayed Showrooms</div><div class="urgency-stat-value">${reportData.activeDelayCount}</div></div>
        <div class="urgency-stat"><div class="urgency-stat-label">Delayed Dealers</div><div class="urgency-stat-value">${reportData.delayedDealers}</div></div>
      </div>
      <div class="urgency-message">${urgencyConfig.message}</div>
    </div>
    <div class="footer">
      Powered with ❤️ by <strong>Sanju G</strong> · AIS Windows Command Center v2.2<br>
      Automated intelligence report · Data refreshes continuously
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(recipient, htmlBody, dateStr) {
  const subject = reportData.totalCritical > 0 
    ? `🚨 CRITICAL · AIS Command Center · ${dateStr}`
    : reportData.totalDelayedProjects > 0
    ? `⚠️ ATTENTION · AIS Command Center · ${dateStr}`
    : `✅ AIS Command Center · ${dateStr}`;
  
  const templateParams = {
    to_email: recipient,
    subject: subject,
    date: dateStr,
    message: htmlBody
  };

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        accessToken: PRIVATE_KEY,
        template_params: templateParams
      })
    });

    if (response.ok) {
      console.log(`   ✅ Sent to: ${recipient}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`   ❌ Failed: ${recipient} - ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${recipient} - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     AIS COMMAND CENTER · INTELLIGENCE REPORT    ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  
  const dateStr = getFormattedDate();
  console.log(`📅 ${dateStr}`);
  
  if (!MANUAL_RECIPIENT && isHoliday()) {
    console.log('📅 Holiday detected. Skipping report.');
    process.exit(0);
  }
  
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    console.error('❌ Missing EmailJS credentials');
    process.exit(1);
  }
  
  // Initialize Firebase
  const initialized = await initFirebase();
  if (!initialized) {
    process.exit(1);
  }
  
  console.log('\n📡 Fetching Firestore data...');
  
  const showrooms = await fetchCollection('showrooms');
  const dealers = await fetchCollection('dealerOnboarding');
  
  // Debug output
  if (showrooms.length > 0) {
    console.log(`\n📋 Sample Showroom:`);
    console.log(`   Name: ${showrooms[0].name}`);
    console.log(`   Has data field: ${!!showrooms[0].data}`);
  }
  
  if (dealers.length > 0) {
    console.log(`\n📋 Sample Dealer:`);
    console.log(`   Name: ${dealers[0].name}`);
    console.log(`   Status: ${dealers[0].status}`);
  }
  
  calculateReportData(showrooms, dealers);
  
  const htmlBody = buildHtmlReport(dateStr);
  
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`\n📧 Sending to ${recipients.length} recipient(s)...\n`);
  
  let successCount = 0;
  for (const recipient of recipients) {
    const success = await sendEmail(recipient, htmlBody, dateStr);
    if (success) successCount++;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   Report Complete: ${successCount}/${recipients.length} delivered           ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
  
  process.exit(successCount === 0 ? 1 : 0);
}

main().catch(err => { 
  console.error('\n❌ Fatal error:', err); 
  process.exit(1); 
});
