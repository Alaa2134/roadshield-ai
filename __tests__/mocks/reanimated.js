/* global jest */
// Minimal synchronous stand-in for the parts of react-native-reanimated the app uses.
// Animations resolve to their final value immediately; layout animations are no-ops.
const React = require('react');
const RN = require('react-native');

const chain = () => {
  const b = {};
  for (const m of ['delay', 'duration', 'springify', 'damping', 'stiffness', 'easing', 'withInitialValues', 'withCallback', 'reduceMotion']) {
    b[m] = () => b;
  }
  return b;
};

const createAnimatedComponent = (Component) =>
  React.forwardRef(function AnimatedComponent({ entering, exiting, layout, style, ...rest }, ref) {
    return React.createElement(Component, { ...rest, style, ref });
  });

const Animated = {
  View: createAnimatedComponent(RN.View),
  Text: createAnimatedComponent(RN.Text),
  Image: createAnimatedComponent(RN.Image),
  ScrollView: createAnimatedComponent(RN.ScrollView),
  FlatList: createAnimatedComponent(RN.FlatList),
  createAnimatedComponent,
};

const identity = (v) => v;
module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue: (init) => React.useRef({ value: init }).current,
  useAnimatedStyle: (fn) => fn(),
  useDerivedValue: (fn) => ({ value: fn() }),
  useReducedMotion: () => false,
  withSpring: identity,
  withTiming: identity,
  withDelay: (_d, v) => v,
  withRepeat: identity,
  withSequence: (...vals) => vals[vals.length - 1],
  cancelAnimation: () => undefined,
  runOnJS: (fn) => fn,
  interpolate: (v) => v,
  Easing: new Proxy({}, { get: () => (...args) => (args.length ? identity : identity) }),
  FadeIn: chain(),
  FadeInDown: chain(),
  FadeInRight: chain(),
  FadeInUp: chain(),
  FadeOutLeft: chain(),
  FadeOutUp: chain(),
  ZoomIn: chain(),
};
