const assert = require('assert');
const { EventEmitter } = require('events');
const { requestPairingCodeWhenReady } = require('../routes/pairingCode');

function createSocket(requestPairingCode = async () => 'ABCD1234') {
    return {
        authState: { creds: { registered: false } },
        ev: new EventEmitter(),
        requestPairingCode,
    };
}

async function testWaitsForQrReadinessAndRequestsOnce() {
    const requestedNumbers = [];
    const socket = createSocket(async (number) => {
        requestedNumbers.push(number);
        return 'ABCD1234';
    });

    const result = requestPairingCodeWhenReady(socket, '254712345678', { timeoutMs: 100 });
    socket.ev.emit('connection.update', { connection: 'connecting' });
    assert.deepStrictEqual(requestedNumbers, [], 'must not request while only connecting');

    socket.ev.emit('connection.update', { qr: 'qr-ready' });
    assert.strictEqual(await result, 'ABCD1234');
    socket.ev.emit('connection.update', { qr: 'duplicate-qr' });
    assert.deepStrictEqual(requestedNumbers, ['254712345678']);
    assert.strictEqual(socket.ev.listenerCount('connection.update'), 0, 'readiness listener should be removed');
}

async function testRejectsIfSocketClosesBeforeQr() {
    const socket = createSocket();
    const result = requestPairingCodeWhenReady(socket, '254712345678', { timeoutMs: 100 });
    socket.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: new Error('socket closed') } });
    await assert.rejects(result, /socket closed/);
    assert.strictEqual(socket.ev.listenerCount('connection.update'), 0);
}

async function testTimesOutWithoutQr() {
    const socket = createSocket();
    await assert.rejects(
        requestPairingCodeWhenReady(socket, '254712345678', { timeoutMs: 5 }),
        /Timed out waiting/,
    );
    assert.strictEqual(socket.ev.listenerCount('connection.update'), 0);
}

async function testRejectsInvalidNumber() {
    const socket = createSocket();
    await assert.rejects(requestPairingCodeWhenReady(socket, '+254 712 345 678'), /10–15 digits/);
    assert.strictEqual(socket.ev.listenerCount('connection.update'), 0);
}

async function testAbortsWhenBrowserCancelsRequest() {
    const socket = createSocket();
    const controller = new AbortController();
    const result = requestPairingCodeWhenReady(socket, '254712345678', {
        timeoutMs: 1000,
        signal: controller.signal,
    });
    controller.abort(new Error('browser cancelled'));
    await assert.rejects(result, /browser cancelled/);
    assert.strictEqual(socket.ev.listenerCount('connection.update'), 0);
}

async function testRejectsAnAlreadyAbortedRequest() {
    const socket = createSocket();
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));
    await assert.rejects(
        requestPairingCodeWhenReady(socket, '254712345678', { signal: controller.signal }),
        /already cancelled/,
    );
    assert.strictEqual(socket.ev.listenerCount('connection.update'), 0);
}

async function run() {
    await testWaitsForQrReadinessAndRequestsOnce();
    await testRejectsIfSocketClosesBeforeQr();
    await testTimesOutWithoutQr();
    await testRejectsInvalidNumber();
    await testAbortsWhenBrowserCancelsRequest();
    await testRejectsAnAlreadyAbortedRequest();
    console.log('Pairing-code readiness tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
