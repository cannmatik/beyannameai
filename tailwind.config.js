/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}", // app dizinindeki tüm JS/TS dosyaları
    "./components/**/*.{js,ts,jsx,tsx}", // components dizinindeki dosyalar
    "./lib/**/*.{js,ts,jsx,tsx}", // lib dizinindeki dosyalar
  ],
  theme: {
    extend: {
      // İsteğe bağlı: Özel Tailwind teması eklemek istersen buraya yazabilirsin
    },
  },
  plugins: [],
};