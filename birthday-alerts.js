// birthday-alerts.js
const { google } = require('googleapis');
const emailjs = require('@emailjs/nodejs');

// EmailJS credentials
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const MANUAL_RECIPIENT = process.env.MANUAL_RECIPIENT;

// Default recipients
const DEFAULT_RECIPIENTS = [
  'sanju.gupta@aisglass.com',
  'mayank.tomar@aisglass.com',
  'krishna.verma@aisglass.com',
  'nidhi.tiwari@aisglass.com'
];

// Configuration
const CONFIG = {
  SHEET_NAME: 'Dealer Data',
  EXPIRY_THRESHOLD_DAYS: 30,
  FOLLOW_UP_THRESHOLD_DAYS: 3
};

// Google Sheets credentials
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Check if today is a holiday (Sunday or 2nd/4th Saturday)
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

// Format date for display
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

// Find column index by keywords
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
  const auth = new google.auth.JWT(
    SERVICE_ACCOUNT_EMAIL,
    null,
    PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${CONFIG.SHEET_NAME}!A:ZZ`,
  });

  const rows = response.data.values;
  if (!rows || rows.length < 2) {
    console.log('No data found in sheet');
    return { birthday: [], anniversary: [], showroomAnniversary: [], expiry: [], followUp: [] };
  }
  
  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  // Find column indices
  const col = {
    dealerName: findColumn(headers, ['Channel Partner']),
    city: findColumn(headers, ['City']),
    rm: findColumn(headers, ['RM']),
    expiry: findColumn(headers, ['Last Agreement Date', 'Expiry']),
    dob: findColumn(headers, ['Date of Birth']),
    showroomAnniversary: 42, // Column AQ (0-based index)
    anniversary: findColumn(headers, ['Marriage anniversary']),
    followUp: findColumn(headers, ['Follow-up Date', 'Next Follow Up']),
    status: findColumn(headers, ['Status'])
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
      status: row[col.status] || 'N/A'
    };
    
    // Birthday check
    if (dealerInfo.dob && isSameDayMonth(dealerInfo.dob, today)) {
      alerts.birthday.push(dealerInfo);
    }
    
    // Anniversary check
    if (dealerInfo.anniversary && isSameDayMonth(dealerInfo.anniversary, today)) {
      alerts.anniversary.push(dealerInfo);
    }
    
    // Showroom Anniversary check
    if (dealerInfo.showroomAnniversary && isSameDayMonth(dealerInfo.showroomAnniversary, today)) {
      alerts.showroomAnniversary.push(dealerInfo);
    }
    
    // Expiry check
    if (dealerInfo.expiry) {
      const diffDays = Math.ceil((dealerInfo.expiry - today) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= CONFIG.EXPIRY_THRESHOLD_DAYS) {
        alerts.expiry.push({ ...dealerInfo, daysLeft: diffDays });
      }
    }
    
    // Follow-up check
    if (dealerInfo.followUp) {
      const diffDays = Math.ceil((dealerInfo.followUp - today) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= CONFIG.FOLLOW_UP_THRESHOLD_DAYS) {
        alerts.followUp.push({ ...dealerInfo, daysLeft: diffDays });
      }
    }
  }
  
  return alerts;
}

// Build HTML email report
function buildHtmlReport(alerts, dateStr) {
  const style = 'style="border: 1px solid #ddd; padding: 8px; text-align: left;"';
  const headerStyle = 'style="background: linear-gradient(135deg, #C6A43B 0%, #A17F2E 100%); color: white; padding: 10px;"';
  
  let html = `<!DOCTYPE html>
  <html>
  <head><meta charset="UTF-8"></head>
  <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
    <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      <div style="background: linear-gradient(135deg, #C6A43B 0%, #A17F2E 100%); padding: 25px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🏢 AIS Dealer Management System</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Daily Alert & Celebration Report</p>
      </div>
      
      <div style="padding: 25px;">
        <div style="background-color: #f0f0f0; padding: 12px 20px; border-radius: 8px; margin-bottom: 25px; text-align: center;">
          <strong style="color: #C6A43B;">📅 Report Date: ${dateStr}</strong>
        </div>`;
  
  const categories = [
    { label: "🎂 Birthdays Today", data: alerts.birthday, dateField: 'dob', color: "#e91e63" },
    { label: "🏬 Showroom Anniversaries", data: alerts.showroomAnniversary, dateField: 'showroomAnniversary', color: "#00bcd4" },
    { label: "💍 Marriage Anniversaries", data: alerts.anniversary, dateField: 'anniversary', color: "#9c27b0" },
    { label: "⚠️ Agreement Expiries (30 Days)", data: alerts.expiry, dateField: 'expiry', color: "#f44336", extra: d => ` (${d.daysLeft} days left)` },
    { label: "📞 Upcoming Follow-ups", data: alerts.followUp, dateField: 'followUp', color: "#ff9800", extra: d => ` (${d.daysLeft} days left)` }
  ];
  
  for (const cat of categories) {
    html += `<h3 style="color: ${cat.color}; margin: 25px 0 15px 0;">${cat.label}</h3>`;
    
    if (cat.data.length === 0) {
      html += `<p style="color: #999; padding: 10px 0;">✨ No records found.</p>`;
    } else {
      html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th ${headerStyle}>Dealer Name</th>
            <th ${headerStyle}>City</th>
            <th ${headerStyle}>RM</th>
            <th ${headerStyle}>Date</th>
          </tr>
        </thead>
        <tbody>`;
      
      for (const item of cat.data) {
        const dateVal = item[cat.dateField];
        const dateStr = dateVal ? formatDate(dateVal) : '—';
        html += `<tr style="background-color: #f9f9f9;">
          <td ${style}>${item.name}</td>
          <td ${style}>${item.city}</td>
          <td ${style}>${item.rm}</td>
          <td ${style}>${dateStr}${cat.extra ? cat.extra(item) : ''}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }
  }
  
  html += `</div>
      <div style="text-align: center; padding: 20px; font-size: 11px; color: #888; border-top: 1px solid #e0e0e0; background-color: #f8f9fa;">
        <p>🚀 This is an automated report from <strong>AIS Command Center</strong></p>
        <p>For any queries, please contact the dashboard administrator</p>
        <p style="margin-top: 10px;">© 2026 AIS Windows | All Rights Reserved</p>
      </div>
    </div>
  </body>
  </html>`;
  
  return html;
}

// Send email using EmailJS
async function sendEmail(recipient, htmlBody, dateStr) {
  const templateParams = {
    to_email: recipient,
    date: dateStr,
    report_type: 'Birthday & Anniversary Alerts',
    notes: 'Automated daily celebration and alert report',
    message: htmlBody
  };

  console.log(`📧 Sending to: ${recipient}`);

  try {
    const response = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      templateParams,
      { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY }
    );
    console.log(`✅ Success: ${recipient}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed: ${recipient} - ${error.message}`);
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
  
  // Check EmailJS credentials
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    console.error('❌ Missing EmailJS credentials!');
    console.error('SERVICE_ID:', !!SERVICE_ID);
    console.error('TEMPLATE_ID:', !!TEMPLATE_ID);
    console.error('PUBLIC_KEY:', !!PUBLIC_KEY);
    console.error('PRIVATE_KEY:', !!PRIVATE_KEY);
    process.exit(1);
  }
  
  // Check Google Sheets credentials
  if (!SPREADSHEET_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Missing Google Sheets credentials!');
    console.error('SPREADSHEET_ID:', !!SPREADSHEET_ID);
    console.error('SERVICE_ACCOUNT_EMAIL:', !!SERVICE_ACCOUNT_EMAIL);
    console.error('PRIVATE_KEY:', !!PRIVATE_KEY);
    process.exit(1);
  }
  
  console.log('✅ All credentials found');
  
  // Get data from Google Sheet
  console.log('📊 Fetching data from Google Sheet...');
  const alerts = await getSheetData();
  
  console.log(`📊 Found: ${alerts.birthday.length} birthdays, ${alerts.anniversary.length} anniversaries, ${alerts.expiry.length} expiries, ${alerts.followUp.length} follow-ups`);
  
  // Build email
  const htmlBody = buildHtmlReport(alerts, dateStr);
  
  // Determine recipients
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`📧 Sending to ${recipients.length} recipients`);
  
  let successCount = 0;
  for (const recipient of recipients) {
    const success = await sendEmail(recipient, htmlBody, dateStr);
    if (success) successCount++;
    // Wait 2 seconds between emails
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
