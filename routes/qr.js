const { 
    giftedId,
    removeFile
} = require('../gift');
const { SESSION_PREFIX, BOT_REPO } = require('../config');
const { isConfigured, saveSession } = require('../gift/sessionStore');
const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("baileys");

const sessionDir = path.join(__dirname, "session");

router.get('/session', async (req, res) => {
    const id = giftedId();
    const sessionType = (req.query.type || 'short').toLowerCase();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            await removeFile(path.join(sessionDir, id));
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log(version);
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        try {
            let Gifted = giftedConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Gifted.ev.on('creds.update', saveCreds);
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr);
                    if (!res.headersSent) {
                        res.send(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>LordFarhanBot | QR CODE</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                <style>
                                    body {
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        min-height: 100vh;
                                        margin: 0;
                                        background-color: #0a0006;
                                        font-family: Arial, sans-serif;
                                        color: #fff;
                                        text-align: center;
                                        padding: 20px;
                                        box-sizing: border-box;
                                    }
                                    .container {
                                        width: 100%;
                                        max-width: 600px;
                                    }
                                    .qr-container {
                                        position: relative;
                                        margin: 20px auto;
                                        width: 300px;
                                        height: 300px;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                    }
                                    .qr-code {
                                        width: 300px;
                                        height: 300px;
                                        padding: 10px;
                                        background: white;
                                        border-radius: 20px;
                                        box-shadow: 0 0 0 10px rgba(255,45,149,0.1),
                                                    0 0 0 20px rgba(255,45,149,0.05),
                                                    0 0 30px rgba(255,45,149,0.25);
                                    }
                                    .qr-code img {
                                        width: 100%;
                                        height: 100%;
                                    }
                                    h1 {
                                        color: #ff2d95;
                                        margin: 0 0 15px 0;
                                        font-size: 28px;
                                        font-weight: 800;
                                        text-shadow: 0 0 10px rgba(255,45,149,0.4);
                                    }
                                    p {
                                        color: #e6a9c8;
                                        margin: 20px 0;
                                        font-size: 16px;
                                    }
                                    .back-btn {
                                        display: inline-block;
                                        padding: 12px 25px;
                                        margin-top: 15px;
                                        background: linear-gradient(135deg, #ff2d95 0%, #b3005c 100%);
                                        color: white;
                                        text-decoration: none;
                                        border-radius: 30px;
                                        font-weight: bold;
                                        border: none;
                                        cursor: pointer;
                                        transition: all 0.3s ease;
                                        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                                    }
                                    .back-btn:hover {
                                        transform: translateY(-2px);
                                        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
                                    }
                                    .pulse {
                                        animation: pulse 2s infinite;
                                    }
                                    @keyframes pulse {
                                        0% {
                                            box-shadow: 0 0 0 0 rgba(255,45,149,0.4);
                                        }
                                        70% {
                                            box-shadow: 0 0 0 15px rgba(255,45,149,0);
                                        }
                                        100% {
                                            box-shadow: 0 0 0 0 rgba(255,45,149,0);
                                        }
                                    }
                                    @media (max-width: 480px) {
                                        .qr-container {
                                            width: 260px;
                                            height: 260px;
                                        }
                                        .qr-code {
                                            width: 220px;
                                            height: 220px;
                                        }
                                        h1 {
                                            font-size: 24px;
                                        }
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    ${(sessionType === 'short' && !isConfigured()) ? `
                                    <div style="margin-bottom:18px;padding:12px 16px;border-radius:12px;border:1px solid rgba(255,45,149,0.3);background:rgba(90,0,50,0.25);display:flex;align-items:flex-start;gap:10px;text-align:left;">
                                        <span style="font-size:1rem;margin-top:1px;flex-shrink:0;">ℹ️</span>
                                        <p style="margin:0;font-size:0.78rem;color:#ffb3d9;line-height:1.5;">Session store is not configured &mdash; automatically switched to <strong>Long session</strong>.</p>
                                    </div>` : ''}
                                    <h1>LORDFARHANBOT QR CODE</h1>
                                    <div class="qr-container">
                                        <div class="qr-code pulse">
                                            <img src="${qrImage}" alt="QR Code"/>
                                        </div>
                                    </div>
                                    <p>Scan this QR code with your phone to connect</p>
                                    <a href="./" class="back-btn">Back</a>
                                </div>
                                <script>
                                    document.querySelector('.back-btn').addEventListener('mousedown', function(e) {
                                        this.style.transform = 'translateY(1px)';
                                        this.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
                                    });
                                    document.querySelector('.back-btn').addEventListener('mouseup', function(e) {
                                        this.style.transform = 'translateY(-2px)';
                                        this.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
                                    });
                                </script>
                            </body>
                            </html>
                        `);
                        responseSent = true;
                    }
                }

                if (connection === "open") {
                    await delay(8000);

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 10;

                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, id, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 100) {
                                    sessionData = data;
                                    break;
                                }
                            }
                            await delay(2000);
                            attempts++;
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        await cleanUpSession();
                        return;
                    }

                    try {
                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');
                        const fullSession = SESSION_PREFIX + b64data;

                        let msgText, msgButtons;
                        if (isConfigured() && sessionType === 'short') {
                            const shortId = await saveSession(fullSession);
                            const shortSession = `${SESSION_PREFIX}${shortId}`;
                            msgText = `*SESSION ID ✅*\n\n${shortSession}`;
                            msgButtons = [
                                { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Copy Session', copy_code: shortSession }) },
                                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Visit Bot Repo', url: BOT_REPO }) }
                            ];
                        } else {
                            msgText = `*SESSION ID ✅*\n\n${fullSession}`;
                            msgButtons = [
                                { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Copy Session', copy_code: fullSession }) },
                                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Visit Bot Repo', url: BOT_REPO }) }
                            ];
                        }

                        await sendButtons(Gifted, Gifted.user.id, {
                            title: '',
                            text: msgText,
                            buttons: msgButtons
                        });

                        await delay(2000);
                        await Gifted.ws.close();
                    } catch (sendError) {
                        console.error("Error sending session:", sendError);
                    } finally {
                        await cleanUpSession();
                    }

                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                    await delay(10000);
                    GIFTED_QR_CODE();
                }
            });
        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent) {
                res.status(500).json({ code: "QR Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await GIFTED_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
