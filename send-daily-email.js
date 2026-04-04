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

// Firebase configuration
const FIREBASE_URL = 'https://ais-showroom-dashboard.firebaseio.com';

// Phase configuration (same as dashboard)
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

// Dealer stages (same as dashboard)
const STAGE_TARGETS = {
  'Interested': 0,
  'Shortlisted': 3,
  'CFT Selected': 8,
  'Documentation': 15,
  'Onboarded': 22
};

// Fetch showrooms from Firebase
async function fetchShowrooms() {
  try {
    const response = await fetch(`${FIREBASE_URL}/showrooms.json`);
    const data = await response.json();
    if (!data) return [];
    return Object.values(data).map(showroom => ({
      id: showroom.id,
      name: showroom.name || 'Unknown',
      startDate: showroom.startDate,
      data: showroom.data || {}
    }));
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
    return Object.values(data).map(dealer => ({
      id: dealer.id,
      name: dealer.name || 'Unknown',
      city: dealer.city || 'N/A',
      rm: dealer.rm || 'N/A',
      status: dealer.status || 'Active',
      currentStage: dealer.currentStage || 'Interested',
      startDate: dealer.startDate,
      documents: dealer.documents || {},
      stageLog: dealer.stageLog || {},
      flags: dealer.flags || {}
    }));
  } catch (error) {
    console.error('Error fetching dealers:', error.message);
    return [];
  }
}

// Check if dealer is dropped (same logic as dashboard)
function isDealerDropped(dealer) {
  const f = dealer.flags || {};
  return dealer.status === 'Dropped' || f.cftRejected === true || f.prospectBackout === true;
}

