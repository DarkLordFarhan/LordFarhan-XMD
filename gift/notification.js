function normalizeWhatsAppJid(value) {
    if (typeof value !== 'string') return null;
    const localPart = value.trim().split('@')[0].split(':')[0];
    const digits = localPart.replace(/\D/g, '');
    if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
    return digits + '@s.whatsapp.net';
}

const PAIRING_SUCCESS_TEXT = '✅ Pairing completed successfully for DLORD FARHAN MD.';

async function sendPairingSuccessAlert(sock, configuredNumber, linkedJid) {
    const recipientJid = normalizeWhatsAppJid(configuredNumber);
    const linkedNumberJid = normalizeWhatsAppJid(linkedJid || '');
    if (!recipientJid || recipientJid === linkedNumberJid) return false;
    if (!sock || typeof sock.sendMessage !== 'function') return false;
    await sock.sendMessage(recipientJid, { text: PAIRING_SUCCESS_TEXT });
    return true;
}

module.exports = { normalizeWhatsAppJid, sendPairingSuccessAlert };
