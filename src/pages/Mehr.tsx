import { useState } from 'react'
import { useSession } from '../lib'
import { isCloud, setLocalMeId, type Member } from '../store'

interface Props {
  members: { update: (id: string, patch: Partial<Member>) => Promise<void> }
  setLocalMe: (id: string) => void
}

export default function Mehr({ members: table, setLocalMe }: Props) {
  const { household, me, members, signOut } = useSession()
  const [name, setName] = useState(me.name)
  const [ics, setIcs] = useState(me.ics_url ?? '')
  const [saved, setSaved] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    await table.update(me.id, { name: name.trim() || me.name, ics_url: ics.trim() || null })
    setSaved(true)
  }

  return (
    <>
      <h1>{household.name}</h1>

      <section className="card">
        <h2>Mitglieder</h2>
        {members.map((m) => <p key={m.id}>{m.name}{m.id === me.id && ' (du)'}</p>)}
        {household.invite_code && (
          <>
            <p className="muted small">Einladungscode für deine:n Partner:in:</p>
            <p className="code" onClick={() => navigator.clipboard?.writeText(household.invite_code!)}>{household.invite_code}</p>
          </>
        )}
        {!isCloud && (
          <label>Ich bin gerade
            <select value={me.id} onChange={(e) => { setLocalMeId(e.target.value); setLocalMe(e.target.value) }}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
      </section>

      <form className="card" onSubmit={save}>
        <h2>Mein Profil</h2>
        <label>Name<input value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} /></label>
        {isCloud && (
          <>
            <label>Kalender-Abo-Link (ICS)
              <input type="url" placeholder="https://… oder webcal://…" value={ics} onChange={(e) => { setIcs(e.target.value); setSaved(false) }} />
            </label>
            <p className="muted small">
              <b>Google Kalender:</b> Einstellungen → dein Kalender → „Geheime Adresse im iCal-Format“.<br />
              <b>Apple/iCloud:</b> Kalender-App → Kalender → ⓘ → „Öffentlicher Kalender“ → Link teilen.<br />
              Wer diesen Link kennt, kann den Kalender lesen. Er wird nur in eurem Haushalt gespeichert.
            </p>
          </>
        )}
        <button className="btn primary">{saved ? 'Gespeichert ✓' : 'Speichern'}</button>
      </form>

      {isCloud && <button className="btn" onClick={signOut}>Abmelden</button>}
    </>
  )
}
