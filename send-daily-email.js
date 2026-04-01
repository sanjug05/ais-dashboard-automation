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

// Check if today is a holiday (Sunday or 2nd/4th Saturday)
function isHoliday() {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday, 6 = Saturday
  const date = today.getDate();
  
  // Check if it's Sunday
  if (day === 0) {
    console.log(`📅 ${today.toDateString()} is a Sunday (Holiday)`);
    return true;
  }
  
  // Check if it's Saturday
  if (day === 6) {
    // Calculate which Saturday of the month
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstSaturday = firstDayOfMonth.getDay() === 6 ? 1 : 7 - firstDayOfMonth.getDay();
    const saturdayCount = Math.ceil((date - firstSaturday + 1) / 7);
    
    // Exclude 2nd and 4th Saturdays
    if (saturdayCount === 2 || saturdayCount === 4) {
      console.log(`📅 ${today.toDateString()} is the ${saturdayCount}nd/4th Saturday (Holiday)`);
      return true;
    }
    console.log(`📅 ${today.toDateString()} is the ${saturdayCount}st/rd Saturday (Working day)`);
  }
  
  return false;
}

console.log('🚀 Starting daily email report...');
console.log(`Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

// Check if it's a holiday (only for automated runs, manual runs still work)
if (!MANUAL_RECIPIENT && isHoliday()) {
  console.log('📅 Today is a holiday. Skipping automated email report.');
  console.log('✅ Exiting gracefully...');
  process.exit(0);
}

if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
  console.error('❌ Missing EmailJS credentials!');
  console.error('SERVICE_ID exists:', !!SERVICE_ID);
  console.error('TEMPLATE_ID exists:', !!TEMPLATE_ID);
  console.error('PUBLIC_KEY exists:', !!PUBLIC_KEY);
  console.error('PRIVATE_KEY exists:', !!PRIVATE_KEY);
  process.exit(1);
}

console.log('✅ EmailJS credentials found');

async function sendEmail(recipient) {
  const templateParams = {
    to_email: recipient,
    date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    report_type: 'Daily Summary',
    notes: 'Automated daily report from AIS Command Center',
    total_showrooms: 24,
    completed_showrooms: 0,
    avg_completion: 20,
    delayed_showrooms: 23,
    total_dealers: 0,
    active_dealers: 0,
    onboarded_dealers: 0,
    delayed_dealers: 0
  };

  console.log(`📧 Sending to: ${recipient}`);

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

async function main() {
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`📧 Sending to ${recipients.length} recipients`);
  
  let successCount = 0;
  for (const recipient of recipients) {
    if (await sendEmail(recipient)) successCount++;
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n📬 Done: ${successCount}/${recipients.length} successful`);
  if (successCount === 0) {
    console.error('❌ No emails were sent successfully');
    process.exit(1);
  }
  console.log('🎉 All emails sent successfully!');
}

main().catch(err => { 
  console.error('Script error:', err); 
  process.exit(1); 
});
