import './globals.css';
import { Poppins, Inter } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: 'NEGOXIA STORE',
  description: 'Jasa Digital Terpercaya – Discord, Design, Roblox',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={poppins.className}>{children}</body>
    </html>
  );
}
