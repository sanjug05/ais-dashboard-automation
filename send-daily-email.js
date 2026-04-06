// send-daily-email.js
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

// Firestore REST API endpoint (not Realtime Database)
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/ais-showroom-dashboard/databases/(default)/documents';

// Helper to fetch Firestore collection
async function fetchCollection(collectionName) {
  try {
    const response = await fetch(`${FIRESTORE_URL}/${collectionName}`);
    const data = await response.json();
    
    if (!data.documents) return [];
    
    // Parse Firestore document format
    return data.documents.map(doc => {
      const fields = doc.fields;
      const result = { id: doc.name.split('/').pop() };
      
      // Convert Firestore fields to JavaScript values
      for (const [key, value] of Object.entries(fields)) {
        if (value.stringValue !== undefined) result[key] = value.stringValue;
        else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue);
        else if (value.doubleValue !== undefined) result[key] = parseFloat(value.doubleValue);
        else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
        else if (value.mapValue !== undefined) {
          // Handle nested objects (like data, documents, stageLog, flags)
          const nestedObj = {};
          if (value.mapValue.fields) {
            for (const [nestedKey, nestedValue] of Object.entries(value.mapValue.fields)) {
              if (nestedValue.stringValue !== undefined) nestedObj[nestedKey] = nestedValue.stringValue;
              else if (nestedValue.booleanValue !== undefined) nestedObj[nestedKey] = nestedValue.booleanValue;
              else if (nestedValue.mapValue !== undefined) {
                // Deep nested (for phase data)
                const deepObj = {};
                if (nestedValue.mapValue.fields) {
                  for (const [deepKey, deepValue] of Object.entries(nestedValue.mapValue.fields)) {
                    if (deepValue.stringValue !== undefined) deepObj[deepKey] = deepValue.stringValue;
                  }
                }
                nestedObj[nestedKey] = deepObj;
              }
            }
          }
          result[key] = nestedObj;
        }
        else if (value.arrayValue !== undefined) result[key] = value.arrayValue.values || [];
        else if (value.nullValue !== undefined) result[key] = null;
      }
      return result;
    });
  } catch (error) {
    console.error(`Error fetching ${collectionName}:`, error.message);
    return [];
  }
}

// EXACT Phase Configuration from your dashboard
const PHASES_CONFIG = [
  { id: 'dim',      name: "Dimensions Submission",         days: 5  },
  { id: 'cad',      name: "CAD Preparation",                days: 12 },
  { id: 'plan',     name: "Planning & Order Loading",       days: 15 },
  { id: 'civil',    name: "Structure & Civil Work",         days: 30 },
  { id: 'interior', name: "Interior Development",           days: 50 },
  { id: 'brand',    name: "Branding & Display Setup",       days: 65 },
  { id: 'window',   name: "Window Installation",            days: 85 },
  { id: 'launch',   name: "Final Handover / Launch",        days: 90 }
];

// Dealer stages
const STAGE_TARGETS = {
  'Interested': 0,
  'Shortlisted': 3,
  'CFT Selected': 8,
  'Documentation': 15,
  'Onboarded': 22
};

// EXACT calculateShowroomStats from your dashboard
function calculateShowroomStats(s) {
  if (!s || !s.startDate) return { pct: 0, avgDelay: 0 };
  const start = new Date(s.startDate + "T00:00:00");
  const today = new Date(); 
  today.setHours(0,0,0,0);
  let totalDelay = 0, comp = 0, delayCount = 0;

  if (isNaN(start.getTime())) return { pct: 0, avgDelay: 0 };

  PHASES_CONFIG.forEach(p => {
    const target = new Date(start);
    target.setDate(start.getDate() + p.days);

    const data = (s.data && s.data[p.id]) || {};
    if (data.actualDate) {
      comp++;
      const actual = new Date(data.actualDate + "T00:00:00");
      const d = Math.ceil((actual - target) / 86400000);
      if (d > 0) {
        totalDelay += d;
        delayCount++;
      }
    } else {
      const d = Math.ceil((today - target) / 86400000);
      if (d > 0) {
        totalDelay += d;
        delayCount++;
      }
    }
  });
  
  const avgDelay = delayCount > 0 ? Math.round(totalDelay / delayCount) : 0;
  const pct = Math.round((comp / PHASES_CONFIG.length) * 100);
  
  return { pct, avgDelay };
}

