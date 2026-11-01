// Icons render as empty, non-accessible Text in tests (fonts are native assets).
const React = require('react');
const { Text } = require('react-native');

function Icon() {
  return React.createElement(Text, { accessible: false }, '');
}
Icon.glyphMap = {};
module.exports = new Proxy({ __esModule: true }, { get: (t, key) => (key in t ? t[key] : Icon) });
