import { useEffect, useState } from 'react'
import { SessionContext } from './lib'
import { isCloud, localMeId, localMembers, startSync, stopSync, supabase, useTable, type Member } from './store'
import Heute from './pages/Heute'
import Aufgaben from './pages/Aufgaben'
import Einkauf from './pages/Einkauf'
import Gerichte from './pages/Gerichte'
import Mehr from './pages/Mehr'

const TABS = [
  ['heute', '☀️', 'Heute'],
  ['aufgaben', '🧹', 'Aufgaben'],
  ['einkauf', '🛒', 'Einkauf'],
  ['gerichte', '🍲', 'Gerichte'],
  ['mehr', '⚙️', 'Mehr'],
] as const
type Tab = (typeof TABS)[number][0]

export default function App() {
  return isCloud ? <CloudGate /> : <Shell household={{ id: 'local', name: 'Unser Haushalt' }} meKey={localMeId()} signOut={() => {}} />
}

/** Anmeldung und Haushalts-Zuordnung im Cloud-Modus. */
function CloudGate() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [household, setHousehold] = useState<{ id: string; name: string; invite_code: string } | null | undefined>(undefined)

  useEffect(() => {
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  const loadHousehold = async () => {
    const { data } = await supabase!.from('households').select('*').limit(1)
    if (data?.[0]) startSync(data[0].id)
    setHousehold(data?.[0] ?? null)
  }
  useEffect(() => {
    setHousehold(undefined)
    if (userId) loadHousehold()
    else stopSync()
  }, [userId])

  if (userId === undefined || (userId && household === undefined)) return <div className="center muted">Lädt …</div>
  if (!userId) return <Login />
  if (!household) return <Onboarding onDone={loadHousehold} />
  return <Shell household={household} meKey={userId} signOut={() => supabase!.auth.signOut()} />
}

function Shell({ household, meKey, signOut }: { household: { id: string; name: string; invite_code?: string }; meKey: string; signOut: () => void }) {
  const [tab, setTab] = useState<Tab>('heute')
  const [localMe, setLocalMe] = useState(meKey)
  const table = useTable<Member>('members')
  const members = isCloud ? table.rows : table.rows.length ? table.rows : localMembers()
  const me = isCloud ? members.find((m) => m.user_id === meKey) : members.find((m) => m.id === localMe) ?? members[0]
  if (!me) return <div className="center muted">Lädt …</div>

  return (
    <SessionContext.Provider value={{ household, me, members, signOut }}>
      <main>
        {!isCloud && <div className="banner">Demo-Modus: Daten liegen nur auf diesem Gerät und werden nicht synchronisiert.</div>}
        {tab === 'heute' && <Heute go={(t) => setTab(t as Tab)} />}
        {tab === 'aufgaben' && <Aufgaben />}
        {tab === 'einkauf' && <Einkauf />}
        {tab === 'gerichte' && <Gerichte />}
        {tab === 'mehr' && <Mehr members={table} setLocalMe={setLocalMe} />}
      </main>
      <nav className="tabbar">
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span aria-hidden>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </SessionContext.Provider>
  )
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    const auth = supabase!.auth
    const { data, error } = mode === 'in' ? await auth.signInWithPassword({ email, password }) : await auth.signUp({ email, password })
    if (error) setMsg(error.message)
    else if (!data.session) setMsg('Fast geschafft: Bitte bestätige den Link in der E-Mail und melde dich dann an.')
  }
  return (
    <form className="center card auth" onSubmit={submit}>
      <h1>🏠 Haushalt</h1>
      <input type="email" placeholder="E-Mail" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Passwort (mind. 6 Zeichen)" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn primary">{mode === 'in' ? 'Anmelden' : 'Konto erstellen'}</button>
      <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
      </button>
      {msg && <p className="muted">{msg}</p>}
    </form>
  )
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [join, setJoin] = useState(false)
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = join
      ? await supabase!.rpc('join_household', { code: value, member_name: name })
      : await supabase!.rpc('create_household', { household_name: value || 'Unser Haushalt', member_name: name })
    if (error) setMsg(error.message)
    else onDone()
  }
  return (
    <form className="center card auth" onSubmit={submit}>
      <h1>Willkommen!</h1>
      <input placeholder="Dein Name" required value={name} onChange={(e) => setName(e.target.value)} />
      <div className="chips">
        <button type="button" className={'chip' + (!join ? ' on' : '')} onClick={() => setJoin(false)}>Neuen Haushalt anlegen</button>
        <button type="button" className={'chip' + (join ? ' on' : '')} onClick={() => setJoin(true)}>Mit Code beitreten</button>
      </div>
      <input placeholder={join ? 'Einladungscode' : 'Name des Haushalts (optional)'} required={join} value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn primary">{join ? 'Beitreten' : 'Anlegen'}</button>
      <button type="button" className="link" onClick={() => supabase!.auth.signOut()}>Abmelden</button>
      {msg && <p className="muted">{msg}</p>}
    </form>
  )
}
