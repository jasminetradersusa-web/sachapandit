export const metadata = {
  title: 'Sacha Pandit — AI Vedic Astrology',
  description: 'Free personalized birth chart readings from Sacha Pandit',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: '#0a0e27', color: 'white', margin: 0 }}>
        {children}
      </body>
    </html>
  )
}
