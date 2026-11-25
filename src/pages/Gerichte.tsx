import { useState } from 'react'
import { addIngredients, EFFORT } from '../lib'
import { callFn, isCloud, useTable, type Dish, type ShoppingItem } from '../store'

type Form = Omit<Dish, 'id' | 'last_cooked'>
type AiDish = { ingredients: string[]; minutes: number; effort: number; kcal: number; protein: number; carbs: number; fat: number }
const empty: Form = { name: '', ingredients: '', servings: 2, minutes: null, effort: null, kcal: null, protein: null, carbs: null, fat: null }
const num = (v: string) => (v === '' ? null : Math.max(0, Math.round(+v)))

async function aiFill(f: Form): Promise<Form> {
  const r = await callFn<AiDish>('ai', { action: 'dish', name: f.name, ingredients: f.ingredients, servings: f.servings })
  return {
    ...f,
    ingredients: f.ingredients.trim() || r.ingredients.join('\n'),
    minutes: Math.round(r.minutes),
    effort: Math.min(3, Math.max(1, Math.round(r.effort))),
    kcal: Math.round(r.kcal), protein: Math.round(r.protein), carbs: Math.round(r.carbs), fat: Math.round(r.fat),
  }
}

function DishForm({ initial, onSave, onCancel }: { initial: Form; onSave: (f: Form) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const set = (patch: Partial<Form>) => setF({ ...f, ...patch })

  const fill = async (form: Form) => {
    setBusy(true)
    setMsg('')
    try {
      const filled = await aiFill(form)
      setF(filled)
      return filled
    } catch (e: any) {
      setMsg('KI-Schätzung fehlgeschlagen: ' + e.message)
      return form
    } finally {
      setBusy(false)
    }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return
    // Nährwerte automatisch ergänzen, wenn noch keine eingetragen sind
    await onSave(isCloud && f.kcal == null ? await fill(f) : f)
  }

  return (
    <form className="card" onSubmit={submit}>
      <input placeholder="Name des Gerichts" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
      <label>Portionen
        <input type="number" inputMode="numeric" min={1} value={f.servings} onChange={(e) => set({ servings: Math.max(1, +e.target.value || 1) })} />
      </label>
      <label>Zutaten (eine pro Zeile{isCloud && ' – leer lassen, dann schlägt die KI welche vor'})
        <textarea rows={5} placeholder={'200 g Spaghetti\n1 Dose Tomaten'} value={f.ingredients} onChange={(e) => set({ ingredients: e.target.value })} />
      </label>
      <div className="grid">
        <label>Minuten<input type="number" inputMode="numeric" value={f.minutes ?? ''} onChange={(e) => set({ minutes: num(e.target.value) })} /></label>
        <label>Aufwand
          <select value={f.effort ?? ''} onChange={(e) => set({ effort: num(e.target.value) })}>
            <option value="">–</option>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{EFFORT[n]}</option>)}
          </select>
        </label>
        <label>kcal<input type="number" inputMode="numeric" value={f.kcal ?? ''} onChange={(e) => set({ kcal: num(e.target.value) })} /></label>
        <label>Eiweiß g<input type="number" inputMode="numeric" value={f.protein ?? ''} onChange={(e) => set({ protein: num(e.target.value) })} /></label>
        <label>Kohlenh. g<input type="number" inputMode="numeric" value={f.carbs ?? ''} onChange={(e) => set({ carbs: num(e.target.value) })} /></label>
        <label>Fett g<input type="number" inputMode="numeric" value={f.fat ?? ''} onChange={(e) => set({ fat: num(e.target.value) })} /></label>
      </div>
      <p className="muted small">Nährwerte gelten pro Portion{isCloud ? ' und werden beim Speichern von der KI geschätzt, wenn du sie leer lässt.' : '. Im Demo-Modus bitte von Hand eintragen.'}</p>
      {msg && <p className="late small">{msg}</p>}
      {isCloud && <button type="button" className="btn" disabled={busy || !f.name.trim()} onClick={() => fill(f)}>{busy ? 'KI schätzt …' : '✨ Mit KI neu schätzen'}</button>}
      <div className="row">
        <button className="btn primary grow" disabled={busy}>{busy ? 'Moment …' : 'Speichern'}</button>
        <button type="button" className="btn" onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  )
}

export default function Gerichte() {
  const dishes = useTable<Dish>('dishes')
  const shopping = useTable<ShoppingItem>('shopping_items')
  const [editing, setEditing] = useState<string | null>(null) // Dish-ID oder 'new'
  const [openId, setOpenId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const sorted = [...dishes.rows].sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return (
    <>
      <h1>Gerichte</h1>
      {msg && <p className="muted">{msg}</p>}
      {editing === 'new' ? (
        <DishForm initial={empty} onCancel={() => setEditing(null)} onSave={async (f) => { await dishes.add({ ...f, name: f.name.trim(), last_cooked: null }); setEditing(null) }} />
      ) : (
        <button className="btn primary" onClick={() => setEditing('new')}>+ Neues Gericht</button>
      )}

      {!sorted.length && editing !== 'new' && <p className="muted">Fügt hier eure Lieblingsgerichte hinzu – der Name reicht, den Rest kann die KI ergänzen.</p>}

      {sorted.map((d) =>
        editing === d.id ? (
          <DishForm key={d.id} initial={d} onCancel={() => setEditing(null)} onSave={async ({ name, ingredients, servings, minutes, effort, kcal, protein, carbs, fat }) => {
            await dishes.update(d.id, { name: name.trim(), ingredients, servings, minutes, effort, kcal, protein, carbs, fat })
            setEditing(null)
          }} />
        ) : (
          <section key={d.id} className="card" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
            <h2>{d.name}</h2>
            <p className="muted small">
              {[d.minutes && `${d.minutes} Min.`, d.effort && EFFORT[d.effort], `${d.servings} Portionen`].filter(Boolean).join(' · ')}
            </p>
            {d.kcal != null && (
              <div className="macros">
                <span><b>{d.kcal}</b> kcal</span><span><b>{d.protein}</b> g Eiweiß</span><span><b>{d.carbs}</b> g KH</span><span><b>{d.fat}</b> g Fett</span>
              </div>
            )}
            {openId === d.id && (
              <div onClick={(e) => e.stopPropagation()}>
                {d.ingredients && <ul>{d.ingredients.split('\n').filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul>}
                <div className="row wrap">
                  <button className="btn" disabled={!d.ingredients} onClick={async () => setMsg(`${await addIngredients(d, shopping)} Zutaten von „${d.name}“ auf die Einkaufsliste gesetzt.`)}>🛒 Zutaten einkaufen</button>
                  <button className="btn" onClick={() => setEditing(d.id)}>Bearbeiten</button>
                  <button className="btn" onClick={() => confirm(`„${d.name}“ löschen?`) && dishes.remove(d.id)}>Löschen</button>
                </div>
              </div>
            )}
          </section>
        ),
      )}
    </>
  )
}
