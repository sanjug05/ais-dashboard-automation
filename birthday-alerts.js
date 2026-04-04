// birthday-alerts.js
const { google } = require('googleapis');

// EmailJS credentials (using REST API, same as dashboard)
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const MANUAL_RECIPIENT = process.env.MANUAL_RECIPIENT;

// Default recipients
const DEFAULT_RECIPIENTS = [
  'sanju.gupta@aisglass.com',
  'mayank.tomar@aisglass.com',
  'krishna.verma@aisglass.com',
];

// Configuration
const CONFIG = {
  SHEET_NAME: 'Dealer Data',
  EXPIRY_THRESHOLD_DAYS: 30,
  FOLLOW_UP_THRESHOLD_DAYS: 3
};

// Parse Google Service Account JSON
let GOOGLE_AUTH = null;
try {
  const serviceAccountJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  GOOGLE_AUTH = new google.auth.JWT(
    serviceAccountJson.client_email,
    null,
    serviceAccountJson.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );
  console.log('✅ Google Auth initialized');
} catch (error) {
  console.error('❌ Failed to parse Google service account JSON:', error.message);
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

// Format date
function formatDate(date, includeTime = false) {
  if (!date) return '—';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  }
  return `${day}-${month}-${year}`;
}

// Get current date in IST
function getCurrentDateIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return formatDate(istTime, true);
}

// Parse DD/MM/YYYY date
function parseSpecificDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  
  if (typeof val === 'string' && val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  }
  
  if (typeof val === 'number') {
    return new Date((val - 25569) * 86400 * 1000);
  }
  
  return null;
}

// Check if same day and month
function isSameDayMonth(d1, d2) {
  return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth();
}

// Find column index
function findColumn(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const headText = headers[i]?.toString().toLowerCase().trim() || '';
    if (keywords.some(k => headText === k.toLowerCase() || headText.includes(k.toLowerCase()))) {
      return i;
    }
  }
  return -1;
}

