import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-cream-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">🍽️</div>
        <h1
          className="text-3xl font-display font-bold text-warm-800 mb-2"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Page introuvable
        </h1>
        <p className="text-warm-400 mb-6">Cette page n'existe pas dans La Table.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white font-medium px-5 py-2.5 rounded-xl transition-colors"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  )
}
