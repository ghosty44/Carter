'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, BookOpen, ShoppingCart, Star, Clock, Plus, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/',         label: 'Planning',       icon: CalendarDays },
  { href: '/recipes',  label: 'Recettes',        icon: BookOpen },
  { href: '/staples',  label: 'Incontournables', icon: Star },
  { href: '/cart',     label: 'Panier',          icon: ShoppingCart },
  { href: '/extras',   label: 'Articles extra',  icon: Plus },
  { href: '/history',  label: 'Historique',      icon: Clock },
]

interface SidebarProps {
  user: { name: string; avatarUrl?: string }
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 bg-white border-r border-cream-200 z-30">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-cream-200">
        <span className="text-2xl">🍽️</span>
        <span
          className="text-xl font-bold text-warm-800"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          La Table
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-terracotta-50 text-terracotta-600'
                  : 'text-warm-500 hover:bg-cream-50 hover:text-warm-800'
              )}
            >
              <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-terracotta-500' : '')} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-cream-200">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-terracotta-100 text-terracotta-600 flex items-center justify-center text-xs font-bold">
              {user.name[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-sm text-warm-700 truncate flex-1">{user.name}</span>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm text-warm-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
