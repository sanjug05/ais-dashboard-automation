// send-daily-email.js
// Uses EmailJS REST API directly - no npm packages needed

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const MANUAL_RECIPIENT = process.env.MANUAL_RECIPIENT;

// Default recipients - UPDATE THESE WITH YOUR 4 EMAIL ADDRESSES
const DEFAULT_RECIPIENTS = [
  'sanju.gupta@aisglass.com',   // <-- Replace with actual email
  'mayank.tomar@aisglass.com',   // <-- Replace with actual email
  'krishna.varma@aisglass.com',   // <-- Replace with actual email
  'nidhi.tivari@aisglass.com'    // <-- Replace with actual email
];

// Function to get current metrics
async function getDashboardMetrics() {
  // You can modify this to fetch from Firebase if needed
  return {
    total_showrooms: 24,
    completed_showrooms: 0,
    avg_completion: 20,
    delayed_showrooms: 23,
    total_dealers: 0,
    active_dealers: 0,
    onboarded_dealers: 0,
    delayed_dealers: 0
  };
}

// Function to send email using EmailJS REST API
async function sendEmail(recipient, metrics, reportType = 'Daily Summary') {
  const templateParams = {
    to_email: recipient,
    date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    report_type: reportType,
    notes: 'Automated daily report from AIS Command Center',
    total_showrooms: metrics.total_showrooms,
    completed_showrooms: metrics.completed_showrooms,
    avg_completion: metrics.avg_completion,
    delayed_showrooms: metrics.delayed_showrooms,
    total_dealers: metrics.total_dealers,
    active_dealers: metrics.active_dealers,
    onboarded_dealers: metrics.onboarded_dealers,
    delayed_dealers: metrics.delayed_dealers,
    delayed_list: ''
  };

  console.log(`📧 Sending email to: ${recipient}`);

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        template_params: templateParams
      })
    });

    if (response.ok) {
      console.log(`✅ Email sent successfully to ${recipient}`);
      return { success: true, recipient };
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to send to ${recipient}: HTTP ${response.status} - ${errorText}`);
      return { success: false, recipient, error: `HTTP ${response.status}: ${errorText}` };
    }
  } catch (error) {
    console.error(`❌ Failed to send to ${recipient}:`, error.message);
    return { success: false, recipient, error: error.message };
  }
}

// Main function
async function main() {
  console.log('🚀 Starting daily email report...');
  console.log(`Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  
  // Check if required secrets are available
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.error('❌ Missing EmailJS credentials!');
    console.error('Please ensure EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY are set in GitHub Secrets');
    process.exit(1);
  }
  
  console.log('✅ EmailJS credentials found');
  console.log(`Service ID: ${SERVICE_ID}`);
  console.log(`Template ID: ${TEMPLATE_ID}`);
  console.log(`Public Key: ${PUBLIC_KEY.substring(0, 5)}...`);
  
  // Get dashboard metrics
  const metrics = await getDashboardMetrics();
  console.log('📊 Metrics collected:', metrics);
  
  // Determine recipients
  let recipients = [];
  
  if (MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim()) {
    recipients = [MANUAL_RECIPIENT];
    console.log(`📧 Manual trigger - sending to: ${MANUAL_RECIPIENT}`);
  } else {
    recipients = DEFAULT_RECIPIENTS;
    console.log(`📧 Daily run - sending to ${recipients.length} recipients:`, recipients);
  }
  
  // Send emails
  const results = [];
  for (const recipient of recipients) {
    const result = await sendEmail(recipient, metrics);
    results.push(result);
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n📬 Email Summary:');
  console.log(`Total attempts: ${results.length}`);
  console.log(`✅ Successful: ${results.filter(r => r.success).length}`);
  console.log(`❌ Failed: ${results.filter(r => !r.success).length}`);
  
  if (results.some(r => !r.success)) {
    console.log('\nFailed recipients:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.recipient}: ${r.error}`);
    });
    process.exit(1);
  }
  
  console.log('\n🎉 All emails sent successfully!');
}

// Run the script
main().catch(console.error);
// Updated
