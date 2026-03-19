export interface Palette {
  mode: 'dark' | 'light';
  vibrancy: { overlay: string; foreground: string };
  bg: { sidebar: string; base: string; surfaceLow: string; surface: string; elevated: string; hover: string };
  text: { primary: string; secondary: string; tertiary: string };
  border: { default: string; active: string; app: string };
  accent: { base: string; dim: string };
  status: { green: string; red: string; cyan: string; amber: string };
  diff: {
    insertedBg: string; insertedBorder: string; insertedText: string;
    deletedBg: string; deletedBorder: string; deletedText: string;
  };
  syntax: {
    keyword: string; name: string; property: string; function: string;
    constant: string; type: string; operator: string; string: string; comment: string;
  };
  terminal: {
    magenta: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

// Warm obsidian — neutral dark with amber-gold accent
// Backgrounds: hue 270 (subtle violet-grey), even L steps ~3%
// Text: neutral hue ~270, L steps: 93/64/45
export const obsidian: Palette = {
  mode: 'dark',
  vibrancy: { overlay: 'rgba(20, 18, 24, 0.3)', foreground: 'rgba(255, 255, 255, 0.85)' },
  bg: {
    sidebar:    'oklch(12.5% 0.004 270)',
    base:       'oklch(15%   0.004 270)',
    surfaceLow: 'oklch(16.75% 0.004 270)',
    surface:    'oklch(18.5% 0.004 270)',
    elevated: 'oklch(22%   0.005 270)',
    hover:    'oklch(26%   0.005 270)',
  },
  text: {
    primary:   'oklch(93% 0.006 270)',
    secondary: 'oklch(64% 0.01  270)',
    tertiary:  'oklch(45% 0.008 270)',
  },
  border: {
    default: 'oklch(100% 0 0 / 6%)',
    active:  'oklch(100% 0 0 / 12%)',
    app:     'oklch(100% 0 0 / 18%)',
  },
  accent: {
    base: 'oklch(75% 0.13 55)',
    dim:  'oklch(75% 0.13 55 / 12%)',
  },
  status: {
    green: 'oklch(72% 0.15 145)',
    red:   'oklch(64% 0.18 20)',
    cyan:  'oklch(72% 0.13 230)',
    amber: 'oklch(72% 0.13 60)',
  },
  diff: {
    insertedBg:     'oklch(72% 0.15 145 / 12%)',
    insertedBorder: 'oklch(72% 0.15 145 / 30%)',
    insertedText:   'oklch(72% 0.15 145 / 22%)',
    deletedBg:      'oklch(64% 0.18 20 / 12%)',
    deletedBorder:  'oklch(64% 0.18 20 / 30%)',
    deletedText:    'oklch(64% 0.18 20 / 22%)',
  },
  syntax: {
    keyword:  '#c586c0',  // pink-purple (VS Code Dark+)
    name:     '#9cdcfe',  // light blue
    property: '#4fc1ff',  // bright cyan
    function: '#dcdcaa',  // warm yellow
    constant: '#4ec9b0',  // teal
    type:     '#4ec9b0',  // teal
    operator: '#d4d4d4',  // light grey
    string:   '#ce9178',  // salmon
    comment:  '#6a9955',  // green
  },
  terminal: {
    magenta:       'oklch(68% 0.12 290)',
    brightRed:     'oklch(72% 0.16 18)',
    brightGreen:   'oklch(80% 0.09 148)',
    brightYellow:  'oklch(80% 0.13 70)',
    brightBlue:    'oklch(78% 0.09 230)',
    brightMagenta: 'oklch(78% 0.07 290)',
    brightCyan:    'oklch(80% 0.08 210)',
    brightWhite:   'oklch(98% 0 0)',
  },
};

// Porcelain — clean white with slate-blue accent
// Backgrounds: hue 260 (cool grey), even L steps ~2.5% descending from 100
// Text: hue ~260, L steps: 23/49/70
export const porcelain: Palette = {
  mode: 'light',
  vibrancy: { overlay: 'rgba(240, 240, 248, 0.7)', foreground: 'rgba(0, 0, 0, 0.7)' },
  bg: {
    sidebar:    'oklch(92%   0.008 260)',
    base:       'oklch(100%  0     0)',
    surfaceLow: 'oklch(98.5% 0.003 260)',
    surface:    'oklch(97%   0.005 260)',
    elevated: 'oklch(94.5% 0.006 260)',
    hover:    'oklch(92%   0.008 260)',
  },
  text: {
    primary:   'oklch(23% 0.01 260)',
    secondary: 'oklch(49% 0.015 260)',
    tertiary:  'oklch(70% 0.01  260)',
  },
  border: {
    default: 'oklch(0% 0 0 / 8%)',
    active:  'oklch(0% 0 0 / 16%)',
    app:     'oklch(0% 0 0 / 15%)',
  },
  accent: {
    base: 'oklch(55% 0.2 255)',
    dim:  'oklch(55% 0.2 255 / 10%)',
  },
  status: {
    green: 'oklch(55% 0.12 150)',
    red:   'oklch(55% 0.18 20)',
    cyan:  'oklch(55% 0.15 235)',
    amber: 'oklch(60% 0.13 55)',
  },
  diff: {
    insertedBg:     'oklch(55% 0.12 150 / 10%)',
    insertedBorder: 'oklch(55% 0.12 150 / 25%)',
    insertedText:   'oklch(55% 0.12 150 / 18%)',
    deletedBg:      'oklch(55% 0.18 20 / 10%)',
    deletedBorder:  'oklch(55% 0.18 20 / 25%)',
    deletedText:    'oklch(55% 0.18 20 / 18%)',
  },
  syntax: {
    keyword:  '#af00db',
    name:     '#001080',
    property: '#0070c1',
    function: '#795e26',
    constant: '#0000ff',
    type:     '#267f99',
    operator: '#000000',
    string:   '#a31515',
    comment:  '#008000',
  },
  terminal: {
    magenta:       'oklch(50% 0.16 290)',
    brightRed:     'oklch(50% 0.18 20)',
    brightGreen:   'oklch(45% 0.08 145)',
    brightYellow:  'oklch(52% 0.11 55)',
    brightBlue:    'oklch(50% 0.18 240)',
    brightMagenta: 'oklch(50% 0.16 290)',
    brightCyan:    'oklch(48% 0.07 200)',
    brightWhite:   'oklch(23% 0.01 260)',
  },
};

// Sandstone — warm parchment with burnt orange accent
// Backgrounds: hue 65 (warm sand), even L steps ~2.5%
// Text: hue ~55, warm brown tones
export const sandstone: Palette = {
  mode: 'light',
  vibrancy: { overlay: 'rgba(245, 235, 220, 0.7)', foreground: 'rgba(60, 40, 20, 0.8)' },
  bg: {
    sidebar:    'oklch(88%  0.03 65)',
    base:       'oklch(97%  0.015 65)',
    surfaceLow: 'oklch(95.5% 0.018 65)',
    surface:    'oklch(94%  0.02 65)',
    elevated: 'oklch(91%  0.025 65)',
    hover:    'oklch(88%  0.03 65)',
  },
  text: {
    primary:   'oklch(25% 0.03 55)',
    secondary: 'oklch(48% 0.04 55)',
    tertiary:  'oklch(68% 0.04 55)',
  },
  border: {
    default: 'oklch(40% 0.04 55 / 12%)',
    active:  'oklch(40% 0.04 55 / 22%)',
    app:     'oklch(40% 0.04 55 / 18%)',
  },
  accent: {
    base: 'oklch(58% 0.16 35)',
    dim:  'oklch(58% 0.16 35 / 10%)',
  },
  status: {
    green: 'oklch(55% 0.1 150)',
    red:   'oklch(55% 0.16 20)',
    cyan:  'oklch(55% 0.12 235)',
    amber: 'oklch(60% 0.12 55)',
  },
  diff: {
    insertedBg:     'oklch(55% 0.1 150 / 10%)',
    insertedBorder: 'oklch(55% 0.1 150 / 25%)',
    insertedText:   'oklch(55% 0.1 150 / 18%)',
    deletedBg:      'oklch(55% 0.16 20 / 10%)',
    deletedBorder:  'oklch(55% 0.16 20 / 25%)',
    deletedText:    'oklch(55% 0.16 20 / 18%)',
  },
  syntax: {
    keyword:  '#8b3e6f',  // warm purple
    name:     '#3a2812',  // dark brown
    property: '#2e6b5e',  // warm teal
    function: '#6a4e22',  // dark gold
    constant: '#1a5c8a',  // blue
    type:     '#4a7a3e',  // olive green
    operator: '#2e2e2e',  // near-black
    string:   '#8c3020',  // brick red
    comment:  '#6a8a50',  // muted green
  },
  terminal: {
    magenta:       'oklch(50% 0.12 290)',
    brightRed:     'oklch(50% 0.16 20)',
    brightGreen:   'oklch(46% 0.08 145)',
    brightYellow:  'oklch(52% 0.1  55)',
    brightBlue:    'oklch(48% 0.14 240)',
    brightMagenta: 'oklch(50% 0.12 290)',
    brightCyan:    'oklch(50% 0.06 195)',
    brightWhite:   'oklch(25% 0.03 55)',
  },
};

// Arctic — cool blue-tinted dark with teal accent
// Backgrounds: hue 240 (blue-grey), even L steps ~3%
// Text: hue ~240, L steps: 93/63/45
export const arctic: Palette = {
  mode: 'dark',
  vibrancy: { overlay: 'rgba(16, 22, 32, 0.3)', foreground: 'rgba(200, 220, 240, 0.85)' },
  bg: {
    sidebar:    'oklch(12%   0.012 240)',
    base:       'oklch(15%   0.01  240)',
    surfaceLow: 'oklch(16.75% 0.011 240)',
    surface:    'oklch(18.5% 0.012 240)',
    elevated: 'oklch(22%   0.013 240)',
    hover:    'oklch(26%   0.014 240)',
  },
  text: {
    primary:   'oklch(93% 0.012 240)',
    secondary: 'oklch(63% 0.015 240)',
    tertiary:  'oklch(45% 0.017 240)',
  },
  border: {
    default: 'oklch(70% 0.02 240 / 8%)',
    active:  'oklch(70% 0.02 240 / 16%)',
    app:     'oklch(70% 0.02 240 / 18%)',
  },
  accent: {
    base: 'oklch(78% 0.1 175)',
    dim:  'oklch(78% 0.1 175 / 12%)',
  },
  status: {
    green: 'oklch(75% 0.12 155)',
    red:   'oklch(70% 0.16 18)',
    cyan:  'oklch(75% 0.12 220)',
    amber: 'oklch(80% 0.13 70)',
  },
  diff: {
    insertedBg:     'oklch(75% 0.12 155 / 12%)',
    insertedBorder: 'oklch(75% 0.12 155 / 30%)',
    insertedText:   'oklch(75% 0.12 155 / 22%)',
    deletedBg:      'oklch(70% 0.16 18 / 12%)',
    deletedBorder:  'oklch(70% 0.16 18 / 30%)',
    deletedText:    'oklch(70% 0.16 18 / 22%)',
  },
  syntax: {
    keyword:  '#e0a0f0',  // bright purple
    name:     '#7ee8f0',  // vivid cyan
    property: '#6cc8ee',  // bright blue
    function: '#f0d878',  // strong gold
    constant: '#5oe8c0',  // bright teal
    type:     '#50e8c0',  // bright teal
    operator: '#e8f0f8',  // near-white
    string:   '#a8e070',  // bright green
    comment:  '#7888a8',  // steel grey
  },
  terminal: {
    magenta:       'oklch(72% 0.1  290)',
    brightRed:     'oklch(78% 0.1  18)',
    brightGreen:   'oklch(84% 0.07 155)',
    brightYellow:  'oklch(90% 0.1  70)',
    brightBlue:    'oklch(82% 0.08 220)',
    brightMagenta: 'oklch(82% 0.06 300)',
    brightCyan:    'oklch(86% 0.08 195)',
    brightWhite:   'oklch(98% 0 0)',
  },
};

export const palettes = { obsidian, porcelain, sandstone, arctic } as const;
export type PaletteName = keyof typeof palettes;
export const defaultPalette: PaletteName = 'obsidian';
