import {
  auth,
  configured,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut
} from './firebase.js';
import { ensureUserProfile } from './firestore-service.js';

const $ = id => document.getElementById(id);
const toast = message => {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
};

function addPasswordReset() {
  if ($('passwordReset')) return;
  const button = document.createElement('button');
  button.id = 'passwordReset';
  button.type = 'button';
  button.className = 'auth-switch';
  button.textContent = 'Forgot your password?';
  button.addEventListener('click', async () => {
    const email = $('emailInput')?.value.trim();
    if (!email) {
      $('authError').textContent = 'Enter your email address first.';
      $('emailInput')?.focus();
      return;
    }
    button.disabled = true;
    try {
      await sendPasswordResetEmail(auth, email);
      toast('Password reset email sent. Check your inbox.');
    } catch (error) {
      $('authError').textContent = error?.code === 'auth/user-not-found'
        ? 'No account was found for that email.'
        : 'Could not send the reset email. Please try again.';
    } finally {
      button.disabled = false;
    }
  });
  $('authSwitch')?.after(button);
}

async function sendInitialVerification(user) {
  const key = `main-verification-sent:${user.uid}`;
  if (sessionStorage.getItem(key)) return;
  try {
    await sendEmailVerification(user);
    sessionStorage.setItem(key, '1');
    toast('Verification email sent. Check your inbox.');
  } catch {
    // The resend button remains available if Firebase rate-limits the request.
  }
}

function showVerificationGate(user) {
  const screen = $('authScreen');
  const app = $('app');
  if (!screen || !app) return;
  app.hidden = true;
  screen.hidden = false;
  const card = screen.querySelector('.auth-card');
  if (!card || $('verificationGate')) return;
  const gate = document.createElement('div');
  gate.id = 'verificationGate';
  gate.className = 'verification-gate';
  gate.innerHTML = '<p class="eyebrow">VERIFY YOUR EMAIL</p><h2>Check your inbox</h2><p>We sent a verification link to <strong></strong>. Verify it before entering Main.</p><div class="verification-actions"><button class="primary-button" id="resendVerification" type="button">Resend email</button><button class="auth-switch" id="verificationLogout" type="button">Use another account</button></div>';
  gate.querySelector('strong').textContent = user.email || '';
  card.innerHTML = '';
  card.append(gate);
  gate.querySelector('#resendVerification').onclick = async event => {
    event.currentTarget.disabled = true;
    try {
      await sendEmailVerification(user);
      sessionStorage.setItem(`main-verification-sent:${user.uid}`, '1');
      toast('Verification email sent again.');
    } catch {
      toast('Could not send verification email yet.');
    } finally {
      event.currentTarget.disabled = false;
    }
  };
  gate.querySelector('#verificationLogout').onclick = async () => {
    await signOut(auth);
    window.location.reload();
  };
}

async function refreshVerification() {
  const user = auth?.currentUser;
  if (!user) return;
  await user.reload();
  if (user.emailVerified) {
    const gate = $('verificationGate');
    if (gate) window.location.reload();
    try { await ensureUserProfile(user); } catch { /* Firestore configuration can be completed independently. */ }
  } else {
    await sendInitialVerification(user);
    showVerificationGate(user);
  }
}

if (configured && auth) {
  addPasswordReset();
  onAuthStateChanged(auth, user => {
    if (user) refreshVerification().catch(() => showVerificationGate(user));
  });
}
