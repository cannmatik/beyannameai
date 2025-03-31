import { AuthProvider } from "@/app/context/AuthContext";
import AuthCheck from "@/components/AuthCheck";

export const metadata = {
  title: {
    default: "Analyse Easy",
    template: "Analyse Easy - %s",
  },
  icons: {
    icon: "/favicon.ico?v=1",
  },
};

export function generateViewport() {
  return {
    width: "device-width",
    initialScale: 1,
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body className="m-0 p-0 h-screen bg-gray-100 font-montserrat overflow-x-hidden">
        <AuthProvider>
          <div className="max-w-5xl mx-auto p-8 h-screen flex flex-col bg-[#fafafa] border border-[#e0e0e0] rounded-md overflow-x-hidden">
            <AuthCheck>
              <main className="flex-1 overflow-x-hidden">{children}</main>
            </AuthCheck>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}