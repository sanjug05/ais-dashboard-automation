// send-daily-email.js
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const MANUAL_RECIPIENT = process.env.MANUAL_RECIPIENT;

const DEFAULT_RECIPIENTS = [
  'sanju.gupta@aisglass.com',
  'mayank.tomar@aisglass.com',
  'krishna.verma@aisglass.com',
  'nidhi.tiwari@aisglass.com'
];

// Firestore REST API endpoint (not Realtime Database)
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/ais-showroom-dashboard/databases/(default)/documents';

// Helper to fetch Firestore collection
async function fetchCollection(collectionName) {
  try {
    const response = await fetch(`${FIRESTORE_URL}/${collectionName}`);
    const data = await response.json();
    
    if (!data.documents) return [];
    
    // Parse Firestore document format
    return data.documents.map(doc => {
      const fields = doc.fields;
      const result = { id: doc.name.split('/').pop() };
      
      // Convert Firestore fields to JavaScript values
      for (const [key, value] of Object.entries(fields)) {
        if (value.stringValue !== undefined) result[key] = value.stringValue;
        else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue);
        else if (value.doubleValue !== undefined) result[key] = parseFloat(value.doubleValue);
        else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
        else if (value.mapValue !== undefined) {
          // Handle nested objects (like data, documents, stageLog, flags)
          const nestedObj = {};
          if (value.mapValue.fields) {
            for (const [nestedKey, nestedValue] of Object.entries(value.mapValue.fields)) {
              if (nestedValue.stringValue !== undefined) nestedObj[nestedKey] = nestedValue.stringValue;
              else if (nestedValue.booleanValue !== undefined) nestedObj[nestedKey] = nestedValue.booleanValue;
              else if (nestedValue.mapValue !== undefined) {
                // Deep nested (for phase data)
                const deepObj = {};
                if (nestedValue.mapValue.fields) {
                  for (const [deepKey, deepValue] of Object.entries(nestedValue.mapValue.fields)) {
                    if (deepValue.stringValue !== undefined) deepObj[deepKey] = deepValue.stringValue;
                  }
                }
                nestedObj[nestedKey] = deepObj;
              }
            }
          }
          result[key] = nestedObj;
        }
        else if (value.arrayValue !== undefined) result[key] = value.arrayValue.values || [];
        else if (value.nullValue !== undefined) result[key] = null;
      }
      return result;
    });
  } catch (error) {
    console.error(`Error fetching ${collectionName}:`, error.message);
    return [];
  }
}

// EXACT Phase Configuration from your dashboard
const PHASES_CONFIG = [
  { id: 'dim',      name: "Dimensions Submission",         days: 5  },
  { id: 'cad',      name: "CAD Preparation",                days: 12 },
  { id: 'plan',     name: "Planning & Order Loading",       days: 15 },
  { id: 'civil',    name: "Structure & Civil Work",         days: 30 },
  { id: 'interior', name: "Interior Development",           days: 50 },
  { id: 'brand',    name: "Branding & Display Setup",       days: 65 },
  { id: 'window',   name: "Window Installation",            days: 85 },
  { id: 'launch',   name: "Final Handover / Launch",        days: 90 }
];

// Dealer stages
const STAGE_TARGETS = {
  'Interested': 0,
  'Shortlisted': 3,
  'CFT Selected': 8,
  'Documentation': 15,
  'Onboarded': 22
};

// EXACT calculateShowroomStats from your dashboard
function calculateShowroomStats(s) {
  if (!s || !s.startDate) return { pct: 0, avgDelay: 0 };
  const start = new Date(s.startDate + "T00:00:00");
  const today = new Date(); 
  today.setHours(0,0,0,0);
  let totalDelay = 0, comp = 0, delayCount = 0;

  if (isNaN(start.getTime())) return { pct: 0, avgDelay: 0 };

  PHASES_CONFIG.forEach(p => {
    const target = new Date(start);
    target.setDate(start.getDate() + p.days);

    const data = (s.data && s.data[p.id]) || {};
    if (data.actualDate) {
      comp++;
      const actual = new Date(data.actualDate + "T00:00:00");
      const d = Math.ceil((actual - target) / 86400000);
      if (d > 0) {
        totalDelay += d;
        delayCount++;
      }
    } else {
      const d = Math.ceil((today - target) / 86400000);
      if (d > 0) {
        totalDelay += d;
        delayCount++;
      }
    }
  });
  
  const avgDelay = delayCount > 0 ? Math.round(totalDelay / delayCount) : 0;
  const pct = Math.round((comp / PHASES_CONFIG.length) * 100);
  
  return { pct, avgDelay };
}

