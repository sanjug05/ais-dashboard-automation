// birthday-alerts.js
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

// Parse DD/MM/YYYY date - FIXED VERSION
function parseSpecificDate(val) {
  if (!val) return null;
  
  // If already a valid Date object
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  
  // Handle string DD/MM/YYYY
  if (typeof val === 'string') {
    // Check for DD/MM/YYYY format
    let parts;
    if (val.includes('/')) {
      parts = val.split('/');
    } else if (val.includes('-')) {
      parts = val.split('-');
    } else {
      return null;
    }
    
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      // Validate the date is valid
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  // Handle Excel serial number
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date;
  }
  
  return null;
}

// Check if same day and month (for birthdays/anniversaries)
function isSameDayMonth(d1, d2) {
  if (!d1 || !d2) return false;
  return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth();
}

// Find column index by keywords
function findColumn(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const headText = headers[i]?.toString().toLowerCase().trim() || '';
    for (const keyword of keywords) {
      if (headText === keyword.toLowerCase() || headText.includes(keyword.toLowerCase())) {
        return i;
      }
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
    
    // Log headers for debugging
    console.log('📋 Sheet Headers found:', headers.slice(0, 10));
    
    const col = {
      dealerName: findColumn(headers, ['Channel Partner', 'Dealer Name', 'Partner']),
      city: findColumn(headers, ['City', 'Location']),
      rm: findColumn(headers, ['RM', 'Relationship Manager']),
      expiry: findColumn(headers, ['Last Agreement Date', 'Expiry', 'Expiry Date', 'Agreement Expiry']),
      dob: findColumn(headers, ['Date of Birth', 'DOB', 'Birth Date']),
      showroomAnniversary: findColumn(headers, ['Showroom Anniversary', 'Showroom Date']),
      anniversary: findColumn(headers, ['Marriage anniversary', 'Anniversary', 'Wedding Anniversary']),
      followUp: findColumn(headers, ['Follow-up Date', 'Next Follow Up', 'Follow Up']),
    };
    
    console.log('📋 Column mapping:', {
      dealerName: col.dealerName,
      city: col.city,
      rm: col.rm,
      dob: col.dob,
      anniversary: col.anniversary,
      expiry: col.expiry,
      followUp: col.followUp
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const alerts = {
      birthday: [],
      anniversary: [],
      showroomAnniversary: [],
      expiry: [],
      followUp: []
    };
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      const dob = parseSpecificDate(row[col.dob]);
      const anniversary = parseSpecificDate(row[col.anniversary]);
      const showroomAnniversary = parseSpecificDate(row[col.showroomAnniversary]);
      const expiry = parseSpecificDate(row[col.expiry]);
      const followUp = parseSpecificDate(row[col.followUp]);
      
      const dealerInfo = {
        name: row[col.dealerName] || 'Unknown Dealer',
        city: row[col.city] || 'N/A',
        rm: row[col.rm] || 'N/A',
        dob: dob,
        anniversary: anniversary,
        showroomAnniversary: showroomAnniversary,
        expiry: expiry,
        followUp: followUp,
      };
      
      // Debug log for first few rows
      if (i < 3) {
        console.log(`📝 Row ${i + 2}:`, {
          name: dealerInfo.name,
          dob: dealerInfo.dob ? formatDate(dealerInfo.dob) : 'null',
          anniversary: dealerInfo.anniversary ? formatDate(dealerInfo.anniversary) : 'null',
          expiry: dealerInfo.expiry ? formatDate(dealerInfo.expiry) : 'null',
        });
      }
      
      // Birthday check
      if (dealerInfo.dob && isSameDayMonth(dealerInfo.dob, today)) {
        console.log(`🎂 Birthday today: ${dealerInfo.name}`);
        alerts.birthday.push(dealerInfo);
      }
      
      // Anniversary check
      if (dealerInfo.anniversary && isSameDayMonth(dealerInfo.anniversary, today)) {
        console.log(`💍 Anniversary today: ${dealerInfo.name}`);
        alerts.anniversary.push(dealerInfo);
      }
      
      // Showroom Anniversary check
      if (dealerInfo.showroomAnniversary && isSameDayMonth(dealerInfo.showroomAnniversary, today)) {
        console.log(`🏬 Showroom Anniversary today: ${dealerInfo.name}`);
        alerts.showroomAnniversary.push(dealerInfo);
      }
      
      // Expiry check (within 30 days, including today)
      if (dealerInfo.expiry) {
        const diffDays = Math.ceil((dealerInfo.expiry - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= CONFIG.EXPIRY_THRESHOLD_DAYS) {
          console.log(`⚠️ Expiry in ${diffDays} days: ${dealerInfo.name}`);
          alerts.expiry.push({ ...dealerInfo, daysLeft: diffDays });
        }
      }
      
      // Follow-up check
      if (dealerInfo.followUp) {
        const diffDays = Math.ceil((dealerInfo.followUp - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= CONFIG.FOLLOW_UP_THRESHOLD_DAYS) {
          console.log(`📞 Follow-up in ${diffDays} days: ${dealerInfo.name}`);
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
function buildHtmlReport(alerts, dateStr) {
  let html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif;">
      <h2 style="color: #C6A43B;">🎉 AIS Dealer Celebrations & Alerts</h2>
      <p><strong>Date:</strong> ${dateStr}</p>
      <hr>
      
      <h3 style="color: #e91e63;">🎂 Birthdays Today</h3>`;
  
  if (alerts.birthday.length === 0) {
    html += `<p>✨ No birthdays today.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.birthday) {
      html += `<li><strong>${item.name}</strong> - ${item.city} (RM: ${item.rm})</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<h3 style="color: #9c27b0;">💍 Marriage Anniversaries</h3>`;
  if (alerts.anniversary.length === 0) {
    html += `<p>✨ No anniversaries today.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.anniversary) {
      html += `<li><strong>${item.name}</strong> - ${item.city} (RM: ${item.rm})</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<h3 style="color: #00bcd4;">🏬 Showroom Anniversaries</h3>`;
  if (alerts.showroomAnniversary.length === 0) {
    html += `<p>✨ No showroom anniversaries today.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.showroomAnniversary) {
      html += `<li><strong>${item.name}</strong> - ${item.city} (RM: ${item.rm})</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<h3 style="color: #f44336;">⚠️ Agreement Expiries (Next 30 Days)</h3>`;
  if (alerts.expiry.length === 0) {
    html += `<p>✅ No expiries in next 30 days.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.expiry) {
      const urgency = item.daysLeft === 0 ? '⚠️ EXPIRES TODAY ⚠️' : `${item.daysLeft} days left`;
      html += `<li><strong>${item.name}</strong> - ${item.city} (RM: ${item.rm}) - <strong>${urgency}</strong></li>`;
    }
    html += `</ul>`;
  }
  
  html += `<h3 style="color: #ff9800;">📞 Upcoming Follow-ups</h3>`;
  if (alerts.followUp.length === 0) {
    html += `<p>✅ No follow-ups due.</p>`;
  } else {
    html += `<ul>`;
    for (const item of alerts.followUp) {
      const urgency = item.daysLeft === 0 ? '🔴 TODAY' : `${item.daysLeft} days left`;
      html += `<li><strong>${item.name}</strong> - ${item.city} (RM: ${item.rm}) - ${urgency}</li>`;
    }
    html += `</ul>`;
  }
  
  html += `<hr>
      <p style="font-size: 11px; color: #888; text-align: center;">
        This is an automated report from AIS Command Center<br>
        © 2026 AIS Windows | All Rights Reserved
      </p>
    </div>`;
  
  return html;
}

// Send email using REST API
async function sendEmail(recipient, htmlBody, dateStr) {
  const templateParams = {
    to_email: recipient,
    subject: `🎉 AIS Celebrations & Alerts - ${dateStr}`,
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
  
  console.log(`\n📊 Summary: ${alerts.birthday.length} birthdays, ${alerts.anniversary.length} anniversaries, ${alerts.expiry.length} expiries, ${alerts.followUp.length} follow-ups`);
  
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
