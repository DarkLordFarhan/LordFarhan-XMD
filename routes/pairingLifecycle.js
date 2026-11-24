const RESTART_REQUIRED_STATUS_CODE = 515;

function isExpectedPairingRestart(lastDisconnect) {
    return lastDisconnect?.error?.output?.statusCode === RESTART_REQUIRED_STATUS_CODE;
}

async function reconnectAfterPairingRestart(lastDisconnect, reconnect) {
    if (!isExpectedPairingRestart(lastDisconnect)) return false;
    await reconnect();
    return true;
}

module.exports = {
    RESTART_REQUIRED_STATUS_CODE,
    isExpectedPairingRestart,
    reconnectAfterPairingRestart,
};
