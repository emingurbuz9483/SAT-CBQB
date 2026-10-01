import { useEffect, useRef, useState } from 'react'
import { accountsEnabled, signInWithGoogle, signOut, useAccount } from '../progress'

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.6 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6C6.6 42.6 14.6 48 24 48z" />
  </svg>
)

/** Top-bar sign-in button / account menu. Hidden when Supabase isn't configured. */
export function AccountButton() {
  const { account, syncing } = useAccount()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!accountsEnabled) return null
  if (!account)
    return (
      <button className="signin-btn" onClick={() => void signInWithGoogle()}>
        <GoogleG />
        <span>Sign in</span>
      </button>
    )

  return (
    <div className="account" ref={ref}>
      <button className="account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={account.email}>
        {account.avatar ? <img src={account.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar-fallback">{account.name[0]}</span>}
        <span className="account-name">{account.name.split(' ')[0]}</span>
        {syncing && <span className="sync-dot" aria-label="Syncing" />}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-who">
            <strong>{account.name}</strong>
            <span>{account.email}</span>
          </div>
          <p className="account-note">Your progress is saved to this account and syncs across devices.</p>
          <button role="menuitem" className="btn secondary small" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
