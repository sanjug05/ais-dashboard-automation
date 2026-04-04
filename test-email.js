// test-email.js
const emailjs = require('@emailjs/nodejs');

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

console.log('Testing EmailJS...');
console.log('SERVICE_ID:', SERVICE_ID);
console.log('TEMPLATE_ID:', TEMPLATE_ID);
console.log('PUBLIC_KEY:', PUBLIC_KEY ? '✅ Present' : '❌ Missing');
console.log('PRIVATE_KEY:', PRIVATE_KEY ? '✅ Present' : '❌ Missing');

async function testEmail() {
  const templateParams = {
    to_email: 'sanju.gupta@aisglass.com',
    date: new Date().toLocaleString(),
    message: '<h1>Test Email</h1><p>This is a test message.</p>'
  };

  try {
    console.log('Sending test email...');
    const response = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      templateParams,
      { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY }
    );
    console.log('✅ Email sent successfully!');
    console.log('Response:', response);
  } catch (error) {
    console.error('❌ Failed to send email');
    console.error('Error message:', error.message);
    console.error('Error details:', error);
  }
}

testEmail();
