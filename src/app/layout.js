// 📂 src/app/layout.js

import './globals.css';

export const metadata = {
  title: "Beyanname Platformu",
  description: "Beyanname Analiz Platformu",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
