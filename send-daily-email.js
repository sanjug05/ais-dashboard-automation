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

// Function to get dashboard metrics
function getDashboardMetrics() {
  // TODO: Replace with actual API call to your dashboard data
  // For now, showing sample data with "no data" message
  return {
    total_showrooms: 0,
    completed_showrooms: 0,
    avg_completion: 0,
    delayed_showrooms: 0,
    total_dealers: 0,
    active_dealers: 0,
    onboarded_dealers: 0,
    delayed_dealers: 0,
    delayed_message: '✅ No delayed projects at this time. All showrooms and dealers are on track! 🎉'
  };
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

// Check if today is a holiday
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
    process.exit(1);
  }
  
  console.log('✅ EmailJS credentials found');
  
  // Get dashboard metrics
  const metrics = getDashboardMetrics();
  console.log('📊 Metrics collected');
  
  // Build email
  const htmlBody = buildHtmlReport(metrics, dateStr);
  
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
