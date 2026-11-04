import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { getCurrentUser, getEmails, scheduleEmail, signInWithGoogle, signInWithPassword, signOut, signUpWithPassword } from './api';
import { ComposeModal } from './components/ComposeModal';
import { EmailTable } from './components/EmailTable';
import { LoginScreen } from './components/LoginScreen';
import type { EmailRecord, ScheduleEmailInput, User } from './types';
import './App.css';

type Tab = 'scheduled' | 'sent';

function AppContent({ googleReady }: { googleReady: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [emailLoading, setEmailLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [tab, setTab] = useState<Tab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const refreshEmails = useCallback(async () => {
    setEmailLoading(true);
    try {
      setEmails(await getEmails());
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load emails.' });
    } finally {
      setEmailLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getCurrentUser().then((currentUser) => {
      if (active) {
        setUser(currentUser);
        if (currentUser && window.location.pathname !== '/dashboard') window.location.replace('/dashboard');
        if (!currentUser && window.location.pathname !== '/') window.location.replace('/');
      }
    }).catch((error: unknown) => {
      if (active) setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not check your sign-in.' });
    }).finally(() => {
      if (active) setAuthLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void getEmails().then((result) => {
      if (active) setEmails(result);
    }).catch((error: unknown) => {
      if (active) setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load emails.' });
    }).finally(() => {
      if (active) setEmailLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const syncEmails = async () => {
      try {
        const latest = await getEmails();
        if (active) setEmails(latest);
      } catch {
        // Keep the current list visible during a temporary polling/network error.
      }
    };
    const interval = window.setInterval(() => void syncEmails(), 5000);
    window.addEventListener('focus', syncEmails);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', syncEmails);
    };
  }, [user]);

  async function handleGoogleCredential(credential: string) {
    setSigningIn(true);
    setNotice(null);
    try {
      await signInWithGoogle(credential);
      window.location.assign('/dashboard');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Google sign-in failed.' });
    } finally {
      setSigningIn(false);
    }
  }

  async function handlePasswordAuth(name: string, email: string, password: string, mode: 'login' | 'signup') {
    setSigningIn(true);
    setNotice(null);
    try {
      if (mode === 'signup') await signUpWithPassword(name, email, password);
      else await signInWithPassword(email, password);
      window.location.assign('/dashboard');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Email sign-in failed.' });
    } finally {
      setSigningIn(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut();
    } finally {
      setUser(null);
      setEmails([]);
      setNotice(null);
      window.location.replace('/');
    }
  }

  async function handleSchedule(inputs: ScheduleEmailInput[]) {
    setScheduling(true);
    let scheduledCount = 0;
    const failedRecipients: string[] = [];
    try {
      // Keep a small batch in flight instead of making hundreds of requests at once.
      for (let index = 0; index < inputs.length; index += 5) {
        const batch = inputs.slice(index, index + 5);
        const results = await Promise.allSettled(batch.map((input) => scheduleEmail(input)));
        results.forEach((result, batchIndex) => {
          if (result.status === 'fulfilled') scheduledCount += 1;
          else failedRecipients.push(batch[batchIndex].to);
        });
      }
      await refreshEmails();
      if (scheduledCount > 0) setComposeOpen(false);
      setNotice({
        kind: failedRecipients.length ? 'error' : 'success',
        text: failedRecipients.length
          ? `${scheduledCount} scheduled; ${failedRecipients.length} requests need review. Check the Scheduled tab before retrying to avoid duplicates.`
          : `${scheduledCount} email${scheduledCount === 1 ? '' : 's'} added to your schedule.`,
      });
    } finally {
      setScheduling(false);
    }
  }

  if (authLoading) return <main className="auth-loading"><span className="spinner" /> Checking your session…</main>;
  if (!user) {
    return <LoginScreen
      googleReady={googleReady}
      busy={signingIn}
      error={notice?.kind === 'error' ? notice.text : null}
      onCredential={handleGoogleCredential}
      onPassword={handlePasswordAuth}
      onFailure={() => setNotice({ kind: 'error', text: 'Google sign-in was cancelled or could not start.' })}
    />;
  }

  const scheduledEmails = emails.filter((email) => email.status === 'scheduled' || email.status === 'sending');
  const sentEmails = emails.filter((email) => email.status === 'sent' || email.status === 'failed');
  const visibleEmails = tab === 'scheduled' ? scheduledEmails : sentEmails;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand sidebar-brand" href="/" aria-label="Outbox home"><span className="brand-mark">OMB</span></a>
        <div className="user-menu sidebar-user">
          {user.picture ? <img className="user-avatar" src={user.picture} alt="" /> : <span className="user-avatar avatar-fallback">{user.name.slice(0, 1).toUpperCase()}</span>}
          <span className="user-meta"><strong>{user.name}</strong><small>{user.email}</small></span>
          <button className="logout-button" onClick={() => void handleLogout()} type="button">Log out</button>
        </div>
        <button className="button sidebar-compose" onClick={() => { setNotice(null); setComposeOpen(true); }} type="button">Compose</button>
        <div className="workspace-label">CORE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={`side-link ${tab === 'scheduled' ? 'active' : ''}`} type="button" onClick={() => setTab('scheduled')}><span className="side-icon">◷</span> Scheduled <span className="side-count">{scheduledEmails.length}</span></button>
          <button className={`side-link ${tab === 'sent' ? 'active' : ''}`} type="button" onClick={() => setTab('sent')}><span className="side-icon">➤</span> Sent <span className="side-count">{sentEmails.length}</span></button>
        </nav>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <label className="inbox-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search emails" /></label>
          <div className="toolbar-actions"><button className="toolbar-button" type="button" onClick={() => void refreshEmails()} disabled={emailLoading} aria-label="Refresh emails">↻</button></div>
        </header>

        <main className="dashboard-content">
          <section className="emails-panel">
            <EmailTable emails={visibleEmails.filter((email) => `${email.recipient} ${email.subject} ${email.textBody ?? ''}`.toLowerCase().includes(search.toLowerCase()))} kind={tab} loading={emailLoading} />
          </section>
        </main>
      </div>

      {notice && <div className={`toast toast-${notice.kind}`} role="status"><span>{notice.kind === 'success' ? '✓' : '!'}</span>{notice.text}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}
      {composeOpen && <ComposeModal busy={scheduling} onClose={() => setComposeOpen(false)} onSchedule={handleSchedule} />}
      {signingIn && <div className="signin-overlay"><span className="spinner" /> Completing Google sign-in…</div>}
    </div>
  );
}

export default function App(): ReactNode {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
  const content = <AppContent googleReady={Boolean(clientId)} />;
  return clientId ? <GoogleOAuthProvider clientId={clientId}>{content}</GoogleOAuthProvider> : content;
}
