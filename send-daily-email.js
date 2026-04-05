// send-daily-email.js - DEBUG FIREBASE DATA
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

console.log('🚀 Starting dashboard email report...');

// Fetch and log raw data from Firebase
async function debugFirebaseData() {
  console.log('\n📡 Fetching raw data from Firebase...');
  
  // Fetch showrooms
  const showroomsResponse = await fetch(`${FIREBASE_URL}/showrooms.json`);
  const showroomsData = await showroomsResponse.json();
  console.log('\n📊 SHOWROOMS RAW DATA:');
  console.log('Type:', typeof showroomsData);
  console.log('Is array?', Array.isArray(showroomsData));
  console.log('Content:', JSON.stringify(showroomsData, null, 2));
  
  // Fetch dealers
  const dealersResponse = await fetch(`${FIREBASE_URL}/dealerOnboarding.json`);
  const dealersData = await dealersResponse.json();
  console.log('\n📊 DEALERS RAW DATA:');
  console.log('Type:', typeof dealersData);
  console.log('Is array?', Array.isArray(dealersData));
  console.log('Content:', JSON.stringify(dealersData, null, 2));
  
  return { showroomsData, dealersData };
}

// Simple test email
async function sendEmail(recipient, htmlBody) {
  const templateParams = {
    to_email: recipient,
    subject: `📊 AIS Dashboard Debug - ${new Date().toLocaleString()}`,
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
  
  // Debug Firebase data
  const { showroomsData, dealersData } = await debugFirebaseData();
  
  // Count records
  let showroomCount = 0;
  let dealerCount = 0;
  
  if (showroomsData) {
    if (Array.isArray(showroomsData)) {
      showroomCount = showroomsData.length;
    } else if (typeof showroomsData === 'object') {
      showroomCount = Object.keys(showroomsData).length;
    }
  }
  
  if (dealersData) {
    if (Array.isArray(dealersData)) {
      dealerCount = dealersData.length;
    } else if (typeof dealersData === 'object') {
      dealerCount = Object.keys(dealersData).length;
    }
  }
  
  // Create debug report
  const debugHtml = `
  <div style="font-family: Arial, sans-serif; padding: 20px;">
    <h2>🔍 Firebase Data Debug Report</h2>
    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    <hr>
    
    <h3>Showrooms:</h3>
    <p>Count: ${showroomCount}</p>
    <p>Data structure: ${showroomsData ? (Array.isArray(showroomsData) ? 'Array' : 'Object') : 'null'}</p>
    <pre style="background: #f0f0f0; padding: 10px; overflow-x: auto;">${JSON.stringify(showroomsData, null, 2)}</pre>
    
    <h3>Dealers:</h3>
    <p>Count: ${dealerCount}</p>
    <p>Data structure: ${dealersData ? (Array.isArray(dealersData) ? 'Array' : 'Object') : 'null'}</p>
    <pre style="background: #f0f0f0; padding: 10px; overflow-x: auto;">${JSON.stringify(dealersData, null, 2)}</pre>
    
    <hr>
    <p>This is a debug report from AIS Command Center</p>
  </div>
  `;
  
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`📧 Sending debug report to ${recipients.length} recipients`);
  
  let successCount = 0;
  for (const recipient of recipients) {
    const success = await sendEmail(recipient, debugHtml);
    if (success) successCount++;
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n📬 Done: ${successCount}/${recipients.length} successful`);
  if (successCount === 0) process.exit(1);
  console.log('🎉 Debug report sent!');
}

main().catch(err => { 
  console.error('❌ Script error:', err); 
  process.exit(1); 
});
