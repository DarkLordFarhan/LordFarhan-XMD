const assert = require('assert');
const { normalizeWhatsAppJid, sendPairingSuccessAlert } = require('../gift/notification');

async function run() {
    assert.strictEqual(normalizeWhatsAppJid('+1 (555) 555-0123'), '15555550123@s.whatsapp.net');
    assert.strictEqual(normalizeWhatsAppJid('12345'), null);

    const sent = [];
    const socket = { sendMessage: async (to, content) => sent.push({ to, content }) };
    assert.strictEqual(await sendPairingSuccessAlert(socket, '+1 555 555 0124', '15555550123@s.whatsapp.net'), true);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, '15555550124@s.whatsapp.net');
    assert.ok(!/pairing code|session id|LordBot~/i.test(sent[0].content.text));

    assert.strictEqual(await sendPairingSuccessAlert(socket, '+1 555 555 0123', '15555550123@s.whatsapp.net'), false);
    assert.strictEqual(await sendPairingSuccessAlert(socket, '', '15555550123@s.whatsapp.net'), false);
    assert.strictEqual(sent.length, 1);
    console.log('Pairing notification tests passed.');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
