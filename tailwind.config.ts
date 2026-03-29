import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['Geist', 'system-ui', 'sans-serif'],
        serif: ['DM Serif Display', 'Georgia', 'serif'],
        mono:  ['DM Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        navy:    { DEFAULT: '#07101F', 2: '#0C1728', 3: '#122038' },
        accent:  { DEFAULT: '#3D8EFF', 2: '#00D4FF' },
        teal:    { DEFAULT: '#0FC9A0' },
        amber:   { DEFAULT: '#F59E0B' },
        danger:  { DEFAULT: '#E03C3C' },
        surface: { DEFAULT: '#F4F6FA', 2: '#EDF0F7' },
        border:  { DEFAULT: '#DDE2EC' },
        tx: {
          1: '#080F1D',
          2: '#4A5568',
          3: '#8A95A8',
        },
      },
      borderRadius: {
        DEFAULT: '0px',
        none: '0px',
        pill: '2px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
export default config;
