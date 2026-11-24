const fs = require('fs');
const path = require('path');

const EXPECTED_BAILEYS_VERSION = '6.7.24';
const START_MARKER = '    const requestPairingCode = async (phoneNumber, customPairingCode) => {';
const END_MARKER = '\n    async function generatePairingKey() {';
const PATCH_MARKER = 'const result = await query({';

function buildPatchedPairingRequest() {
    return `    const requestPairingCode = async (phoneNumber, customPairingCode) => {
        const pairingCode = customPairingCode ?? bytesToCrockford(randomBytes(5));
        if (customPairingCode && customPairingCode?.length !== 8) {
            throw new Error('Custom pairing code must be exactly 8 chars');
        }

        authState.creds.pairingCode = pairingCode;
        const jid = jidEncode(phoneNumber, 's.whatsapp.net');
        const supportedBrowsers = ['Chrome', 'Firefox', 'IE', 'Opera', 'Safari', 'Edge'];
        const pairingBrowser = supportedBrowsers.includes(browser[1]) ? browser[1] : 'Chrome';
        const supportedPlatforms = ['Mac OS', 'Windows', 'Ubuntu'];
        const pairingPlatform = supportedPlatforms.includes(browser[0]) ? browser[0] : 'Mac OS';

        try {
            const result = await query({
                tag: 'iq',
                attrs: {
                    to: S_WHATSAPP_NET,
                    type: 'set',
                    xmlns: 'md'
                },
                content: [
                    {
                        tag: 'link_code_companion_reg',
                        attrs: {
                            jid,
                            stage: 'companion_hello',
                            should_show_push_notification: 'true'
                        },
                        content: [
                            {
                                tag: 'link_code_pairing_wrapped_companion_ephemeral_pub',
                                attrs: {},
                                content: await generatePairingKey()
                            },
                            {
                                tag: 'companion_server_auth_key_pub',
                                attrs: {},
                                content: authState.creds.noiseKey.public
                            },
                            {
                                tag: 'companion_platform_id',
                                attrs: {},
                                content: getCompanionPlatformId(pairingBrowser)
                            },
                            {
                                tag: 'companion_platform_display',
                                attrs: {},
                                content: \`${'${pairingBrowser} (${pairingPlatform})'}\`
                            },
                            {
                                tag: 'link_code_pairing_nonce',
                                attrs: {},
                                content: '0'
                            }
                        ]
                    }
                ]
            });

            if (!result) {
                throw new Boom('Timed out waiting for pairing code response', { statusCode: DisconnectReason.timedOut });
            }
        } catch (error) {
            if (authState.creds.pairingCode === pairingCode) {
                authState.creds.pairingCode = undefined;
            }
            throw error;
        }

        authState.creds.me = { id: jid, name: '~' };
        ev.emit('creds.update', authState.creds);
        return pairingCode;
    };
`;
}

function patchSocketSource(source) {
    const start = source.indexOf(START_MARKER);
    if (start < 0) {
        throw new Error('Could not find the Baileys 6.7.24 pairing-code function; refusing an unsafe patch.');
    }

    const end = source.indexOf(END_MARKER, start);
    if (end < 0) {
        throw new Error('Could not find the end of the Baileys pairing-code function; refusing an unsafe patch.');
    }

    const currentFunction = source.slice(start, end);
    if (currentFunction.includes(PATCH_MARKER) && currentFunction.includes("authState.creds.me = { id: jid, name: '~' }")) {
        return { source, changed: false };
    }
    if (!currentFunction.includes('await sendNode({') || !currentFunction.includes('return authState.creds.pairingCode;')) {
        throw new Error('Baileys pairing-code source differs from the expected 6.7.24 implementation; refusing an unsafe patch.');
    }

    return {
        source: source.slice(0, start) + buildPatchedPairingRequest() + source.slice(end),
        changed: true,
    };
}

function applyPatch() {
    const entryPath = require.resolve('@whiskeysockets/baileys');
    const packageRoot = path.resolve(path.dirname(entryPath), '..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    if (packageJson.version !== EXPECTED_BAILEYS_VERSION) {
        throw new Error(`Expected @whiskeysockets/baileys ${EXPECTED_BAILEYS_VERSION}, found ${packageJson.version}; review the patch before changing versions.`);
    }

    const socketPath = path.join(packageRoot, 'lib', 'Socket', 'socket.js');
    const original = fs.readFileSync(socketPath, 'utf8');
    const result = patchSocketSource(original);
    if (result.changed) {
        fs.writeFileSync(socketPath, result.source);
        console.log('Applied WhatsApp pairing acknowledgement patch to Baileys 6.7.24.');
    } else {
        console.log('Baileys pairing acknowledgement patch is already applied.');
    }
}

if (require.main === module) {
    applyPatch();
}

module.exports = { patchSocketSource, applyPatch };
