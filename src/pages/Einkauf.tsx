import { useState } from 'react'
import { SHOPPING_STARTERS } from '../lib'
import { useTable, type ShoppingItem } from '../store'

export default function Einkauf() {
  const items = useTable<ShoppingItem>('shopping_items')
  const [text, setText] = useState('')

  const active = items.rows.filter((i) => !i.archived)
  const open = active.filter((i) => !i.checked)
  const done = active.filter((i) => i.checked)
  const onList = new Set(active.map((i) => i.name.toLowerCase()))

  const add = (name: string) => {
    name = name.trim()
    if (name && !onList.has(name.toLowerCase())) items.add({ name, checked: false, archived: false })
  }

  // Vorschläge: was ihr am häufigsten gekauft habt und gerade nicht auf der Liste steht
  const counts = new Map<string, { name: string; n: number }>()
  for (const i of items.rows.filter((i) => i.archived)) {
    const k = i.name.toLowerCase()
    counts.set(k, { name: i.name, n: (counts.get(k)?.n ?? 0) + 1 })
  }
  const history = [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.name)
  const suggestions = [...history, ...SHOPPING_STARTERS.filter((s) => !counts.has(s.toLowerCase()))].filter((s) => !onList.has(s.toLowerCase())).slice(0, 10)

  return (
    <>
      <h1>Einkaufsliste</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); add(text); setText('') }}>
        <input className="grow" placeholder="Was fehlt?" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
        <button className="btn primary">+</button>
      </form>

      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => <button key={s} className="chip" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}

      <section className="card">
        {!open.length && <p className="muted">Die Liste ist leer.</p>}
        {open.map((i) => (
          <div key={i.id} className="row item" onClick={() => items.update(i.id, { checked: true })}>
            <button className="check" aria-label="Abhaken" />
            <div className="grow">{i.name}</div>
          </div>
        ))}
      </section>

      {done.length > 0 && (
        <section className="card">
          <h2>Im Wagen</h2>
          {done.map((i) => (
            <div key={i.id} className="row item" onClick={() => items.update(i.id, { checked: false })}>
              <button className="check on" aria-label="Zurück auf die Liste">✓</button>
              <div className="grow struck">{i.name}</div>
            </div>
          ))}
          <button className="btn" onClick={() => done.forEach((i) => items.update(i.id, { archived: true }))}>Einkauf abschließen</button>
        </section>
      )}
    </>
  )
}
