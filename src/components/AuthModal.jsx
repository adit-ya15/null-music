import { useState } from 'react';
import { KeyRound, LogIn, LogOut, User, UserPlus } from 'lucide-react';

function buildInitialForm(mode) {
  return {
    name: '',
    email: '',
    password: '',
    currentPassword: '',
    newPassword: '',
    mode,
  };
}

function accountLabel(user) {
  return user?.name || user?.email || user?.phone || 'Aura Listener';
}

export default function AuthModal({
  isOpen,
  mode,
  onModeChange,
  onClose,
  onSubmit,
  onLogout,
  onChangePassword,
  isSubmitting,
  error,
  session,
  syncStatus,
}) {
  const [form, setForm] = useState(() => buildInitialForm(mode));

  if (!isOpen) return null;

  const isLoggedIn = Boolean(session?.user?.id);
  const userLabel = accountLabel(session?.user);
  const avatarLabel = userLabel.trim().charAt(0).toUpperCase() || 'A';
  const userSubtitle = session?.user?.email || session?.user?.phone || '';
  const supportsPasswordChange = Boolean(session?.user?.hasPassword || session?.user?.email);

  const handleChange = (key) => (event) => {
    const value = event.target.value;
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleModeChange = (nextMode) => {
    setForm((previous) => ({
      ...buildInitialForm(nextMode),
      email: previous.email,
      name: previous.name,
    }));
    onModeChange(nextMode);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    await onSubmit({
      mode,
      name: form.name,
      email: form.email,
      password: form.password,
    });
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    await onChangePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    setForm((previous) => ({ ...previous, currentPassword: '', newPassword: '' }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal auth-modal" onClick={(event) => event.stopPropagation()}>
        <div className="auth-modal-header">
          <div>
            <p className="settings-eyebrow">Account</p>
            <h3>{isLoggedIn ? 'Your Aura account' : 'Sign in to sync your library'}</h3>
          </div>
          <button className="close-btn" onClick={onClose} type="button" aria-label="Close account dialog">
            X
          </button>
        </div>

        {isLoggedIn ? (
          <>
            <div className="auth-profile-card">
              <div className="auth-profile-avatar">{avatarLabel}</div>
              <div className="auth-profile-copy">
                <strong>{userLabel}</strong>
                <span>{userSubtitle}</span>
                <span className="sync-status-pill">{syncStatus || 'Synced'}</span>
              </div>
            </div>

            <p className="auth-muted">
              Likes, playlists, and recent listening are stored on your account so they can follow you across installs.
            </p>

            {error && <p className="auth-error">{error}</p>}

            {supportsPasswordChange && (
              <form className="auth-password-form" onSubmit={handleChangePassword}>
                <div className="section-header auth-section-header">
                  <h2>Password</h2>
                </div>
                <label className="auth-field">
                  <span>{session?.user?.hasPassword ? 'Current password' : 'Set a password'}</span>
                  <input
                    className="modal-input"
                    type="password"
                    value={form.currentPassword}
                    onChange={handleChange('currentPassword')}
                    placeholder={session?.user?.hasPassword ? 'Current password' : 'Leave blank if none'}
                    autoComplete="current-password"
                  />
                </label>
                <label className="auth-field">
                  <span>New password</span>
                  <input
                    className="modal-input"
                    type="password"
                    value={form.newPassword}
                    onChange={handleChange('newPassword')}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={onClose} type="button">
                    Close
                  </button>
                  <button className="btn-primary" disabled={isSubmitting} type="submit">
                    <KeyRound size={14} />
                    {isSubmitting ? 'Saving...' : 'Update password'}
                  </button>
                </div>
              </form>
            )}

            {!supportsPasswordChange && (
              <div className="modal-actions">
                <button className="btn-secondary" onClick={onClose} type="button">
                  Close
                </button>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-primary" onClick={onLogout} type="button">
                <LogOut size={14} /> Log out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-switcher" role="tablist" aria-label="Account mode">
              <button
                className={`auth-switcher-btn ${mode === 'login' ? 'auth-switcher-btn--active' : ''}`}
                onClick={() => handleModeChange('login')}
                type="button"
              >
                <LogIn size={14} /> Login
              </button>
              <button
                className={`auth-switcher-btn ${mode === 'signup' ? 'auth-switcher-btn--active' : ''}`}
                onClick={() => handleModeChange('signup')}
                type="button"
              >
                <UserPlus size={14} /> Sign up
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <label className="auth-field">
                  <span>Name</span>
                  <input
                    className="modal-input"
                    value={form.name}
                    onChange={handleChange('name')}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="auth-field">
                <span>Email</span>
                <input
                  className="modal-input"
                  type="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="auth-field">
                <span>Password</span>
                <input
                  className="modal-input"
                  type="password"
                  value={form.password}
                  onChange={handleChange('password')}
                  placeholder="At least 6 characters"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={6}
                  required
                />
              </label>

              {error && <p className="auth-error">{error}</p>}

              <div className="auth-benefits">
                <div className="auth-benefit">
                  <User size={14} />
                  <span>Keep liked songs, playlists, and recent listening synced.</span>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={onClose} type="button">
                  Cancel
                </button>
                <button className="btn-primary" disabled={isSubmitting} type="submit">
                  {isSubmitting
                    ? 'Working...'
                    : mode === 'signup'
                        ? 'Create account'
                        : 'Login'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
