let modulePath = './dist/server.js';
try { modulePath = require.resolve('@tsconfig-helper/language-server/bin/tsconfig-helper-language-server.js'); } catch { }
module.exports = require(modulePath);
