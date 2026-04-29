import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginForm from './login-form'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/')

  return (
    <div className="min-h-dvh bg-cream-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4">🍽️</div>
          <h1
            className="text-4xl font-display font-bold text-warm-800 mb-2"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            La Table
          </h1>
          <p className="text-warm-500 font-sans">
            Planificateur de repas familial
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-cream-200 p-8">
          <h2
            className="text-xl font-display font-semibold text-warm-800 mb-1"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Bienvenue
          </h2>
          <p className="text-warm-400 text-sm mb-8">
            Connecte-toi pour accéder à ta cuisine
          </p>

          <LoginForm />
        </div>

        <p className="text-center text-xs text-warm-400 mt-6">
          Accès partagé entre membres de la famille · Données privées
        </p>
      </div>
    </div>
  )
}
