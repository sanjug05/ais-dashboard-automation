// send-daily-email.js - DEBUG VERSION
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

console.log('🚀 Starting dashboard email report...');

// Check if templates directory exists
const templatePath = path.join(__dirname, 'templates', 'dashboard-template.html');
console.log('Looking for template at:', templatePath);

if (!fs.existsSync(templatePath)) {
  console.error('❌ Template file not found!');
  console.error('Expected path:', templatePath);
  console.error('Current directory contents:', fs.readdirSync(__dirname));
  
  // Check if templates folder exists
  const templatesDir = path.join(__dirname, 'templates');
  if (fs.existsSync(templatesDir)) {
    console.error('templates folder exists. Contents:', fs.readdirSync(templatesDir));
  } else {
    console.error('templates folder does NOT exist!');
  }
  process.exit(1);
}

console.log('✅ Template file found');

// Read template
const template = fs.readFileSync(templatePath, 'utf8');
console.log('✅ Template loaded, length:', template.length);

// Simple test email
const testHtml = `
<div style="font-family: Arial, sans-serif;">
  <h2>Test Email</h2>
  <p>If you see this, the email system is working.</p>
  <p>Time: ${new Date().toLocaleString()}</p>
</div>
`;

async function sendEmail(recipient, htmlBody) {
  const templateParams = {
    to_email: recipient,
    subject: `📊 AIS Dashboard Report - ${new Date().toLocaleString()}`,
    date: new Date().toLocaleString(),
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

async function main() {
  // Check credentials
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    console.error('❌ Missing EmailJS credentials!');
    process.exit(1);
  }
  
  console.log('✅ EmailJS credentials found');
  
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`📧 Sending to ${recipients.length} recipients`);
  
  let successCount = 0;
  for (const recipient of recipients) {
    const success = await sendEmail(recipient, testHtml);
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
