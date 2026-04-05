// send-daily-email.js
const fs = require('fs');
const path = require('path');
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

// Firebase configuration
const FIREBASE_URL = 'https://ais-showroom-dashboard.firebaseio.com';

// Phase configuration
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

// Helper functions
function isDropped(dealer) {
  const f = dealer.flags || {};
  return dealer.status === 'Dropped' || f.cftRejected === true || f.prospectBackout === true;
}

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

function calculateDealerTimeline(d) {
  if (!d.startDate) return { isDelayed: false, delayDays: 0 };
  if (d.status === 'Completed') return { isDelayed: false, delayDays: 0 };
  if (isDropped(d)) return { isDelayed: false, delayDays: 0 };
  
  const start = new Date(d.startDate);
  const today = new Date();
  const daysElapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  
  const currentStage = d.currentStage || 'Interested';
  const targetDays = STAGE_TARGETS[currentStage] || 0;
  const delayDays = Math.max(0, daysElapsed - targetDays);
  const isDelayed = delayDays > 3;
  
  return { isDelayed, delayDays };
}

// Fetch showrooms from Firebase
async function fetchShowrooms() {
  try {
    const response = await fetch(`${FIREBASE_URL}/showrooms.json`);
    const data = await response.json();
    if (!data) return [];
    return Object.values(data);
  } catch (error) {
    console.error('Error fetching showrooms:', error.message);
    return [];
  }
}

// Fetch dealers from Firebase
async function fetchDealers() {
  try {
    const response = await fetch(`${FIREBASE_URL}/dealerOnboarding.json`);
    const data = await response.json();
    if (!data) return [];
    return Object.values(data);
  } catch (error) {
    console.error('Error fetching dealers:', error.message);
    return [];
  }
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

// Load and populate HTML template
function buildHtmlReport(showrooms, dealers, dateStr) {
  // Read template file
  let template = fs.readFileSync(path.join(__dirname, 'templates', 'dashboard-template.html'), 'utf8');
  
  // Calculate showroom metrics
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
  
  // Calculate dealer metrics
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
  
  // Build delayed message
  let delayedMessage = '';
  if (globalAvgDelay > 0 || delayedDealers > 0) {
    delayedMessage = `⚠️ ${globalAvgDelay > 0 ? globalAvgDelay + ' showroom(s)' : ''}${globalAvgDelay > 0 && delayedDealers > 0 ? ' and ' : ''}${delayedDealers > 0 ? delayedDealers + ' dealer(s)' : ''} are currently delayed. Please review the dashboard for details.`;
  } else {
    delayedMessage = '✅ No delayed projects at this time. All showrooms and dealers are on track! 🎉';
  }
  
  // Replace placeholders
  template = template.replace(/{{date}}/g, dateStr);
  template = template.replace(/{{total_showrooms}}/g, totalShowrooms);
  template = template.replace(/{{completed_showrooms}}/g, completedShowrooms);
  template = template.replace(/{{avg_completion}}/g, avgCompletion);
  template = template.replace(/{{delayed_showrooms}}/g, globalAvgDelay);
  template = template.replace(/{{total_dealers}}/g, totalDealers);
  template = template.replace(/{{active_dealers}}/g, activeDealers);
  template = template.replace(/{{onboarded_dealers}}/g, completedDealers);
  template = template.replace(/{{delayed_dealers}}/g, delayedDealers);
  template = template.replace(/{{delayed_message}}/g, delayedMessage);
  
  return template;
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
  
  console.log('📡 Fetching showrooms from Firebase...');
  const showrooms = await fetchShowrooms();
  console.log(`📡 Found ${showrooms.length} showrooms`);
  
  console.log('📡 Fetching dealers from Firebase...');
  const dealers = await fetchDealers();
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

main().catch(err => { 
  console.error('❌ Script error:', err); 
  process.exit(1); 
});
