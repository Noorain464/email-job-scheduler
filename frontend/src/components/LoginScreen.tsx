import { useState } from 'react';
import type { FormEvent } from 'react';
import { GoogleLogin } from '@react-oauth/google';

type LoginScreenProps = {
  googleReady: boolean;
  busy: boolean;
  error: string | null;
  onCredential: (credential: string) => Promise<void>;
  onPassword: (name: string, email: string, password: string, mode: 'login' | 'signup') => Promise<void>;
  onFailure: () => void;
};

export function LoginScreen({ googleReady, busy, error, onCredential, onPassword, onFailure }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onPassword(name.trim(), email.trim(), password, mode);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>{mode === 'login' ? 'Login' : 'Sign up'}</h1>
        <div className="login-action">
          {googleReady ? (
            <GoogleLogin
              onSuccess={(response) => response.credential ? void onCredential(response.credential) : undefined}
              onError={onFailure}
              text="signin_with"
              shape="rectangular"
              theme="outline"
              width="400"
              useOneTap={false}
            />
          ) : (
            <div className="config-notice">Set `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` to enable Google sign-in.</div>
          )}
        </div>
        <div className="login-divider"><span />or continue with email<span /></div>
        <form className="password-auth-form" onSubmit={submit}>
          {mode === 'signup' && <label><span>Name</span><input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={120} required /></label>}
          <label><span>Email ID</span><input type="email" placeholder="Email ID" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label><span>Password</span><input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required /></label>
          <button className="password-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}</button>
        </form>
        <p className="auth-mode-switch">{mode === 'login' ? 'New to Outbox?' : 'Already have an account?'} <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} disabled={busy}>{mode === 'login' ? 'Sign up' : 'Login'}</button></p>
        {busy && <p className="login-feedback"><span className="spinner" /> Verifying your account…</p>}
        {error && <p className="login-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
