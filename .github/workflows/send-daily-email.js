// send-daily-email.js
const emailjs = require('@emailjs/nodejs');

// Your EmailJS configuration (from GitHub Secrets)
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;  // You'll need to add this secret
const MANUAL_RECIPIENT = process.env.MANUAL_RECIPIENT;

// Default recipients - UPDATE THESE WITH YOUR 4 EMAIL ADDRESSES
const DEFAULT_RECIPIENTS = [
  'email1@company.com',   // <-- Replace with actual email
  'email2@company.com',   // <-- Replace with actual email
  'email3@company.com',   // <-- Replace with actual email
  'email4@company.com'    // <-- Replace with actual email
];

// Function to get current metrics (you can expand this later)
async function getDashboardMetrics() {
  // For now using sample data
  // TODO: Add Firebase fetching logic if needed
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

// Function to send email
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
    const response = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      templateParams,
      {
        publicKey: PUBLIC_KEY,
        privateKey: PRIVATE_KEY
      }
    );
    console.log(`✅ Email sent successfully to ${recipient}`);
    return { success: true, recipient };
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
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    console.error('❌ Missing EmailJS credentials!');
    console.error('Please ensure EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, and EMAILJS_PRIVATE_KEY are set in GitHub Secrets');
    process.exit(1);
  }
  
  console.log('✅ EmailJS credentials found');
  
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
