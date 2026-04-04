// birthday-alerts.js - CORRECTED VERSION
const { google } = require('googleapis');

// EmailJS credentials
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

// Format date
function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Get current date in IST
function getCurrentDateIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return formatDate(istTime);
}

// EXACT parseSpecificDate from your Apps Script
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

// EXACT isSameDayMonth from your Apps Script
function isSameDayMonth(d1, d2) {
  if (!d1 || !d2) return false;
  return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth();
}

// EXACT findColumn from your Apps Script - SEARCHES FOR HEADERS
function findColumn(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const headText = headers[i]?.toString().toLowerCase().trim() || '';
    if (keywords.some(k => headText === k.toLowerCase() || headText.includes(k.toLowerCase()))) {
      return i;
    }
  }
  return -1;
}

// Check holiday
function isHoliday() {
  const today = new Date();
  const day = today.getDay();
  const date = today.getDate();
  
  if (day === 0) return true;
  if (day === 6) {
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstSaturday = firstDayOfMonth.getDay() === 6 ? 1 : 7 - firstDayOfMonth.getDay();
    const saturdayCount = Math.ceil((date - firstSaturday + 1) / 7);
    if (saturdayCount === 2 || saturdayCount === 4) return true;
  }
  return false;
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
      return { expiry: [], birthday: [], anniversary: [], showroomAnniversary: [], followUp: [] };
    }
    
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    // Log headers found for debugging
    console.log('📋 Found headers (first 20):', headers.slice(0, 20));
    
    // Find column indices by searching for headers - JUST LIKE YOUR APPS SCRIPT
    const col = {
      dealerName: findColumn(headers, ["Channel Partner"]),
      city: findColumn(headers, ["City"]),
      rm: findColumn(headers, ["RM"]),
      expiry: findColumn(headers, ["Last Agreement Date", "Expiry"]),
      dob: findColumn(headers, ["Date of Birth"]),
      showroomAnniversary: findColumn(headers, ["Showroom Anniversary", "Showroom Date"]), // NOW SEARCHES!
      anniversary: findColumn(headers, ["Marriage anniversary"]),
      followUp: findColumn(headers, ["Follow-up Date", "Next Follow Up"]),
      status: findColumn(headers, ["Status"])
    };
    
    console.log('📋 Column mapping:', col);
    
    // Check if critical columns are missing
    if (col.dealerName === -1) console.warn('⚠️ "Channel Partner" column not found!');
    if (col.dob === -1) console.warn('⚠️ "Date of Birth" column not found!');
    if (col.expiry === -1) console.warn('⚠️ "Last Agreement Date" column not found!');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const alerts = { 
      expiry: [], 
      birthday: [], 
      anniversary: [], 
      showroomAnniversary: [], 
      followUp: [] 
    };
    
    for (const row of dataRows) {
      const dealerInfo = {
        name: row[col.dealerName] || "Unknown Dealer",
        city: row[col.city] || "N/A",
        rm: row[col.rm] || "N/A",
        expiry: parseSpecificDate(row[col.expiry]),
        dob: parseSpecificDate(row[col.dob]),
        showroomAnniversary: parseSpecificDate(row[col.showroomAnniversary]),
        anniversary: parseSpecificDate(row[col.anniversary]),
        followUp: parseSpecificDate(row[col.followUp]),
        status: row[col.status] || "N/A"
      };
      
      // Birthday Check
      if (dealerInfo.dob && isSameDayMonth(dealerInfo.dob, today)) {
        alerts.birthday.push(dealerInfo);
      }
      
      // Anniversary Check
      if (dealerInfo.anniversary && isSameDayMonth(dealerInfo.anniversary, today)) {
        alerts.anniversary.push(dealerInfo);
      }
      
      // Expiry Check
      if (dealerInfo.expiry) {
        const diffDays = Math.ceil((dealerInfo.expiry - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= CONFIG.EXPIRY_THRESHOLD_DAYS) {
          alerts.expiry.push(dealerInfo);
        }
      }
      
      // Follow-up Check
      if (dealerInfo.followUp) {
        const diffDays = Math.ceil((dealerInfo.followUp - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= CONFIG.FOLLOW_UP_THRESHOLD_DAYS) {
          alerts.followUp.push(dealerInfo);
        }
      }
      
      // Showroom Anniversary Check
      if (dealerInfo.showroomAnniversary && isSameDayMonth(dealerInfo.showroomAnniversary, today)) {
        alerts.showroomAnniversary.push(dealerInfo);
      }
    }
    
    return alerts;
  } catch (error) {
    console.error('Error fetching sheet data:', error.message);
    throw error;
  }
}