// Check if dealer is dropped
function isDropped(dealer) {
  const f = dealer.flags || {};
  return dealer.status === 'Dropped' || f.cftRejected === true || f.prospectBackout === true;
}

// Calculate dealer delay
function calculateDealerTimeline(d) {
  if (!d.startDate) return { isDelayed: false, delayDays: 0 };
  
  const start = new Date(d.startDate);
  const today = new Date();
  const daysElapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  
  const currentStage = d.currentStage || 'Interested';
  const targetDays = STAGE_TARGETS[currentStage] || 0;
  const delayDays = Math.max(0, daysElapsed - targetDays);
  const isDelayed = delayDays > 3;
  
  return { isDelayed, delayDays };
}

// Get formatted date in IST
function getFormattedDate() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istTime.getUTCDate()).padStart(2, '0');
  const hours = String(istTime.getUTCHours()).padStart(2, '0');
  const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istTime.getUTCSeconds()).padStart(2, '0');
  
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} IST`;
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

// Build HTML email
// Build HTML email - BEAUTIFUL VERSION
function buildHtmlReport(showrooms, dealers, dateStr) {
  let totalShowrooms = showrooms.length;
  let totalPct = 0;
  let completedShowrooms = 0;
  let activeDelayCount = 0;
  let totalAvgDelay = 0;
  
  for (const showroom of showrooms) {
    const stats = calculateShowroomStats(showroom);
    totalPct += stats.pct;
    if (stats.pct === 100) completedShowrooms++;
    if (stats.avgDelay > 0) {
      totalAvgDelay += stats.avgDelay;
      activeDelayCount++;
    }
  }
  
  const avgCompletion = totalShowrooms > 0 ? Math.round(totalPct / totalShowrooms) : 0;
  const globalAvgDelay = activeDelayCount > 0 ? Math.round(totalAvgDelay / activeDelayCount) : 0;
  
  let totalDealers = dealers.length;
  let activeDealers = 0;
  let completedDealers = 0;
  let delayedDealers = 0;
  
  for (const dealer of dealers) {
    if (dealer.status === 'Completed') {
      completedDealers++;
    } else if (!isDropped(dealer) && dealer.status === 'Active') {
      activeDealers++;
    }
    
    const timeline = calculateDealerTimeline(dealer);
    if (timeline.isDelayed) delayedDealers++;
  }
  
  let delayedMessage = '';
  if (globalAvgDelay > 0 || delayedDealers > 0) {
    delayedMessage = `⚠️ ${globalAvgDelay > 0 ? globalAvgDelay + ' showroomday(s)' : ''}${globalAvgDelay > 0 && delayedDealers > 0 ? ' and ' : ''}${delayedDealers > 0 ? delayedDealers + ' dealer(s)' : ''} are currently delayed. Please review the dashboard for details.`;
  } else {
    delayedMessage = '✅ No delayed projects at this time. All showrooms and dealers are on track! 🎉';
  }
  
  console.log(`📊 Showrooms: ${totalShowrooms} total, ${completedShowrooms} completed, Avg Delay: ${globalAvgDelay}`);
  console.log(`📊 Dealers: ${totalDealers} total, ${completedDealers} completed, ${delayedDealers} delayed`);
  
  return `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>AIS Command Center Report</title>

  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->

  <style>
    /* Mobile stacking (works in most mobile email apps, ignored by Outlook desktop) */
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .stack { display:block !important; width:100% !important; }
      .p-outer { padding: 12px !important; }
      .p-card { padding: 14px !important; }
      .num-big { font-size: 54px !important; }
      .num { font-size: 34px !important; }
      .num-main { font-size: 44px !important; }
    }
  </style>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f9; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; font-family:Segoe UI, Arial, sans-serif;">

  <!-- OUTER BG -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f6f9" style="background-color:#f4f6f9;">
    <tr>
      <td align="center" class="p-outer" style="padding:20px;">

        <!-- CONTAINER -->
        <!--[if mso]>
        <table role="presentation" width="700" cellspacing="0" cellpadding="0" border="0">
          <tr><td>
        <![endif]-->

        <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:700px; background-color:#ffffff; border-radius:12px; overflow:hidden;">
          
          <!-- HEADER (bgcolor ensures visible on system/Outlook) -->
          <tr>
            <td align="center" bgcolor="#1a3a5c" style="background-color:#1a3a5c; padding:20px; border-radius:12px 12px 0 0;">
              <div style="font-size:24px; line-height:30px; font-weight:700; color:#ffffff;">
                📊 AIS Command Center
              </div>
              <div style="margin-top:6px; font-size:14px; line-height:18px; color:#a8c8e8;">
                Daily Performance Report
              </div>
            </td>
          </tr>

          <!-- TWO COLUMN ROW (Desktop) -->
          <tr>
            <td style="padding:16px;">

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>

                  <!-- LEFT COLUMN -->
                  <td class="stack" width="50%" valign="top" style="padding:8px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff; border-radius:12px;">
                      <tr>
                        <td class="p-card" style="padding:16px; border:1px solid #eef1f5; border-radius:12px;">
                          <div style="font-size:18px; line-height:22px; font-weight:700; color:#1a3a5c; margin:0 0 16px 0;">
                            🏢 Showroom Performance
                          </div>

                          <div style="text-align:center;">
                            <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#666666; line-height:16px;">
                              TOTAL SHOWROOMS
                            </div>
                            <div class="num-main" style="font-size:48px; line-height:52px; font-weight:800; color:#111111; margin:6px 0 12px 0;">
                              24
                            </div>
                          </div>

                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" width="33.33%" style="padding:8px;">
                                <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666;">COMPLETED</div>
                                <div class="num" style="font-size:32px; line-height:36px; font-weight:800; color:#28a745; margin-top:6px;">1</div>
                              </td>
                              <td align="center" width="33.33%" style="padding:8px;">
                                <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666;">AVG COMPLETION</div>
                                <div class="num" style="font-size:32px; line-height:36px; font-weight:800; color:#ffc107; margin-top:6px;">28%</div>
                              </td>
                              <td align="center" width="33.33%" style="padding:8px;">
                                <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666;">AVG DELAY</div>
                                <div class="num" style="font-size:32px; line-height:36px; font-weight:800; color:#dc3545; margin-top:6px; white-space:nowrap;">82 DAYS</div>
                              </td>
                            </tr>
                          </table>

                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- RIGHT COLUMN -->
                  <td class="stack" width="50%" valign="top" style="padding:8px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff; border-radius:12px;">
                      <tr>
                        <td class="p-card" style="padding:16px; border:1px solid #eef1f5; border-radius:12px;">
                          <div style="font-size:18px; line-height:22px; font-weight:700; color:#1a3a5c; margin:0 0 16px 0;">
                            🚗 Dealer Onboarding
                          </div>

                          <div style="text-align:center;">
                            <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#666666; line-height:16px;">
                              TOTAL DEALERS
                            </div>
                            <div class="num-main" style="font-size:48px; line-height:52px; font-weight:800; color:#111111; margin:6px 0 12px 0;">
                              15
                            </div>
                          </div>

                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" width="33.33%" style="padding:8px;">
                                <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666;">ACTIVE</div>
                                <div class="num" style="font-size:32px; line-height:36px; font-weight:800; color:#28a745; margin-top:6px;">15</div>
                              </td>
                              <td align="center" width="33.33%" style="padding:8px;">
                                <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666;">ONBOARDED</div>
                                <div class="num" style="font-size:32px; line-height:36px; font-weight:800; color:#666666; margin-top:6px;">0</div>
                              </td>
                              <td align="center" width="33.33%" style="padding:8px;">
                                <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#666666;">DELAYED</div>
                                <div class="num" style="font-size:32px; line-height:36px; font-weight:800; color:#dc3545; margin-top:6px;">14</div>
                              </td>
                            </tr>
                          </table>

                        </td>
                      </tr>
                    </table>
                  </td>

                </tr>
              </table>

            </td>
          </tr>

          <!-- URGENT SECTION (bgcolor fixes the "white box" on system) -->
          <tr>
            <td style="padding:0 16px 16px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#dc3545" style="background-color:#dc3545; border-radius:12px;">
                <tr>
                  <td align="center" style="padding:22px 18px; color:#ffffff;">

                    <div style="font-size:16px; line-height:20px; font-weight:800; letter-spacing:2px; text-transform:uppercase;">
                      ⚠️ URGENT ACTION REQUIRED
                    </div>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
                      <tr>

                        <td class="stack" width="50%" align="center" valign="top" style="padding:8px;">
                          <div style="font-size:13px; line-height:16px; opacity:0.95;">
                            DELAYED SHOWROOMS
                          </div>
                          <div class="num-big" style="font-size:64px; line-height:66px; font-weight:900; margin:6px 0; color:#ffffff;">
                            82
                          </div>
                          <div style="font-size:14px; line-height:18px; font-weight:800; color:#ffffff;">
                            DAYS
                          </div>
                        </td>

                        <td class="stack" width="50%" align="center" valign="top" style="padding:8px;">
                          <div style="font-size:13px; line-height:16px; opacity:0.95;">
                            DELAYED DEALERS
                          </div>
                          <div class="num-big" style="font-size:64px; line-height:66px; font-weight:900; margin:6px 0; color:#ffffff;">
                            14
                          </div>
                          <div style="font-size:14px; line-height:18px; font-weight:800; color:#ffffff;">
                            DEALERS
                          </div>
                        </td>

                      </tr>
                    </table>

                    <div style="margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.35); font-size:14px; line-height:18px; color:#ffffff;">
                      ⚡ Please review the dashboard immediately and take corrective action
                    </div>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" bgcolor="#f8f9fa" style="background-color:#f8f9fa; padding:16px; font-size:12px; line-height:16px; color:#999999; border-radius:0 0 12px 12px; border-top:1px solid #e6e6e6;">
              This is an automated report from AIS Command Center<br>
              © 2024 AIS Windows | All Rights Reserved
            </td>
          </tr>

        </table>

        <!--[if mso]>
          </td></tr>
        </table>
        <![endif]-->

      </td>
    </tr>
  </table>