// Calculate showroom completion percentage (same as dashboard's calculateShowroomStats)
function calculateShowroomCompletion(showroom) {
  if (!showroom || !showroom.startDate) return { pct: 0, avgDelay: 0 };
  
  const start = new Date(showroom.startDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let totalDelay = 0;
  let completedCount = 0;
  let delayCount = 0;
  
  if (isNaN(start.getTime())) return { pct: 0, avgDelay: 0 };
  
  for (const phase of PHASES_CONFIG) {
    const target = new Date(start);
    target.setDate(start.getDate() + phase.days);
    
    const phaseData = (showroom.data && showroom.data[phase.id]) || {};
    
    if (phaseData.actualDate) {
      completedCount++;
      const actual = new Date(phaseData.actualDate + "T00:00:00");
      const diff = Math.ceil((actual - target) / 86400000);
      if (diff > 0) {
        totalDelay += diff;
        delayCount++;
      }
    } else {
      const diff = Math.ceil((today - target) / 86400000);
      if (diff > 0) {
        totalDelay += diff;
        delayCount++;
      }
    }
  }
  
  const avgDelay = delayCount > 0 ? Math.round(totalDelay / delayCount) : 0;
  const pct = Math.round((completedCount / PHASES_CONFIG.length) * 100);
  
  return { pct, avgDelay };
}

// Calculate dealer delay (same as dashboard's calculateDealerTimeline)
function calculateDealerDelay(dealer) {
  if (!dealer.startDate) return { isDelayed: false, delayDays: 0 };
  if (dealer.status === 'Completed') return { isDelayed: false, delayDays: 0 };
  if (isDealerDropped(dealer)) return { isDelayed: false, delayDays: 0 };
  
  const start = new Date(dealer.startDate);
  const today = new Date();
  const daysElapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  
  const currentStage = dealer.currentStage || 'Interested';
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

// Check holiday (Sunday or 2nd/4th Saturday)
function isHoliday() {
  const today = new Date();
  const day = today.getDay();
  const date = today.getDate();
  
  if (day === 0) {
    console.log(`📅 ${today.toDateString()} is a Sunday (Holiday)`);
    return true;
  }
  
  if (day === 6) {
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstSaturday = firstDayOfMonth.getDay() === 6 ? 1 : 7 - firstDayOfMonth.getDay();
    const saturdayCount = Math.ceil((date - firstSaturday + 1) / 7);
    
    if (saturdayCount === 2 || saturdayCount === 4) {
      console.log(`📅 ${today.toDateString()} is the ${saturdayCount}nd/4th Saturday (Holiday)`);
      return true;
    }
  }
  
  return false;
}

// Build HTML email report
function buildHtmlReport(showrooms, dealers, dateStr) {
  // Calculate showroom metrics
  let totalShowrooms = showrooms.length;
  let totalCompletionPct = 0;
  let completedShowrooms = 0;
  let delayedShowrooms = 0;
  
  for (const showroom of showrooms) {
    const stats = calculateShowroomCompletion(showroom);
    totalCompletionPct += stats.pct;
    if (stats.pct === 100) completedShowrooms++;
    if (stats.avgDelay > 0) delayedShowrooms++;
  }
  
  const avgCompletion = totalShowrooms > 0 ? Math.round(totalCompletionPct / totalShowrooms) : 0;
  
  // Calculate dealer metrics
  let totalDealers = dealers.length;
  let activeDealers = 0;
  let onboardedDealers = 0;
  let delayedDealers = 0;
  
  for (const dealer of dealers) {
    if (dealer.status === 'Completed') {
      onboardedDealers++;
    } else if (!isDealerDropped(dealer) && dealer.status === 'Active') {
      activeDealers++;
    }
    
    const delay = calculateDealerDelay(dealer);
    if (delay.isDelayed) delayedDealers++;
  }
  
  // Build delayed message
  let delayedMessage = '';
  if (delayedShowrooms > 0 || delayedDealers > 0) {
    delayedMessage = `⚠️ ${delayedShowrooms} showroom(s) and ${delayedDealers} dealer(s) are currently delayed. Please review the dashboard for details.`;
  } else {
    delayedMessage = '✅ No delayed projects at this time. All showrooms and dealers are on track! 🎉';
  }
  
  console.log(`📊 Showrooms: ${totalShowrooms} total, ${completedShowrooms} completed, ${delayedShowrooms} delayed`);
  console.log(`📊 Dealers: ${totalDealers} total, ${onboardedDealers} onboarded, ${delayedDealers} delayed`);
  
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif;">
      <h2 style="color: #C6A43B; margin: 0 0 10px 0;">📊 AIS Dashboard Summary</h2>
      <p><strong>Report Time:</strong> ${dateStr}</p>
      <hr style="border: none; border-top: 1px solid #ddd;">
      
      <h3 style="color: #1a73e8;">🏢 Showroom Performance</h3>
      <div style="display: flex; justify-content: space-around; flex-wrap: wrap; margin: 15px 0;">
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #C6A43B;">${totalShowrooms}</div>
          <div style="font-size: 11px; color: #666;">Total Showrooms</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #27ae60;">${completedShowrooms}</div>
          <div style="font-size: 11px; color: #666;">Completed</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #C6A43B;">${avgCompletion}%</div>
          <div style="font-size: 11px; color: #666;">Avg Completion</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: ${delayedShowrooms > 0 ? '#e74c3c' : '#27ae60'};">${delayedShowrooms}</div>
          <div style="font-size: 11px; color: #666;">Delayed</div>
        </div>
      </div>
      
      <h3 style="color: #1a73e8; margin-top: 25px;">👥 Dealer Onboarding</h3>
      <div style="display: flex; justify-content: space-around; flex-wrap: wrap; margin: 15px 0;">
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #C6A43B;">${totalDealers}</div>
          <div style="font-size: 11px; color: #666;">Total Dealers</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #3498db;">${activeDealers}</div>
          <div style="font-size: 11px; color: #666;">Active</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #27ae60;">${onboardedDealers}</div>
          <div style="font-size: 11px; color: #666;">Onboarded</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: ${delayedDealers > 0 ? '#e74c3c' : '#27ae60'};">${delayedDealers}</div>
          <div style="font-size: 11px; color: #666;">Delayed</div>
        </div>
      </div>
      
      <h3 style="color: #e74c3c;">⚠️ Delayed Projects</h3>
      <div style="background: ${delayedShowrooms > 0 || delayedDealers > 0 ? '#fce8e6' : '#e8f5e9'}; padding: 15px; border-radius: 8px;">
        ${delayedMessage}
      </div>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 11px; color: #888; text-align: center;">
        This is an automated report from AIS Command Center<br>
        © 2026 AIS Windows | All Rights Reserved
      </p>
    </div>
  `;
}

// Send email using REST API
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
      console.error(`❌ Failed: ${recipient} - HTTP ${response.status}: ${errorText}`);
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
  
  // Skip on holidays for automated runs
  if (!MANUAL_RECIPIENT && isHoliday()) {
    console.log('📅 Today is a holiday. Skipping automated email report.');
    process.exit(0);
  }
  
  // Check credentials
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    console.error('❌ Missing EmailJS credentials!');
    process.exit(1);
  }
  
  console.log('✅ EmailJS credentials found');
  
  // Fetch real-time data from Firebase
  console.log('📡 Fetching showrooms from Firebase...');
  const showrooms = await fetchShowrooms();
  console.log(`📡 Found ${showrooms.length} showrooms`);
  
  console.log('📡 Fetching dealers from Firebase...');
  const dealers = await fetchDealers();
  console.log(`📡 Found ${dealers.length} dealers`);
  
  // Build email
  const htmlBody = buildHtmlReport(showrooms, dealers, dateStr);
  
  // Determine recipients
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
  if (successCount === 0) {
    console.error('❌ No emails were sent successfully');
    process.exit(1);
  }
  console.log('🎉 All emails sent successfully!');
}

// Run the script
main().catch(err => { 
  console.error('❌ Script error:', err); 
  process.exit(1); 
});