// Build HTML report
function buildHtmlReport(alerts, dateStr) {
  let html = `<div style="font-family: sans-serif; color: #333;">
    <h2 style="color: #1a73e8;">AIS Dealer Daily Summary</h2>
    <p>Date: ${dateStr}</p>
    <hr>`;

  const categories = [
    { label: "🎂 Birthdays Today", data: alerts.birthday, color: "#e8f0fe", getDate: (item) => item.dob },
    { label: "🏬 Showroom Anniversaries", data: alerts.showroomAnniversary, color: "#f3e8ff", getDate: (item) => item.showroomAnniversary },
    { label: "💍 Anniversaries Today", data: alerts.anniversary, color: "#e6fffa", getDate: (item) => item.anniversary },
    { label: "⚠️ Agreement Expiries (30 Days)", data: alerts.expiry, color: "#fce8e6", getDate: (item) => item.expiry },
    { label: "📞 Upcoming Follow-ups", data: alerts.followUp, color: "#fff7e6", getDate: (item) => item.followUp }
  ];

  categories.forEach(cat => {
    html += `<h3>${cat.label}</h3>`;
    if (cat.data.length === 0) {
      html += `<p style="color: #999;">No records found.</p>`;
    } else {
      html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="background-color: #1a73e8; color: white; padding: 10px;">Dealer Name</th>
            <th style="background-color: #1a73e8; color: white; padding: 10px;">City</th>
            <th style="background-color: #1a73e8; color: white; padding: 10px;">RM</th>
            <th style="background-color: #1a73e8; color: white; padding: 10px;">Date</th>
          </tr>
        </thead>
        <tbody>`;
      
      for (const item of cat.data) {
        const dateVal = cat.getDate(item);
        const dateStrDisplay = dateVal ? formatDate(dateVal) : "—";
        
        html += `<tr style="background-color: ${cat.color};">
          <td style="border: 1px solid #ddd; padding: 8px;">${item.name}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${item.city}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${item.rm}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${dateStrDisplay}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }
  });

  html += `<br><p style="font-size: 10px; color: #666;">This is an automated system alert. Please do not reply.</p></div>`;
  return html;
}

// Send email
async function sendEmail(recipient, htmlBody, dateStr) {
  const templateParams = {
    to_email: recipient,
    subject: `🚨 AIS Dealer Alerts - ${dateStr}`,
    date: dateStr,
    message: htmlBody
  };

  console.log(`📧 Sending to: ${recipient}`);

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
      console.error(`❌ Failed: ${recipient} - ${errorText}`);
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
  
  if (!MANUAL_RECIPIENT && isHoliday()) {
    console.log('📅 Today is a holiday. Skipping automated alerts.');
    process.exit(0);
  }
  
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
  
  console.log('\n📊 Fetching data from Google Sheet...');
  const alerts = await getSheetData();
  
  console.log(`\n📊 Found: ${alerts.birthday.length} birthdays, ${alerts.anniversary.length} anniversaries, ${alerts.showroomAnniversary.length} showroom anniversaries, ${alerts.expiry.length} expiries, ${alerts.followUp.length} follow-ups`);
  
  const htmlBody = buildHtmlReport(alerts, dateStr);
  
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
  if (successCount === 0) process.exit(1);
  console.log('🎉 All alerts sent successfully!');
}

main().catch(err => { 
  console.error('❌ Script error:', err); 
  process.exit(1); 
});
