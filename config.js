require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 50900,
    SESSION_PREFIX: process.env.SESSION_PREFIX || "LordBot~",
    DATABASE_URL: process.env.DATABASE_URL,
    BOT_REPO: process.env.BOT_REPO || "https://github.com/DarkLordFarhan/LordFarhanBot-MD.git",
    PAIRING_NOTIFY_NUMBER: process.env.PAIRING_NOTIFY_NUMBER || '',
};
