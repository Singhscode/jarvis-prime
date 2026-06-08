import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          400: "#48be84",
          500: "#25a266",
        },
        dark: {
          900: "#0a0f0d",
          800: "#0f1612",
          700: "#162018",
        },
      },
    },
  },
  plugins: [],
};
export default config;
