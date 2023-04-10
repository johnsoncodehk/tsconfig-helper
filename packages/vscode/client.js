let modulePath = './dist/client.js';
try { modulePath = require.resolve('./out/extension.js'); } catch { }
module.exports = require(modulePath);
