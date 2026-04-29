import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/sidebar'
import BottomNav from '@/components/layout/bottom-nav'
import { Toaster } from 'sonner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const displayName = (user.user_metadata?.full_name as string | undefined)
    ?? user.email
    ?? 'Utilisateur'

  return (
    <div className="min-h-dvh flex bg-cream-50">
      {/* Desktop sidebar */}
      <Sidebar user={{ name: displayName, avatarUrl }} />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <div className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 max-w-5xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />

      <Toaster
        richColors
        position="top-center"
        toastOptions={{
          style: {
            fontFamily: "'DM Sans', system-ui, sans-serif",
          },
        }}
      />
    </div>
  )
}
