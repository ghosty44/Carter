'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { id: 'planning',   href: '/',          icon: '📅', label: 'Planning'    },
  { id: 'recettes',   href: '/recipes',   icon: '📖', label: 'Recettes'    },
  { id: 'drive',      href: '/drive',     icon: '🛒', label: 'Drive'       },
  { id: 'historique', href: '/history',   icon: '📊', label: 'Historique'  },
]

interface SidebarProps {
  user: { name: string; avatarUrl?: string }
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = user.name[0]?.toUpperCase() ?? '?'

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>La Table</h1>
        <span>de la famille</span>
      </div>

      {NAV_ITEMS.map(({ id, href, icon, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={id}
            href={href}
            className={`nav-item ${active ? 'active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </Link>
        )
      })}

      <div className="sidebar-bottom">
        <div className="user-pill">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="avatar" style={{ objectFit: 'cover' }} />
          ) : (
            <div className="avatar">{initial}</div>
          )}
          <div className="user-info">
            <div style={{ fontSize: 13, fontWeight: 500 }}>{user.name.split(' ')[0]}</div>
            <button
              onClick={signOut}
              style={{ fontSize: 11, opacity: 0.5, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
