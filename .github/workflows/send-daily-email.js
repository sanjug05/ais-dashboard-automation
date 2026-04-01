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

console.log('🚀 Starting...');
console.log('SERVICE_ID:', SERVICE_ID ? '✅' : '❌');
console.log('TEMPLATE_ID:', TEMPLATE_ID ? '✅' : '❌');
console.log('PUBLIC_KEY:', PUBLIC_KEY ? '✅' : '❌');

if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

async function sendEmail(recipient) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: {
        to_email: recipient,
        date: new Date().toLocaleString(),
        report_type: 'Test',
        notes: 'Test email'
      }
    })
  });
  return response.ok;
}

async function main() {
  const recipient = MANUAL_RECIPIENT || 'test@example.com';
  console.log(`📧 Sending to: ${recipient}`);
  const success = await sendEmail(recipient);
  console.log(success ? '✅ Sent!' : '❌ Failed');
  if (!success) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
