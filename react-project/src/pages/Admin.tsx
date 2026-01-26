import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import '../pages_style/admin.css'

type Props = { user?: any | null }

export default function Admin({ user }: Props) {
  // check admin role 
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ id: null as number | null, name: '', capacity: '', equipment: '', rules: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('rooms').select('*')
    if (error) {
      console.error('Erreur load rooms', error)
      setRooms([])
    } else {
      setRooms(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    let mounted = true
    const check = async () => {
      if (!user) {
        if (mounted) setAllowed(false)
        return
      }
      try {
        // lire le rôle depuis la table users
        const { data, error } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (!mounted) return
        if (!error && data && data.role) {
          const r = String(data.role).toLowerCase()
          setAllowed(r === 'admin' )
          return
        }
      } catch (e) {
        // ignorer
      }

      // fallback: check dans les métadonnées du token
      const metaOk = Boolean(user?.user_metadata?.is_admin || user?.user_metadata?.role === 'admin' || (user?.app_metadata?.roles && user.app_metadata.roles.includes('admin')))
      if (mounted) setAllowed(metaOk)
    }
    check()
    return () => { mounted = false }
  }, [user])

  const resetForm = () => setForm({ id: null, name: '', capacity: '', equipment: '', rules: '' })

  const handleEdit = (r: any) => {
    setForm({ id: r.id, name: r.name || '', capacity: String(r.capacity || ''), equipment: (Array.isArray(r.equipment) ? r.equipment.join(', ') : (r.equipment || '')), rules: r.rules || '' })
  }

  const handleDelete = async (r: any) => {
    if (!confirm(`Supprimer la salle "${r.name}" ?`)) return
    const { error } = await supabase.from('rooms').delete().eq('id', r.id)
    if (error) return alert('Erreur suppression')
    load()
  }

  const handleSave = async () => {
    if (!form.name) return alert('Nom requis')
    setSaving(true)
    const payload: any = {
      name: form.name,
      capacity: form.capacity ? Number(form.capacity) : null,
      equipment: form.equipment ? form.equipment.split(',').map((s) => s.trim()) : null,
      rules: form.rules || null,
    }
    if (form.id) {
      const { data, error } = await supabase.from('rooms').update(payload).eq('id', form.id).select().single()
      if (error) {
        console.error('Erreur mise à jour room', error, data)
        alert(`Erreur mise à jour: ${error.message || JSON.stringify(error)}`)
      }
    } else {
      const { data, error } = await supabase.from('rooms').insert(payload).select().single()
      if (error) {
        console.error('Erreur création room', error, data)
        alert(`Erreur création: ${error.message || JSON.stringify(error)}`)
      }
    }
    setSaving(false)
    resetForm()
    load()
  }
// Utilisateur non connecté
if (!user) {
  return (
    <div className="container">
      <h2>Accès refusé</h2>
      <p>Vous devez être connecté pour accéder à cette page.</p>
    </div>
  )
}

// Vérification du rôle en cours
if (allowed === null) {
  return (
    <div className="container">
      <p>Vérification des autorisations…</p>
    </div>
  )
}

// Utilisateur connecté mais non admin
if (allowed === false) {
  return (
    <div className="container">
      <h2>Accès interdit</h2>
      <p>Vous n’avez pas les droits administrateur pour accéder à cette page.</p>
    </div>
  )
}

  return (
    <div>
      <h2>Admin — Gestion des salles</h2>
      <div style={{ display: 'flex', gap: 18 }}>
        <div style={{ flex: 1 }}>
          <h3>{form.id ? 'Éditer la salle' : 'Nouvelle salle'}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>
              Nom
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Capacité
              <input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </label>
            <label>
              Équipements (séparés par des virgules)
              <input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} />
            </label>
            <label>
              Règles
              <textarea value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button className="btn" onClick={resetForm}>Réinitialiser</button>
            </div>
          </div>
        </div>

        <div style={{ width: 420 }}>
          <h3>Liste des salles</h3>
          {loading && <div>Chargement…</div>}
          {!loading && rooms.length === 0 && <div>Aucune salle.</div>}
          <div style={{ display: 'grid', gap: 8 }}>
            {rooms.map(r => (
              <div key={r.id} style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Capacité: {r.capacity ?? 'N/A'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => handleEdit(r)}>Éditer</button>
                  <button className="btn" onClick={() => handleDelete(r)}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
