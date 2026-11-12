const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Optional: Meta WhatsApp Cloud API Credentials (leave as default for offline/console demo)
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'YOUR_META_CLOUD_API_TOKEN';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || 'YOUR_WHATSAPP_PHONE_ID';

/**
 * POST /api/loans/apply
 * Matches the fetch('/api/loans/apply') call in public/index.html
 */
app.post('/api/loans/apply', async (req, res) => {
  const {
    fullName,
    mtnMomoNumber,
    whatsappNumber,
    loanAmount,
    repaymentMonths,
    monthlyInstallment,
    totalRepayable
  } = req.body;

  // 1. Validate incoming fields
  if (!fullName || !mtnMomoNumber || !loanAmount) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'Please provide your Full Name, Registered MTN MoMo Number, and Loan Amount.'
    });
  }

  // 2. Demo Approval Rule (Approves loans up to 500,000; declines higher amounts for demo testing)
  const numericAmount = Number(loanAmount);
  const isApproved = numericAmount > 0 && numericAmount <= 500000;
  const referenceId = `MOMO-LN-${Date.now().toString().slice(-6)}`;

  const decisionMessage = isApproved
    ? `Y'ello ${fullName}! Your MTN MoMo Easy Loan of ${numericAmount.toLocaleString()} for ${repaymentMonths} month(s) is APPROVED. Monthly repayment: ${Number(monthlyInstallment).toLocaleString()} (Total: ${Number(totalRepayable).toLocaleString()}). Ref: ${referenceId}.`
    : `Y'ello ${fullName}, your MTN MoMo Easy Loan request of ${numericAmount.toLocaleString()} was DECLINED as it exceeds the instant demo limit of 500,000. Ref: ${referenceId}.`;

  // 3. Dispatch WhatsApp Feedback Notification
  let whatsappDispatched = false;
  const targetWhatsApp = whatsappNumber || mtnMomoNumber;

  if (targetWhatsApp && WHATSAPP_TOKEN !== 'YOUR_META_CLOUD_API_TOKEN') {
    try {
      await sendWhatsAppNotification(targetWhatsApp, decisionMessage);
      whatsappDispatched = true;
    } catch (error) {
      console.error('WhatsApp API Dispatch Error:', error.response?.data || error.message);
    }
  } else {
    // Console log for live demo verification without live Meta API keys
    console.log('\n========================================');
    console.log(`[DEMO WHATSAPP ALERT -> ${targetWhatsApp}]`);
    console.log(decisionMessage);
    console.log('========================================\n');
    whatsappDispatched = true;
  }

  // 4. Simulate 3-second approval processing delay so the yellow spinner is visible
  setTimeout(() => {
    res.json({
      status: isApproved ? 'APPROVED' : 'DECLINED',
      referenceId,
      mtnMomoNumber,
      whatsappDispatched,
      message: decisionMessage
    });
  }, 3000);
});

/**
 * Helper: Send real WhatsApp message via Meta Graph API
 */
async function sendWhatsAppNotification(recipientPhone, textBody) {
  const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
  const url = `https://facebook.com{PHONE_NUMBER_ID}/messages`;

  return axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: textBody }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

// Fallback route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MTN MoMo Easy Loan Demo running at http://localhost:${PORT}`);
});
