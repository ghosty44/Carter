'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/',        icon: '📅', label: 'Planning'   },
  { href: '/recipes', icon: '📖', label: 'Recettes'   },
  { href: '/drive',   icon: '🛒', label: 'Drive'      },
  { href: '/history', icon: '📊', label: 'Historique' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(({ href, icon, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link key={href} href={href} className={`bottom-nav-item ${active ? 'active' : ''}`}>
            <span className="bnav-icon">{icon}</span>
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
