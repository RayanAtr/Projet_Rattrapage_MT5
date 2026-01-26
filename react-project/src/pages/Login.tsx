import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = { onSuccess?: () => void }

// Login / Sign-up simple
// - form email/password
// - appelle onSuccess() quand la connexion réussit
export default function Login({ onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Handler email/password
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
      } else {
        // connexion
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(error.message)
        else {
          setMessage('Connecté')
          onSuccess?.()
        }
      }
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>{mode === 'signup' ? 'Créer un compte' : 'Se connecter'}</h2>

        {/* formulaire login/sign up*/}
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>
          <button className="btn primary" type="submit" disabled={loading}>{loading ? 'Patientez...' : mode === 'signup' ? 'S’inscrire' : 'Se connecter'}</button>
        </form>

        {/* messages d'erreur / succès */}
        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-message">{message}</div>}

        <div className="auth-footer">
          <button className="btn link" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
            {mode === 'signup' ? 'J’ai déjà un compte' : 'Créer un nouveau compte'}
          </button>
        </div>
      </div>
    </div>
  )
}
