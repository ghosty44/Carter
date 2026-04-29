'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { WeeklyPlanning, Staple, CartSession, CartItem } from '@/lib/types'

const CATEGORIES = ['Maison', 'Bébé', 'Boissons', 'Frais', 'Épicerie', 'Hygiène']

interface DriveClientProps {
  planning: WeeklyPlanning[]
  staples: Staple[]
  cart: CartSession | null
}

export default function DriveClient({ planning, staples: initialStaples, cart: initialCart }: DriveClientProps) {
  const [tab, setTab]           = useState<'recettes' | 'incontournables' | 'extra'>('recettes')
  const [staples, setStaples]   = useState<Staple[]>(initialStaples)
  const [cart, setCart]         = useState<CartSession | null>(initialCart)
  const [extraText, setExtraText] = useState('')
  const [showStapleModal, setShowStapleModal] = useState(false)
  const [editingStaple, setEditingStaple]     = useState<Staple | null>(null)
  const [newStaple, setNewStaple] = useState({ emoji: '🛍️', name: '', brand: '', qty: '', category: 'Maison', substitute: '', always_add: false })
  const supabase = createClient()

  // Merge ingredients from planning
  const weekRecipes = planning.map(p => p.recipe).filter(Boolean) as any[]
  const allIngredients = weekRecipes.flatMap((r: any) => r.ingredients ?? [])
  const mergedIngredients = allIngredients.reduce((acc: any[], ing: any) => {
    const ex = acc.find(i => i.name === ing.name)
    if (ex) { ex.price = (ex.price ?? 0) + (ing.price_estimate ?? 0) * (ing.quantity ?? 1) }
    else acc.push({ name: ing.name, qty: `${ing.quantity ?? ''} ${ing.unit ?? ''}`.trim(), price: (ing.price_estimate ?? 0) * (ing.quantity ?? 1) })
    return acc
  }, [])
  const ingTotal = mergedIngredients.reduce((s: number, i: any) => s + (i.price ?? 0), 0)

  const activeStaples    = staples.filter(s => s.always_add)
  const cartItemCount    = (cart?.items ?? []).length
  const extraLines       = extraText.split('\n').filter(Boolean)

  async function createDrive() {
    toast.success(`🛒 Drive créé ! ${mergedIngredients.length + activeStaples.length + extraLines.length} articles ajoutés`)
  }

  // ── Staples ───────────────────────────────────────────────────
  async function toggleStaple(id: string) {
    const s = staples.find(x => x.id === id)!
    await supabase.from('staples').update({ always_add: !s.always_add }).eq('id', id)
    setStaples(prev => prev.map(x => x.id === id ? { ...x, always_add: !x.always_add } : x))
  }

  async function deleteStaple(id: string) {
    await supabase.from('staples').delete().eq('id', id)
    setStaples(prev => prev.filter(x => x.id !== id))
    toast.success('Produit supprimé')
  }

  function openAddStaple() {
    setEditingStaple(null)
    setNewStaple({ emoji: '🛍️', name: '', brand: '', qty: '', category: 'Maison', substitute: '', always_add: true })
    setShowStapleModal(true)
  }

  function openEditStaple(s: Staple) {
    setEditingStaple(s)
    setNewStaple({ emoji: s.emoji, name: s.name, brand: s.brand ?? '', qty: s.unit ? `${s.quantity ?? ''} ${s.unit}`.trim() : String(s.quantity ?? ''), category: s.category, substitute: s.substitute ?? '', always_add: s.always_add })
    setShowStapleModal(true)
  }

  async function saveStaple() {
    if (!newStaple.name.trim()) return
    const payload = {
      emoji: newStaple.emoji,
      name: newStaple.name.trim(),
      brand: newStaple.brand.trim() || null,
      quantity: null,
      unit: newStaple.qty.trim() || null,
      substitute: newStaple.substitute.trim() || null,
      category: newStaple.category,
      always_add: newStaple.always_add,
      sort_order: staples.length,
    }
    if (editingStaple) {
      await supabase.from('staples').update(payload).eq('id', editingStaple.id)
      setStaples(prev => prev.map(s => s.id === editingStaple.id ? { ...s, ...payload } : s))
      toast.success('Produit mis à jour !')
    } else {
      const { data } = await supabase.from('staples').insert(payload).select().single()
      if (data) setStaples(prev => [...prev, data as Staple])
      toast.success('Produit ajouté !')
    }
    setShowStapleModal(false)
  }

  // ── Cart helpers ──────────────────────────────────────────────
  async function addExtraToCart() {
    if (!extraLines.length) return
    const { data: cartData } = await supabase
      .from('cart_sessions').select('id, items').eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    const newItems = [
      ...(cartData?.items ?? []),
      ...extraLines.map(line => ({
        id: crypto.randomUUID(), name: line, qty: null, unit: null, price: null,
        checked: false, source: 'extra',
      })),
    ]
    if (cartData) {
      await supabase.from('cart_sessions').update({ items: newItems }).eq('id', cartData.id)
    } else {
      await supabase.from('cart_sessions').insert({ items: newItems })
    }
    setExtraText('')
    toast.success(`${extraLines.length} article(s) ajouté(s) au panier`)
  }

  const staplesByCategory = staples.reduce((acc: Record<string, Staple[]>, s) => {
    const cat = s.category || 'Autres'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  const TABS = [
    { id: 'recettes',        label: '🍽️ Recettes'       },
    { id: 'incontournables', label: '📌 Incontournables' },
    { id: 'extra',           label: '➕ Extra'           },
  ] as const

  return (
    <>
      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="staple-summary-pill">🍽️ {mergedIngredients.length} ingrédients recettes</div>
        <div className="staple-summary-pill">📌 {activeStaples.length} incontournables actifs</div>
        <div className="staple-summary-pill">➕ {extraLines.length} articles extra</div>
        {ingTotal > 0 && <div className="staple-summary-pill" style={{ background: 'rgba(196,113,74,.18)', fontWeight: 600 }}>~{ingTotal.toFixed(0)}€ recettes</div>}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: 'var(--creme2)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, transition: 'all .15s',
              background: tab === t.id ? 'var(--white)' : 'transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-light)',
              boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="drive-layout">
        <div>

          {/* TAB: Recettes */}
          {tab === 'recettes' && (
            <div className="drive-panel">
              <div className="drive-header">
                <h3 style={{ fontSize: 16 }}>Ingrédients de la semaine</h3>
                <div className="intermarche-badge">🛒 Intermarché</div>
              </div>
              {weekRecipes.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--ink-light)', textAlign: 'center', padding: '20px 0' }}>
                  Aucune recette planifiée cette semaine.<br />
                  <a href="/" style={{ color: 'var(--terra)' }}>Ajouter des repas au planning →</a>
                </p>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: 'var(--ink-light)', marginBottom: 14 }}>
                    {weekRecipes.map((r: any) => `${r.emoji} ${r.name}`).join(', ')}
                  </div>
                  <div className="ingredient-list">
                    {mergedIngredients.map((ing: any, i: number) => (
                      <div key={i} className="ingredient-row">
                        <div>{ing.name}</div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <span className="ingredient-qty">{ing.qty}</span>
                          {ing.price > 0 && <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>{ing.price.toFixed(2)}€</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {ingTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0 0', borderTop: '1.5px solid var(--creme2)' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>Total : <span style={{ color: 'var(--terra)' }}>{ingTotal.toFixed(2)}€</span></span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB: Incontournables */}
          {tab === 'incontournables' && (
            <div>
              <div className="staples-section">
                <div className="staples-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <h3 style={{ fontSize: 16 }}>Produits incontournables</h3>
                  <button className="btn btn-primary" style={{ padding: '7px 13px', fontSize: 12 }} onClick={openAddStaple}>+ Ajouter</button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--ink-light)', marginBottom: 16 }}>
                  Ces produits s'ajoutent automatiquement à chaque drive. Décochez ceux que vous avez déjà.
                </p>

                {Object.keys(staplesByCategory).length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--ink-light)', textAlign: 'center', padding: '20px 0' }}>Aucun produit encore ajouté</p>
                )}

                {Object.entries(staplesByCategory).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="category-label">{cat}</div>
                    {items.map(s => (
                      <div key={s.id} className={`staple-row ${!s.always_add ? 'disabled' : ''}`}>
                        <div className={`staple-toggle ${s.always_add ? 'checked' : ''}`} onClick={() => toggleStaple(s.id)}>
                          {s.always_add ? '✓' : ''}
                        </div>
                        <div className="staple-emoji">{s.emoji}</div>
                        <div className="staple-info">
                          <div className="staple-name">{s.name}</div>
                          {s.brand && <div className="staple-brand">{s.brand}</div>}
                          {s.substitute && <div className="staple-substitute">↪ {s.substitute}</div>}
                        </div>
                        <div className="staple-qty-badge">{s.unit ?? (s.quantity ? String(s.quantity) : '')}</div>
                        <div className="staple-actions">
                          <button className="icon-btn" onClick={() => openEditStaple(s)}>✏️</button>
                          <button className="icon-btn del" onClick={() => deleteStaple(s.id)}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                <button className="staple-add-btn" onClick={openAddStaple}>
                  + Ajouter un produit récurrent
                </button>
              </div>
            </div>
          )}

          {/* TAB: Extra */}
          {tab === 'extra' && (
            <div className="drive-panel">
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>Articles supplémentaires</h3>
              <p style={{ fontSize: 12, color: 'var(--ink-light)', marginBottom: 14 }}>
                Tout ce qui n'est ni dans les recettes ni dans les incontournables — un article par ligne.
              </p>
              <textarea
                className="extra-list-input"
                value={extraText}
                onChange={e => setExtraText(e.target.value)}
                placeholder={'Dentifrice\nSavon mains\nCrème solaire…'}
                style={{ minHeight: 120 }}
              />
              {extraLines.length > 0 && (
                <>
                  <div className="ingredient-list">
                    {extraLines.map((item, i) => (
                      <div key={i} className="ingredient-row">
                        <span>➕ {item}</span>
                        <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>à rechercher</span>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-green" style={{ width: '100%', marginTop: 8 }} onClick={addExtraToCart}>
                    Ajouter au panier ({extraLines.length})
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Intermarché summary */}
          <div className="drive-panel" style={{ background: 'linear-gradient(135deg, #E31E24 0%, #B01019 100%)', border: 'none' }}>
            <div style={{ color: 'white' }}>
              <div style={{ fontFamily: 'Playfair Display', fontSize: 17, marginBottom: 8 }}>Résumé drive</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, fontSize: 13, opacity: .9 }}>
                <div>🍽️ {mergedIngredients.length} ingrédients recettes</div>
                <div>📌 {activeStaples.length} incontournables</div>
                <div>➕ {extraLines.length} articles extra</div>
                {ingTotal > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: 6, fontWeight: 600, fontSize: 14 }}>
                    Total estimé ~{ingTotal.toFixed(0)}€+
                  </div>
                )}
              </div>
              <button className="btn" style={{ background: 'white', color: '#E31E24', width: '100%', fontWeight: 600, fontSize: 14 }} onClick={createDrive}>
                🛒 Créer le Drive
              </button>
              <div style={{ fontSize: 11, opacity: .6, marginTop: 8, textAlign: 'center' }}>
                Ouverture dans votre compte Intermarché
              </div>
            </div>
          </div>

          {/* Active staples summary */}
          {activeStaples.length > 0 && (
            <div className="drive-panel">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📌 Incontournables actifs</div>
              {activeStaples.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--creme2)' }}>
                  <span style={{ fontSize: 18 }}>{s.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{s.name}</div>
                    {s.brand && <div style={{ fontSize: 11, color: 'var(--ink-light)' }}>{s.brand}</div>}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--terra)', fontWeight: 600 }}>{s.unit ?? ''}</span>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => setTab('incontournables')}>
                Gérer les incontournables →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Staple modal */}
      {showStapleModal && (
        <div className="modal-overlay" onClick={() => setShowStapleModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editingStaple ? 'Modifier le produit' : 'Ajouter un incontournable'}</h2>
            <div className="modal-subtitle">Ce produit sera proposé à chaque drive 📌</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Emoji</label>
                <input className="form-input" value={newStaple.emoji} onChange={e => setNewStaple(s => ({ ...s, emoji: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select className="form-input" value={newStaple.category} onChange={e => setNewStaple(s => ({ ...s, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nom du produit</label>
              <input className="form-input" placeholder="Ex : Sopalin" value={newStaple.name} onChange={e => setNewStaple(s => ({ ...s, name: e.target.value }))} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Marque précise</label>
              <input className="form-input" placeholder="Ex : Lotus Confort x6" value={newStaple.brand} onChange={e => setNewStaple(s => ({ ...s, brand: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Quantité</label>
              <input className="form-input" placeholder="Ex : 2 paquets" value={newStaple.qty} onChange={e => setNewStaple(s => ({ ...s, qty: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Substitut si rupture de stock</label>
              <input className="form-input" placeholder="Ex : Okay x6 si rupture" value={newStaple.substitute} onChange={e => setNewStaple(s => ({ ...s, substitute: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 4 }}>
              <input type="checkbox" checked={newStaple.always_add} onChange={e => setNewStaple(s => ({ ...s, always_add: e.target.checked }))} style={{ accentColor: 'var(--terra)' }} />
              Toujours actif (ajouter automatiquement)
            </label>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowStapleModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveStaple}>{editingStaple ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
