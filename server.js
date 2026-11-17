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

// 1. Receive Application from public/index.html -> Send to Telegram
app.post('/api/loans/apply', async (req, res) => {
    const { fullName, mtnNumber, loanService, loanAmount, repaymentPeriod } = req.body;
    const id = 'LOAN-' + Math.floor(100000 + Math.random() * 900000);

    loans[id] = { id, fullName, mtnNumber, loanService, loanAmount, repaymentPeriod, status: 'PENDING' };

    const message = [
        '🔔 *NEW MTN MOMO LOAN REQUEST*',
        `🆔 *ID:* \`${id}\``,
        `👤 *Name:* ${fullName}`,
        `📱 *MTN Number:* ${mtnNumber}`,
        `💼 *Service:* ${loanService}`,
        `💰 *Amount:* ${loanAmount}`,
        `📅 *Period:* ${repaymentPeriod}`
    ].join('\n');

    try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
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

// 2. Frontend Polls This Endpoint While Waiting for Approval
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

                if (loans[id]) {
                    loans[id].status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
                }

                await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
                    callback_query_id: cb.id,
                    text: decision === 'APPROVE' ? 'Loan Approved!' : 'Loan Declined!'
                });

                await axios.post(`${TELEGRAM_API}/editMessageText`, {
                    chat_id: cb.message.chat.id,
                    message_id: cb.message.message_id,
                    text: `${cb.message.text}\n\n*Admin Decision:* ${decision === 'APPROVE' ? '✅ APPROVED' : '❌ DECLINED'}`,
                    parse_mode: 'Markdown'
                });
            }
        }
    } catch (err) {
        // Ignore timeout/network hiccups and retry
    } finally {
        setTimeout(pollTelegramUpdates, 1000);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    pollTelegramUpdates();
});


