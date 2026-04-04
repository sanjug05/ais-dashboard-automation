// send-daily-email.js
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const MANUAL_RECIPIENT = process.env.MANUAL_RECIPIENT;

// Your 4 email recipients
const DEFAULT_RECIPIENTS = [
  'sanju.gupta@aisglass.com',
  'mayank.tomar@aisglass.com',
  'krishna.verma@aisglass.com',
  'nidhi.tiwari@aisglass.com'
];

// Function to get dashboard metrics - FETCHES REAL DATA FROM FIREBASE
async function getDashboardMetrics() {
  try {
    console.log('📡 Fetching showrooms from Firebase...');
    const showroomsResponse = await fetch('https://ais-showroom-dashboard.firebaseio.com/showrooms.json');
    const showrooms = await showroomsResponse.json();
    
    console.log('📡 Fetching dealers from Firebase...');
    const dealersResponse = await fetch('https://ais-showroom-dashboard.firebaseio.com/dealerOnboarding.json');
    const dealers = await dealersResponse.json();
    
    // Calculate showroom metrics
    let totalShowrooms = 0;
    let completedShowrooms = 0;
    let totalCompletionPct = 0;
    let delayedShowrooms = 0;
    
    const phaseKeys = ['dim', 'cad', 'plan', 'civil', 'interior', 'brand', 'window', 'launch'];
    const totalPhases = phaseKeys.length;
    
    if (showrooms) {
      const showroomsList = Object.values(showrooms);
      totalShowrooms = showroomsList.length;
      
      for (const showroom of showroomsList) {
        const phases = showroom.data || {};
        let completedPhases = 0;
        
        for (const phase of phaseKeys) {
          if (phases[phase] && phases[phase].actualDate) {
            completedPhases++;
          }
        }
        
        const completionPct = Math.round((completedPhases / totalPhases) * 100);
        totalCompletionPct += completionPct;
        
        if (completionPct === 100) {
          completedShowrooms++;
        }
        
        // Check for delays (if start date exists)
        if (showroom.startDate) {
          const start = new Date(showroom.startDate);
          const today = new Date();
          const daysElapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
          const expectedProgress = Math.min(100, Math.round((daysElapsed / 90) * 100));
          
          if (completionPct < expectedProgress - 15) {
            delayedShowrooms++;
          }
        }
      }
    }
    
    const avgCompletion = totalShowrooms > 0 ? Math.round(totalCompletionPct / totalShowrooms) : 0;
    
    // Calculate dealer metrics
    let totalDealers = 0;
    let activeDealers = 0;
    let onboardedDealers = 0;
    let delayedDealers = 0;
    
    const stageTargets = {
      'Interested': 0,
      'Shortlisted': 3,
      'CFT Selected': 8,
      'Documentation': 15,
      'Onboarded': 22
    };
    
    if (dealers) {
      const dealersList = Object.values(dealers);
      totalDealers = dealersList.length;
      
      for (const dealer of dealersList) {
        // Count active dealers (not dropped, not completed)
        const isDropped = dealer.status === 'Dropped' || dealer.flags?.cftRejected === true || dealer.flags?.prospectBackout === true;
        
        if (dealer.status === 'Completed') {
          onboardedDealers++;
        } else if (!isDropped && dealer.status === 'Active') {
          activeDealers++;
        }
        
        // Check for delays
        if (dealer.startDate && dealer.status !== 'Completed' && !isDropped) {
          const start = new Date(dealer.startDate);
          const today = new Date();
          const daysElapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
          
          const currentStage = dealer.currentStage || 'Interested';
          const targetDays = stageTargets[currentStage] || 0;
          
          if (daysElapsed > targetDays + 3) {
            delayedDealers++;
          }
        }
      }
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
    
    return {
      total_showrooms: totalShowrooms,
      completed_showrooms: completedShowrooms,
      avg_completion: avgCompletion,
      delayed_showrooms: delayedShowrooms,
      total_dealers: totalDealers,
      active_dealers: activeDealers,
      onboarded_dealers: onboardedDealers,
      delayed_dealers: delayedDealers,
      delayed_message: delayedMessage
    };
    
  } catch (error) {
    console.error('❌ Error fetching dashboard data:', error.message);
    return {
      total_showrooms: 0,
      completed_showrooms: 0,
      avg_completion: 0,
      delayed_showrooms: 0,
      total_dealers: 0,
      active_dealers: 0,
      onboarded_dealers: 0,
      delayed_dealers: 0,
      delayed_message: '⚠️ Unable to fetch dashboard data. Please check your connection.'
    };
  }
}

// Function to get formatted date in IST
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

// Build HTML email report
function buildHtmlReport(metrics, dateStr) {
  // Showroom status message
  let showroomStatus = '';
  if (metrics.total_showrooms === 0) {
    showroomStatus = '<p style="color: #888;">📭 No showroom data available at this time.</p>';
  } else {
    showroomStatus = `
      <div style="display: flex; justify-content: space-around; flex-wrap: wrap; margin: 15px 0;">
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #C6A43B;">${metrics.total_showrooms}</div>
          <div style="font-size: 11px; color: #666;">Total Showrooms</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #27ae60;">${metrics.completed_showrooms}</div>
          <div style="font-size: 11px; color: #666;">Completed</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #C6A43B;">${metrics.avg_completion}%</div>
          <div style="font-size: 11px; color: #666;">Avg Completion</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: ${metrics.delayed_showrooms > 0 ? '#e74c3c' : '#27ae60'};">${metrics.delayed_showrooms}</div>
          <div style="font-size: 11px; color: #666;">Delayed</div>
        </div>
      </div>
    `;
  }
  
  // Dealer status message
  let dealerStatus = '';
  if (metrics.total_dealers === 0) {
    dealerStatus = '<p style="color: #888;">📭 No dealer data available at this time.</p>';
  } else {
    dealerStatus = `
      <div style="display: flex; justify-content: space-around; flex-wrap: wrap; margin: 15px 0;">
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #C6A43B;">${metrics.total_dealers}</div>
          <div style="font-size: 11px; color: #666;">Total Dealers</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #3498db;">${metrics.active_dealers}</div>
          <div style="font-size: 11px; color: #666;">Active</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: #27ae60;">${metrics.onboarded_dealers}</div>
          <div style="font-size: 11px; color: #666;">Onboarded</div>
        </div>
        <div style="text-align: center; flex: 1; min-width: 100px;">
          <div style="font-size: 28px; font-weight: 800; color: ${metrics.delayed_dealers > 0 ? '#e74c3c' : '#27ae60'};">${metrics.delayed_dealers}</div>
          <div style="font-size: 11px; color: #666;">Delayed</div>
        </div>
      </div>
    `;
  }
  
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif;">
      <h2 style="color: #C6A43B; margin: 0 0 10px 0;">📊 AIS Dashboard Summary</h2>
      <p><strong>Report Time:</strong> ${dateStr}</p>
      <hr style="border: none; border-top: 1px solid #ddd;">
      
      <h3 style="color: #1a73e8;">🏢 Showroom Performance</h3>
      ${showroomStatus}
      
      <h3 style="color: #1a73e8; margin-top: 25px;">👥 Dealer Onboarding</h3>
      ${dealerStatus}
      
      <h3 style="color: #e74c3c;">⚠️ Delayed Projects</h3>
      <div style="background: ${metrics.delayed_showrooms > 0 || metrics.delayed_dealers > 0 ? '#fce8e6' : '#e8f5e9'}; padding: 15px; border-radius: 8px;">
        ${metrics.delayed_message}
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
async function sendEmail(recipient, dateStr) {
  // Get fresh metrics for each email
  const metrics = await getDashboardMetrics();
  const htmlBody = buildHtmlReport(metrics, dateStr);
  
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

// Check if today is a holiday (Sunday or 2nd/4th Saturday)
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
    console.error('SERVICE_ID exists:', !!SERVICE_ID);
    console.error('TEMPLATE_ID exists:', !!TEMPLATE_ID);
    console.error('PUBLIC_KEY exists:', !!PUBLIC_KEY);
    console.error('PRIVATE_KEY exists:', !!PRIVATE_KEY);
    process.exit(1);
  }
  
  console.log('✅ EmailJS credentials found');
  
  // Determine recipients
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`📧 Sending to ${recipients.length} recipients`);
  
  let successCount = 0;
  for (const recipient of recipients) {
    const success = await sendEmail(recipient, dateStr);
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
