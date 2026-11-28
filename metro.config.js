const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// The web platform (apps/web) and local dev tooling have their own node_modules; keep them
// out of the mobile bundle graph.
config.resolver.blockList = [/apps\/web\/.*/, /supabase\/local\/.*/];

module.exports = withNativeWind(config, { input: './global.css' });
