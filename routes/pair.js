const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const { SESSION_PREFIX, BOT_REPO, PAIRING_NOTIFY_NUMBER } = require('../config');
const { isConfigured, saveSession } = require('../gift/sessionStore');
const { sendPairingSuccessAlert } = require('../gift/notification');
const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const { requestPairingCodeWhenReady } = require('./pairingCode');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");
const OWNER_STATUS_COOLDOWN_MS = 60 * 1000;
let lastOwnerStatusAt = 0;
async function notifyOwnerAfterPairing(sock) {
    if (!PAIRING_NOTIFY_NUMBER) return;
    const now = Date.now();
    if (now - lastOwnerStatusAt < OWNER_STATUS_COOLDOWN_MS) return;
    lastOwnerStatusAt = now;
    try {
        await sendPairingSuccessAlert(sock, PAIRING_NOTIFY_NUMBER, sock.user?.id);
    } catch {
        console.warn("[PAIR] Owner status notification failed.");
    }
}

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number;
    const digits = typeof num === 'string' ? num.replace(/\D/g, '') : '';
    if (!/^\d{10,15}$/.test(digits)) {
        return res.status(400).json({ code: "Enter a valid phone number with country code (10–15 digits)." });
    }
    num = digits;
    const sessionType = (req.query.type || 'short').toLowerCase();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_PAIR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log(version);
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        let Gifted = null;
        let pairingFailed = false;
        try {
            Gifted = giftedConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.ubuntu("Chrome"),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Gifted.ev.on('creds.update', saveCreds);
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(20000);

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 15;

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
                            await delay(8000);
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

                        await delay(5000);

                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 5;

                        while (sendAttempts < maxSendAttempts && !sessionSent) {
                            try {
                                await sendButtons(Gifted, Gifted.user.id, {
                                    title: '',
                                    text: msgText,
                                    buttons: msgButtons
                                });
                                sessionSent = true;
                            } catch (sendError) {
                                console.error("Send error:", sendError);
                                sendAttempts++;
                                if (sendAttempts < maxSendAttempts) {
                                    await delay(3000);
                                }
                            }
                        }

                        if (sessionSent) {
                            await notifyOwnerAfterPairing(Gifted);
                        }

                        await delay(3000);
                        await Gifted.ws.close();
                    } catch (sessionError) {
                        console.error("Session processing error:", sessionError);
                    } finally {
                        await cleanUpSession();
                    }

                } else if (connection === "close" && responseSent && !pairingFailed && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                    console.warn("[PAIR] Socket closed after code delivery; request a fresh code instead of silently replacing the displayed code.");
                    await cleanUpSession();
                }
            });

            if (!Gifted.authState.creds.registered) {
                const code = await requestPairingCodeWhenReady(Gifted, num);
                if (!responseSent && !res.headersSent) {
                    res.json({ code, fallback: sessionType === 'short' && !isConfigured() });
                    responseSent = true;
                }
            }
        } catch (err) {
            pairingFailed = true;
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(503).json({ code: "Service is Currently Unavailable" });
                responseSent = true;
            }
            if (Gifted?.ws?.close) {
                try {
                    await Gifted.ws.close();
                } catch (closeError) {
                    console.warn("Pairing socket close failed.", closeError?.message || closeError);
                }
            }
            await cleanUpSession();
        }
    }

    try {
        await GIFTED_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(503).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