// Get data from Google Sheet
async function getSheetData() {
  try {
    const sheets = google.sheets({ version: 'v4', auth: GOOGLE_AUTH });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${CONFIG.SHEET_NAME}!A:ZZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      console.log('No data found in sheet');
      return { birthday: [], anniversary: [], showroomAnniversary: [], expiry: [], followUp: [] };
    }
    
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    const col = {
      dealerName: findColumn(headers, ['Channel Partner']),
      city: findColumn(headers, ['City']),
      rm: findColumn(headers, ['RM']),
      expiry: findColumn(headers, ['Last Agreement Date', 'Expiry']),
      dob: findColumn(headers, ['Date of Birth']),
      showroomAnniversary: 42,
      anniversary: findColumn(headers, ['Marriage anniversary']),
      followUp: findColumn(headers, ['Follow-up Date', 'Next Follow Up']),
    };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const alerts = {
      birthday: [],
      anniversary: [],
      showroomAnniversary: [],
      expiry: [],
      followUp: []
    };
    
    for (const row of dataRows) {
      const dealerInfo = {
        name: row[col.dealerName] || 'Unknown Dealer',
        city: row[col.city] || 'N/A',
        rm: row[col.rm] || 'N/A',
        expiry: parseSpecificDate(row[col.expiry]),
        dob: parseSpecificDate(row[col.dob]),
        showroomAnniversary: parseSpecificDate(row[col.showroomAnniversary]),
        anniversary: parseSpecificDate(row[col.anniversary]),
        followUp: parseSpecificDate(row[col.followUp]),
      };
      
      if (dealerInfo.dob && isSameDayMonth(dealerInfo.dob, today)) {
        alerts.birthday.push(dealerInfo);
      }
      
      if (dealerInfo.anniversary && isSameDayMonth(dealerInfo.anniversary, today)) {
        alerts.anniversary.push(dealerInfo);
      }
      
      if (dealerInfo.showroomAnniversary && isSameDayMonth(dealerInfo.showroomAnniversary, today)) {
        alerts.showroomAnniversary.push(dealerInfo);
      }
      
      if (dealerInfo.expiry) {
        const diffDays = Math.ceil((dealerInfo.expiry - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= CONFIG.EXPIRY_THRESHOLD_DAYS) {
          alerts.expiry.push({ ...dealerInfo, daysLeft: diffDays });
        }
      }
      
      if (dealerInfo.followUp) {
        const diffDays = Math.ceil((dealerInfo.followUp - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= CONFIG.FOLLOW_UP_THRESHOLD_DAYS) {
          alerts.followUp.push({ ...dealerInfo, daysLeft: diffDays });
        }
      }
    }
    
    return alerts;
  } catch (error) {
    console.error('Error fetching sheet data:', error.message);
    throw error;
  }
}

// Build HTML report
// Build HTML report - WITHOUT outer HTML wrapper
function buildHtmlReport(alerts, dateStr) {
  let html = `
    <h2>🎉 AIS Dealer Celebrations & Alerts</h2>
    <p><strong>Date:</strong> ${dateStr}</p>
    <hr>
    <h3>🎂 Birthdays Today</h3>`;
  
  if (alerts.birthday.length === 0) {
    html += `<p>No birthdays today.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.birthday) {
      html += `<li>${item.name} - ${item.city} (RM: ${item.rm})</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<h3>💍 Marriage Anniversaries</h3>`;
  if (alerts.anniversary.length === 0) {
    html += `<p>No anniversaries today.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.anniversary) {
      html += `<li>${item.name} - ${item.city} (RM: ${item.rm})</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<h3>🏬 Showroom Anniversaries</h3>`;
  if (alerts.showroomAnniversary.length === 0) {
    html += `<p>No showroom anniversaries today.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.showroomAnniversary) {
      html += `<li>${item.name} - ${item.city} (RM: ${item.rm})</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<h3>⚠️ Agreement Expiries (Next 30 Days)</h3>`;
  if (alerts.expiry.length === 0) {
    html += `<p>No expiries in next 30 days.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.expiry) {
      html += `<li>${item.name} - ${item.city} (RM: ${item.rm}) - ${item.daysLeft} days left</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<h3>📞 Upcoming Follow-ups</h3>`;
  if (alerts.followUp.length === 0) {
    html += `<p>No follow-ups due.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.followUp) {
      html += `<li>${item.name} - ${item.city} (RM: ${item.rm}) - ${item.daysLeft} days left</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<hr><p style="font-size: 10px; color: #888;">This is an automated report from AIS Command Center</p>`;
  
  return html;
}

// Send email using REST API (same method as working dashboard)
async function sendEmail(recipient, htmlBody, dateStr) {
  const templateParams = {
    to_email: recipient,
    subject: '🎉 AIS Celebrations & Alerts - ${getFormattedDate()}`,
    date: dateStr,
    message: htmlBody
  };

  console.log(`📧 Sending to: ${recipient}`);
  console.log(`📧 Using Service ID: ${EMAILJS_SERVICE_ID}`);
  console.log(`📧 Using Template ID: ${EMAILJS_TEMPLATE_ID}`);

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
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
  console.log('🚀 Starting birthday & anniversary alerts...');
  const dateStr = getCurrentDateIST();
  console.log(`Time: ${dateStr}`);
  
  // Skip on holidays for automated runs
  if (!MANUAL_RECIPIENT && isHoliday()) {
    console.log('📅 Today is a holiday. Skipping automated alerts.');
    process.exit(0);
  }
  
  // Check credentials
  console.log('\n📋 Checking EmailJS credentials:');
  console.log(`EMAILJS_SERVICE_ID: ${EMAILJS_SERVICE_ID ? '✅' : '❌'}`);
  console.log(`EMAILJS_TEMPLATE_ID: ${EMAILJS_TEMPLATE_ID ? '✅' : '❌'}`);
  console.log(`EMAILJS_PUBLIC_KEY: ${EMAILJS_PUBLIC_KEY ? '✅' : '❌'}`);
  console.log(`EMAILJS_PRIVATE_KEY: ${EMAILJS_PRIVATE_KEY ? '✅' : '❌'}`);
  
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    console.error('❌ Missing EmailJS credentials!');
    process.exit(1);
  }
  
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.error('❌ Missing Google Sheets credentials!');
    process.exit(1);
  }
  
  if (!GOOGLE_AUTH) {
    console.error('❌ Failed to initialize Google Auth!');
    process.exit(1);
  }
  
  console.log('✅ All credentials found');
  
  // Get data from Google Sheet
  console.log('\n📊 Fetching data from Google Sheet...');
  const alerts = await getSheetData();
  
  console.log(`📊 Found: ${alerts.birthday.length} birthdays, ${alerts.anniversary.length} anniversaries, ${alerts.expiry.length} expiries, ${alerts.followUp.length} follow-ups`);
  
  // Build email
  const htmlBody = buildHtmlReport(alerts, dateStr);
  console.log(`📧 Email body length: ${htmlBody.length} characters`);
  
  // Determine recipients
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`\n📧 Sending to ${recipients.length} recipients`);
  
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
  console.log('🎉 All alerts sent successfully!');
}

// Run the script
main().catch(err => { 
  console.error('❌ Script error:', err); 
  process.exit(1); 
});
