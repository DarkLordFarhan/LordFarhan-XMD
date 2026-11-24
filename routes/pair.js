const {
    giftedId,
    removeFile
} = require('../gift');
const { SESSION_PREFIX, BOT_REPO, PAIRING_NOTIFY_NUMBER } = require('../config');
const { isConfigured, saveSession } = require('../gift/sessionStore');
const { sendPairingSuccessAlert } = require('../gift/notification');
const { isExpectedPairingRestart, reconnectAfterPairingRestart } = require('./pairingLifecycle');
const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { sendButtons } = require('gifted-btns');
const { requestPairingCodeWhenReady } = require('./pairingCode');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const router = express.Router();
const sessionDir = path.join(__dirname, 'session');
const OWNER_STATUS_COOLDOWN_MS = 60 * 1000;
const SESSION_CREDS_WAIT_MS = 10000;
const SESSION_CREDS_POLL_MS = 250;
let lastOwnerStatusAt = 0;

async function notifyOwnerAfterPairing(sock) {
    if (!PAIRING_NOTIFY_NUMBER) return;
    const now = Date.now();
    if (now - lastOwnerStatusAt < OWNER_STATUS_COOLDOWN_MS) return;
    lastOwnerStatusAt = now;
    try {
        await sendPairingSuccessAlert(sock, PAIRING_NOTIFY_NUMBER, sock.user?.id);
    } catch {
        console.warn('[PAIR] Owner status notification failed.');
    }
}