// Check if dealer is dropped
function isDropped(dealer) {
  const f = dealer.flags || {};
  return dealer.status === 'Dropped' || f.cftRejected === true || f.prospectBackout === true;
}

// Calculate dealer delay
function calculateDealerTimeline(d) {
  if (!d.startDate) return { isDelayed: false, delayDays: 0 };
  
  const start = new Date(d.startDate);
  const today = new Date();
  const daysElapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  
  const currentStage = d.currentStage || 'Interested';
  const targetDays = STAGE_TARGETS[currentStage] || 0;
  const delayDays = Math.max(0, daysElapsed - targetDays);
  const isDelayed = delayDays > 3;
  
  return { isDelayed, delayDays };
}

// Get formatted date in IST
function getFormattedDate() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istTime.getUTCDate()).padStart(2, '0');
  const hours = String(istTime.getUTCHours()).padStart(2, '0');
  const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istTime.getUTCSeconds()).padStart(2, '0');
  
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} IST`;
}

// Check holiday
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

// Build HTML email
// Build HTML email - BEAUTIFUL VERSION
function buildHtmlReport(showrooms, dealers, dateStr) {
  let totalShowrooms = showrooms.length;
  let totalPct = 0;
  let completedShowrooms = 0;
  let activeDelayCount = 0;
  let totalAvgDelay = 0;
  
  for (const showroom of showrooms) {
    const stats = calculateShowroomStats(showroom);
    totalPct += stats.pct;
    if (stats.pct === 100) completedShowrooms++;
    if (stats.avgDelay > 0) {
      totalAvgDelay += stats.avgDelay;
      activeDelayCount++;
    }
  }
  
  const avgCompletion = totalShowrooms > 0 ? Math.round(totalPct / totalShowrooms) : 0;
  const globalAvgDelay = activeDelayCount > 0 ? Math.round(totalAvgDelay / activeDelayCount) : 0;
  
  let totalDealers = dealers.length;
  let activeDealers = 0;
  let completedDealers = 0;
  let delayedDealers = 0;
  
  for (const dealer of dealers) {
    if (dealer.status === 'Completed') {
      completedDealers++;
    } else if (!isDropped(dealer) && dealer.status === 'Active') {
      activeDealers++;
    }
    
    const timeline = calculateDealerTimeline(dealer);
    if (timeline.isDelayed) delayedDealers++;
  }
  
  let delayedMessage = '';
  if (globalAvgDelay > 0 || delayedDealers > 0) {
    delayedMessage = `⚠️ ${globalAvgDelay > 0 ? globalAvgDelay + ' showroomday(s)' : ''}${globalAvgDelay > 0 && delayedDealers > 0 ? ' and ' : ''}${delayedDealers > 0 ? delayedDealers + ' dealer(s)' : ''} are currently delayed. Please review the dashboard for details.`;
  } else {
    delayedMessage = '✅ No delayed projects at this time. All showrooms and dealers are on track! 🎉';
  }
  
  console.log(`📊 Showrooms: ${totalShowrooms} total, ${completedShowrooms} completed, Avg Delay: ${globalAvgDelay}`);
  console.log(`📊 Dealers: ${totalDealers} total, ${completedDealers} completed, ${delayedDealers} delayed`);
  
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIS Dashboard Report</title>
<style>
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f0f2f5;
  }
  .container {
    max-width: 700px;
    margin: 20px auto;
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .header {
    background: linear-gradient(135deg, #0054A6 0%, #003d7a 100%);
    padding: 30px;
    text-align: center;
  }
  .header h1 {
    color: #ffffff;
    margin: 0;
    font-size: 24px;
  }
  .header p {
    color: rgba(255,255,255,0.9);
    margin: 8px 0 0;
    font-size: 13px;
  }
  .content {
    padding: 30px;
  }
  .date-badge {
    background: #e8f0fe;
    padding: 12px;
    text-align: center;
    border-radius: 8px;
    margin-bottom: 25px;
  }
  .section {
    margin-bottom: 30px;
  }
  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: #0054A6;
    margin-bottom: 15px;
    padding-bottom: 8px;
    border-bottom: 2px solid #e0e0e0;
  }
  .stats-grid {
    display: flex;
    justify-content: space-around;
    flex-wrap: wrap;
    gap: 15px;
    background: #f8f9fa;
    padding: 20px;
    border-radius: 12px;
  }
  .stat-card {
    text-align: center;
    flex: 1;
    min-width: 100px;
  }
  .stat-number {
    font-size: 32px;
    font-weight: 800;
    color: #C6A43B;
  }
  .stat-label {
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .delayed-box {
    background: #fce8e6;
    padding: 15px;
    border-radius: 8px;
    border-left: 4px solid #e74c3c;
  }
  .footer {
    background: #f8f9fa;
    padding: 20px;
    text-align: center;
    font-size: 11px;
    color: #888;
    border-top: 1px solid #e0e0e0;
  }
  @media (max-width: 500px) {
    .stats-grid { flex-direction: column; }
    .content { padding: 20px; }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 AIS Command Center</h1>
      <p>Daily Intelligence Report</p>
    </div>
    <div class="content">
      <div class="date-badge">
        📅 <strong>${dateStr}</strong>
      </div>

      <div class="section">
        <div class="section-title">🏢 Showroom Performance</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">${totalShowrooms}</div>
            <div class="stat-label">Total Showrooms</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${completedShowrooms}</div>
            <div class="stat-label">Completed</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${avgCompletion}%</div>
            <div class="stat-label">Avg Completion</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${globalAvgDelay}</div>
            <div class="stat-label">Avg Delay (Days)</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">👥 Dealer Onboarding</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">${totalDealers}</div>
            <div class="stat-label">Total Dealers</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${activeDealers}</div>
            <div class="stat-label">Active</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${completedDealers}</div>
            <div class="stat-label">Onboarded</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${delayedDealers}</div>
            <div class="stat-label">Delayed</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">⚠️ Delayed Projects</div>
        <div class="delayed-box">
          ${delayedMessage}
        </div>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated report from AIS Command Center</p>
      <p>© 2026 AIS Windows | All Rights Reserved</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Send email
async function sendEmail(recipient, htmlBody, dateStr) {
  const templateParams = {
    to_email: recipient,
    subject: `📊 AIS Dashboard Report - ${dateStr}`,
    date: dateStr,
    message: htmlBody
  };

  console.log(`📧 Sending to: ${recipient}`);

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
      console.log(`✅ Success: ${recipient}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed: ${recipient} - ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error: ${recipient} - ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  console.log('🚀 Starting dashboard email report...');
  const dateStr = getFormattedDate();
  console.log(`Time: ${dateStr}`);
  
  if (!MANUAL_RECIPIENT && isHoliday()) {
    console.log('📅 Today is a holiday. Skipping automated email report.');
    process.exit(0);
  }
  
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    console.error('❌ Missing EmailJS credentials!');
    process.exit(1);
  }
  
  console.log('✅ EmailJS credentials found');
  
  console.log('📡 Fetching showrooms from Firestore...');
  const showrooms = await fetchCollection('showrooms');
  console.log(`📡 Found ${showrooms.length} showrooms`);
  
  console.log('📡 Fetching dealers from Firestore...');
  const dealers = await fetchCollection('dealerOnboarding');
  console.log(`📡 Found ${dealers.length} dealers`);
  
  const htmlBody = buildHtmlReport(showrooms, dealers, dateStr);
  
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`📧 Sending to ${recipients.length} recipients`);
  
  let successCount = 0;
  for (const recipient of recipients) {
    const success = await sendEmail(recipient, htmlBody, dateStr);
    if (success) successCount++;
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n📬 Done: ${successCount}/${recipients.length} successful`);
  if (successCount === 0) process.exit(1);
  console.log('🎉 All emails sent successfully!');
}

main().catch(err => { console.error('❌ Script error:', err); process.exit(1); });
