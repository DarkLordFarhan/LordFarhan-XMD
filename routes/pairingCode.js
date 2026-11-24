const DEFAULT_PAIRING_READY_TIMEOUT_MS = 30000;

function requestPairingCodeWhenReady(sock, phoneNumber, { timeoutMs = DEFAULT_PAIRING_READY_TIMEOUT_MS } = {}) {
    if (!sock?.ev || typeof sock.ev.on !== 'function' || typeof sock.requestPairingCode !== 'function') {
        return Promise.reject(new TypeError('A Baileys socket with pairing-code support is required.'));
    }
    if (!/^\d{10,15}$/.test(phoneNumber)) {
        return Promise.reject(new TypeError('Phone number must contain 10–15 digits, including country code.'));
    }
    if (sock.authState?.creds?.registered) {
        return Promise.reject(new Error('This WhatsApp session is already registered.'));
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        let requestStarted = false;
        let timeout;

        const finish = (error, code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            sock.ev.removeListener?.('connection.update', onUpdate);
            if (error) reject(error);
            else resolve(code);
        };

        const onUpdate = ({ qr, connection, lastDisconnect } = {}) => {
            if (qr && !requestStarted) {
                requestStarted = true;
                Promise.resolve()
                    .then(() => sock.requestPairingCode(phoneNumber))
                    .then((code) => {
                        if (typeof code !== 'string' || !code.trim()) {
                            throw new Error('Baileys returned an empty pairing code.');
                        }
                        finish(null, code);
                    })
                    .catch((error) => finish(error));
                return;
            }

            if (connection === 'close' && !requestStarted) {
                const error = lastDisconnect?.error || new Error('WhatsApp disconnected before the pairing code was ready.');
                finish(error);
            }
        };

        timeout = setTimeout(() => {
            finish(new Error('Timed out waiting for WhatsApp to prepare a pairing code.'));
        }, timeoutMs);

        sock.ev.on('connection.update', onUpdate);
    });
}

module.exports = { requestPairingCodeWhenReady, DEFAULT_PAIRING_READY_TIMEOUT_MS };
