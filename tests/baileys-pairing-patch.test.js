const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { patchSocketSource } = require('../scripts/patch-baileys-pairing');

const packageRoot = path.resolve(path.dirname(require.resolve('@whiskeysockets/baileys')), '..');
const packageInfo = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
assert.strictEqual(packageInfo.version, '6.7.24', 'pairing patch is pinned to the reviewed Baileys release');

const source = fs.readFileSync(path.join(packageRoot, 'lib', 'Socket', 'socket.js'), 'utf8');
const start = source.indexOf('const requestPairingCode = async (phoneNumber, customPairingCode) => {');
const end = source.indexOf('async function generatePairingKey()', start);
assert.ok(start >= 0 && end > start, 'Baileys pairing request function should be present');
const pairingFunction = source.slice(start, end);
assert.ok(pairingFunction.includes('const result = await query({'), 'pairing code request must await WhatsApp acknowledgement');
assert.ok(!pairingFunction.includes('await sendNode({'), 'pairing request must not return after a fire-and-forget send');
assert.ok(pairingFunction.includes('authState.creds.pairingCode = undefined'), 'failed pairing attempts must clear the transient code');
assert.ok(pairingFunction.indexOf('const result = await query({') < pairingFunction.indexOf("authState.creds.me = { id: jid, name: '~' }"), 'credentials must be marked for pairing only after WhatsApp accepts the request');

const idempotent = patchSocketSource(source);
assert.strictEqual(idempotent.changed, false, 'postinstall patch should be safe to run repeatedly');
console.log('Baileys pairing acknowledgement patch tests passed.');
