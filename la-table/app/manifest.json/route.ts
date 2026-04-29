import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    name: 'La Table',
    short_name: 'La Table',
    description: 'Planificateur de repas familial',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF8F5',
    theme_color: '#C4724A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  })
}
