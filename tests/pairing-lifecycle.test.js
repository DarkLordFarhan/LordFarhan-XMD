const assert = require('assert');
const {
    RESTART_REQUIRED_STATUS_CODE,
    isExpectedPairingRestart,
    reconnectAfterPairingRestart,
} = require('../routes/pairingLifecycle');

async function run() {
    const restart = { error: { output: { statusCode: RESTART_REQUIRED_STATUS_CODE } } };
    assert.strictEqual(isExpectedPairingRestart(restart), true);
    assert.strictEqual(isExpectedPairingRestart({ error: { output: { statusCode: 401 } } }), false);
    assert.strictEqual(isExpectedPairingRestart({ error: { output: { statusCode: 408 } } }), false);
    assert.strictEqual(isExpectedPairingRestart(undefined), false);

    let reconnectCount = 0;
    assert.strictEqual(await reconnectAfterPairingRestart(restart, async () => { reconnectCount++; }), true);
    assert.strictEqual(reconnectCount, 1);
    assert.strictEqual(await reconnectAfterPairingRestart({ error: { output: { statusCode: 401 } } }, async () => { reconnectCount++; }), false);
    assert.strictEqual(reconnectCount, 1, 'non-restart disconnects must not trigger the reconnect callback');
    console.log('Pairing lifecycle tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
