export const metadata = {
  title: 'Sacha Pandit — Free AI Vedic Astrology',
  description: 'Get your personalized birth chart reading from Sacha Pandit. AI-powered Vedic astrology in Hinglish.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
