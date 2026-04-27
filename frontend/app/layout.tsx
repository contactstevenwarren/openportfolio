export const metadata = {
  title: 'OpenPortfolio',
  metadataBase: new URL('https://openportfolio.fly.dev'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111' }}>
        {children}
      </body>
    </html>
  );
}
