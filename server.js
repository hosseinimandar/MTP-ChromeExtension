// --- 1. Import Dependencies ---
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const cors = require('cors');
const NowPaymentsApi = require('@nowpaymentsio/nowpayments-api-js');

// --- 2. Initialize App and Services ---
const app = express();
app.use(cors());
// IMPORTANT: Use a custom body parser to get the raw body needed for signature verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
const PORT = process.env.PORT || 3000;

const npApi = new NowPaymentsApi({ apiKey: process.env.NOWPAYMENTS_API_KEY });
const NP_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET; // Load the IPN secret key

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            api_key TEXT UNIQUE NOT NULL,
            subscription_expires_at DATE
        )`);
    }
});

// --- 3. API Endpoints ---

// Registration
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) { return res.status(400).json({ error: 'Email and password are required.' }); }
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) { return res.status(500).json({ error: 'Error hashing password.' }); }
        const apiKey = crypto.randomBytes(16).toString('hex');
        const sql = `INSERT INTO users (email, password_hash, api_key) VALUES (?, ?, ?)`;
        db.run(sql, [email, hash, apiKey], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) { return res.status(409).json({ error: 'This email is already registered.' }); }
                return res.status(500).json({ error: 'Database error.' });
            }
            res.status(201).json({ message: 'User registered successfully.' });
        });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) { return res.status(400).json({ error: 'Email and password are required.' }); }
    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], (err, user) => {
        if (err) { return res.status(500).json({ error: 'Database error.' }); }
        if (!user) { return res.status(404).json({ error: 'User not found.' }); }
        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (err) { return res.status(500).json({ error: 'Error comparing passwords.' }); }
            if (result) {
                const isSubActive = user.subscription_expires_at ? new Date(user.subscription_expires_at) > new Date() : false;
                res.status(200).json({
                    message: 'Login successful.',
                    apiKey: user.api_key,
                    email: user.email,
                    subActive: isSubActive,
                    subExpires: user.subscription_expires_at
                });
            } else {
                res.status(401).json({ error: 'Invalid credentials.' });
            }
        });
    });
});

// Create Payment
app.post('/api/create-payment', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) {
        return res.status(401).json({ error: 'API Key is required.' });
    }

    const sql = `SELECT email FROM users WHERE api_key = ?`;
    db.get(sql, [apiKey], async (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'Invalid API Key.' });
        }

        try {
            const invoice = await npApi.createInvoice({
                price_amount: 1,
                price_currency: 'usd',
                order_id: `MTP-${user.email}-${Date.now()}`,
                order_description: '1 Month Subscription for Multi Tier Proxier',
                ipn_callback_url: 'http://ex.mtproxier.com:3000/api/nowpayments-webhook',
            });
            res.status(200).json({ invoice_url: invoice.invoice_url });
        } catch (error) {
            console.error('--- NOWPAYMENTS API ERROR ---', error);
            res.status(500).json({
                error: 'Failed to create payment invoice.',
                details: error.message
            });
        }
    });
});

// Webhook for payments
app.post('/api/nowpayments-webhook', (req, res) => {
    const signature = req.headers['x-nowpayments-sig'];
    console.log('Received webhook. Verifying signature...');

    if (!NP_IPN_SECRET) {
        console.error("IPN Secret key is not configured in .env file.");
        return res.status(500).send("Server configuration error.");
    }

    try {
        const hmac = crypto.createHmac('sha512', NP_IPN_SECRET);
        hmac.update(req.rawBody);
        const calculatedSignature = hmac.digest('hex');

        if (calculatedSignature !== signature) {
            console.error("Webhook verification failed: Invalid signature.");
            return res.status(401).send('Invalid signature.');
        }

        console.log("Webhook signature VERIFIED.");
        const paymentData = req.body;

        if (paymentData.payment_status === 'finished') {
            const orderIdParts = paymentData.order_id.split('-');
            const userEmail = orderIdParts[1];

            if (userEmail) {
                const newExpiryDate = new Date();
                newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
                const sql = `UPDATE users SET subscription_expires_at = ? WHERE email = ?`;
                db.run(sql, [newExpiryDate.toISOString(), userEmail], function (err) {
                    if (err) {
                        console.error('Database error updating subscription:', err.message);
                    } else {
                        console.log(`Subscription for ${userEmail} successfully updated. Expires on: ${newExpiryDate.toISOString()}`);
                    }
                });
            } else {
                console.error('Could not extract email from order_id:', paymentData.order_id);
            }
        }
        res.sendStatus(200);

    } catch (error) {
        console.error("Error during webhook processing:", error);
        res.status(500).send('Internal server error.');
    }
});

// --- ✅ New API: Status check ---
app.post('/api/status', (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) {
        return res.status(400).json({ error: 'API Key is required.' });
    }

    const sql = `SELECT email, subscription_expires_at FROM users WHERE api_key = ?`;
    db.get(sql, [apiKey], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error.' });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const isSubActive = user.subscription_expires_at
            ? new Date(user.subscription_expires_at) > new Date()
            : false;

        res.json({
            email: user.email,
            apiKey: apiKey,
            subActive: isSubActive,
            subExpires: user.subscription_expires_at
        });
    });
});

// --- 4. Start the Server ---
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});
