/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    tint: tintColorDark,
    icon: '#CCCCCC',
    tabIconDefault: '#CCCCCC',
    tabIconSelected: tintColorDark,
  },
};

export const CATEGORY_COLORS = [
  '#FF6B6B', '#F06595', '#CC5DE8', '#845EF7', '#5C7CFA',
  '#339AF0', '#22B8CF', '#20C997', '#51CF66', '#94D82D',
  '#FCC419', '#FF922B', '#FF6F00', '#E8590C', '#E03131',
  '#C92A2A', '#A61E4D', '#862E9C', '#6741D9', '#3B5BDB',
  '#1971C2', '#0B7285', '#087F5B', '#2B8A3E', '#5C940D',
  '#E67700', '#D9480F', '#C2255C', '#9C36B5', '#7048E8',
  '#4263EB', '#1C7ED6', '#1098AD', '#12B886', '#37B24D',
  '#82C91E', '#FAB005', '#FD7E14', '#F03E3E', '#D6336C',
  '#AE3EC9', '#7950F2', '#4C6EF5', '#228BE6', '#15AABF',
  '#40C057', '#74B816', '#F59F00', '#E8590C', '#D9480F'
];

export const CATEGORY_COLOR_MAP = CATEGORY_COLORS.map(color => {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  return {
    bg: color,
    text: yiq >= 128 ? '#111827' : '#FFFFFF'
  };
});