</body>
</html>
`;
}

// Send email
async function sendEmail(recipient, htmlBody, dateStr) {
  const templateParams = {
    to_email: recipient,
    subject: `📊 AIS Dashboard Report - ${dateStr}`,
    date: dateStr,
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

// Main function
async function main() {
  console.log('🚀 Starting dashboard email report...');
  const dateStr = getFormattedDate();
  console.log(`Time: ${dateStr}`);
  
  if (!MANUAL_RECIPIENT && isHoliday()) {
    console.log('📅 Today is a holiday. Skipping automated email report.');
    process.exit(0);
  }
  
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
    console.error('❌ Missing EmailJS credentials!');
    process.exit(1);
  }
  
  console.log('✅ EmailJS credentials found');
  
  console.log('📡 Fetching showrooms from Firestore...');
  const showrooms = await fetchCollection('showrooms');
  console.log(`📡 Found ${showrooms.length} showrooms`);
  
  console.log('📡 Fetching dealers from Firestore...');
  const dealers = await fetchCollection('dealerOnboarding');
  console.log(`📡 Found ${dealers.length} dealers`);
  
  const htmlBody = buildHtmlReport(showrooms, dealers, dateStr);
  
  let recipients = MANUAL_RECIPIENT && MANUAL_RECIPIENT.trim() 
    ? [MANUAL_RECIPIENT] 
    : DEFAULT_RECIPIENTS;
  
  console.log(`📧 Sending to ${recipients.length} recipients`);
  
  let successCount = 0;
  for (const recipient of recipients) {
    const success = await sendEmail(recipient, htmlBody, dateStr);
    if (success) successCount++;
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n📬 Done: ${successCount}/${recipients.length} successful`);
  if (successCount === 0) process.exit(1);
  console.log('🎉 All emails sent successfully!');
}

main().catch(err => { console.error('❌ Script error:', err); process.exit(1); });
