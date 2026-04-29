import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'La Table',
  description: 'Planificateur de repas familial',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#C4724A',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body style={
        // CSS variables for fonts — Google Fonts loaded via globals.css
        { fontFamily: "'DM Sans', system-ui, sans-serif" } as React.CSSProperties
      }>
        {children}
      </body>
    </html>
  )
}