router.get('/', async (req, res) => {
    const id = giftedId();
    const rawNumber = req.query.number;
    const digits = typeof rawNumber === 'string' ? rawNumber.replace(/\D/g, '') : '';
    if (!/^\d{10,15}$/.test(digits)) {
        return res.status(400).json({ code: 'Enter a valid phone number with country code (10–15 digits).' });
    }

    const sessionType = String(req.query.type || 'short').toLowerCase();
    let responseSent = false;
    let sessionCleanedUp = false;
    let clientDisconnected = false;
    let stopping = false;
    let openHandlerRunning = false;
    let restartRequiredCount = 0;
    let Gifted = null;
    let scheduleCredsSave = null;
    let credsSaveChain = Promise.resolve();
    let credsSaveError = null;
    const requestAbortController = new AbortController();

    async function cleanUpSession() {
        if (sessionCleanedUp) return;
        try {
            await removeFile(path.join(sessionDir, id));
        } catch (cleanupError) {
            console.error('[PAIR] Session cleanup failed:', cleanupError?.message || cleanupError);
        }
        sessionCleanedUp = true;
    }

    async function closeSocket(socket) {
        if (!socket?.ws?.close) return;
        try {
            await socket.ws.close();
        } catch (closeError) {
            console.warn('[PAIR] Socket close failed:', closeError?.message || closeError);
        }
    }

    async function flushCredsWrites() {
        await credsSaveChain;
        if (credsSaveError) {
            throw new Error(`Could not persist WhatsApp credentials: ${credsSaveError.message || credsSaveError}`);
        }
    }

    async function waitForPersistedSession() {
        const credsPath = path.join(sessionDir, id, 'creds.json');
        const deadline = Date.now() + SESSION_CREDS_WAIT_MS;
        let lastReadError;

        while (Date.now() < deadline) {
            await flushCredsWrites();
            try {
                if (fs.existsSync(credsPath)) {
                    const data = fs.readFileSync(credsPath);
                    if (data && data.length > 100) return data;
                }
            } catch (readError) {
                lastReadError = readError;
            }
            await delay(SESSION_CREDS_POLL_MS);
        }

        const suffix = lastReadError ? ` (${lastReadError.message || lastReadError})` : '';
        throw new Error(`Timed out waiting for WhatsApp credentials to be saved${suffix}.`);
    }

    async function sendSessionToOwner(socket) {
        if (openHandlerRunning || stopping) return;
        openHandlerRunning = true;

        try {
            const sessionData = await waitForPersistedSession();
            const compressedData = zlib.gzipSync(sessionData);
            const fullSession = SESSION_PREFIX + compressedData.toString('base64');

            let msgText;
            let msgButtons;
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

            let sessionSent = false;
            let sendAttempts = 0;
            const maxSendAttempts = 5;
            while (sendAttempts < maxSendAttempts && !sessionSent) {
                try {
                    await sendButtons(socket, socket.user.id, {
                        title: '',
                        text: msgText,
                        buttons: msgButtons
                    });
                    sessionSent = true;
                } catch (sendError) {
                    console.error('[PAIR] Session notification attempt failed:', sendError?.message || sendError);
                    sendAttempts++;
                    if (sendAttempts < maxSendAttempts) await delay(3000);
                }
            }

            if (!sessionSent) throw new Error('WhatsApp linked, but the session notification could not be delivered.');
            await notifyOwnerAfterPairing(socket);
            await delay(1000);
        } catch (sessionError) {
            console.error('[PAIR] Session processing failed:', sessionError?.message || sessionError);
        } finally {
            openHandlerRunning = false;
            stopping = true;
            await closeSocket(socket);
            await cleanUpSession();
        }
    }

    async function handleConnectionUpdate(socket, update, createPairingSocket) {
        const { connection, lastDisconnect } = update || {};
        if (connection === 'open') {
            await sendSessionToOwner(socket);
            return;
        }
        if (connection !== 'close' || stopping) return;

        if (isExpectedPairingRestart(lastDisconnect) && restartRequiredCount < 1) {
            const reconnected = await reconnectAfterPairingRestart(lastDisconnect, async () => {
                restartRequiredCount++;
                console.info('[PAIR] WhatsApp requested a post-pair restart; reconnecting with saved credentials.');
                await flushCredsWrites();
                if (clientDisconnected) {
                    stopping = true;
                    await cleanUpSession();
                    return;
                }
                createPairingSocket();
            });
            if (reconnected) return;
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
            console.warn('[PAIR] WhatsApp logged out the pairing socket.');
            stopping = true;
            await cleanUpSession();
            return;
        }

        if (responseSent) {
            console.warn(`[PAIR] Socket closed before session delivery (status ${statusCode || 'unknown'}); request a fresh code.`);
            stopping = true;
            await cleanUpSession();
        }
    }

    async function handleSocketLifecycleError(error, socket) {
        console.error('[PAIR] Socket lifecycle error:', error?.message || error);
        if (!responseSent && !res.headersSent && !clientDisconnected) {
            res.status(503).json({ code: 'WhatsApp could not complete pairing. Please request a fresh code.' });
            responseSent = true;
        }
        stopping = true;
        await closeSocket(socket);
        await cleanUpSession();
    }

    res.on('close', () => {
        if (res.writableEnded || responseSent) return;
        clientDisconnected = true;
        requestAbortController.abort(new Error('Pair-code request was cancelled by the browser.'));
        void closeSocket(Gifted);
    });

    try {
        const { version } = await fetchLatestBaileysVersion();
        if (clientDisconnected) return;
        console.info('[PAIR] Starting Baileys with WhatsApp Web version:', version);
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        if (clientDisconnected) {
            await cleanUpSession();
            return;
        }

        scheduleCredsSave = (update) => {
            credsSaveError = null;
            credsSaveChain = credsSaveChain
                .catch(() => undefined)
                .then(() => saveCreds(update))
                .catch((error) => {
                    credsSaveError = error;
                    console.error('[PAIR] Credentials could not be saved:', error?.message || error);
                });
            return credsSaveChain;
        };

        const createPairingSocket = () => {
            const socket = giftedConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
                },
                printQRInTerminal: false,
                logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Gifted = socket;
            socket.ev.on('creds.update', scheduleCredsSave);
            socket.ev.on('connection.update', update => {
                void handleConnectionUpdate(socket, update, createPairingSocket)
                    .catch(error => handleSocketLifecycleError(error, socket));
            });
            return socket;
        };

        const socket = createPairingSocket();
        if (clientDisconnected) {
            stopping = true;
            await closeSocket(socket);
            await cleanUpSession();
            return;
        }

        if (!socket.authState.creds.registered) {
            const code = await requestPairingCodeWhenReady(socket, digits, { signal: requestAbortController.signal });
            await flushCredsWrites();
            if (!responseSent && !res.headersSent && !clientDisconnected) {
                res.json({ code, fallback: sessionType === 'short' && !isConfigured() });
                responseSent = true;
            }
        }
    } catch (err) {
        console.error('[PAIR] Pair-code request failed:', err?.message || err);
        if (!responseSent && !res.headersSent && !clientDisconnected) {
            const timedOut = /timed out|timeout/i.test(err?.message || '');
            res.status(timedOut ? 504 : 503).json({
                code: timedOut
                    ? 'WhatsApp took too long to prepare a pairing code. Please reload and try again.'
                    : 'WhatsApp is currently unavailable. Please try again.'
            });
            responseSent = true;
        }
        stopping = true;
        await closeSocket(Gifted);
        await cleanUpSession();
    }
});

module.exports = router;
