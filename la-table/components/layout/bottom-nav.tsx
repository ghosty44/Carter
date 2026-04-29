'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, BookOpen, ShoppingCart, Star, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/',        label: 'Planning', icon: CalendarDays },
  { href: '/recipes', label: 'Recettes', icon: BookOpen },
  { href: '/staples', label: 'Essentiels', icon: Star },
  { href: '/cart',    label: 'Panier',   icon: ShoppingCart },
  { href: '/history', label: 'Historique', icon: Clock },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-cream-200 z-30 safe-area-bottom">
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                active ? 'text-terracotta-500' : 'text-warm-400 hover:text-warm-700'
              )}
            >
              <Icon className={cn('h-5 w-5', active ? 'text-terracotta-500' : '')} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
