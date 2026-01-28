import './styles.css';

// Import all page components
import './components/login-page.js';
import './components/signup-page.js';
import './components/auth-callback.js';
import './components/auth-guard.js';
import './components/photocat-app.js';

/**
 * Route the user based on current page
 *
 * Auth pages (no auth guard):
 * - /login - Login page
 * - /signup - Sign up page
 * - /auth/callback - OAuth callback
 *
 * Protected pages (with auth guard):
 * - / - Main app (default)
 * - All other routes
 */

// Get the current path and normalize it
let path = window.location.pathname;

// Remove trailing slashes (except for root)
if (path.endsWith('/') && path !== '/') {
  path = path.slice(0, -1);
}

// Get the app container
const appContainer = document.getElementById('app');

// Debug logging
console.log('🔀 Routing:', {
  path,
  pathname: window.location.pathname,
  href: window.location.href,
  pathMatches: {
    login: path === '/login',
    signup: path === '/signup',
    callback: path === '/auth/callback'
  }
});

// Route based on path
if (path === '/login') {
  console.log('✅ Route: login');
  appContainer.innerHTML = '<login-page></login-page>';
} else if (path === '/signup') {
  console.log('✅ Route: signup');
  appContainer.innerHTML = '<signup-page></signup-page>';
} else if (path === '/auth/callback') {
  console.log('✅ Route: auth callback');
  appContainer.innerHTML = '<auth-callback></auth-callback>';
} else {
  // All other routes require authentication
  console.log('🔒 Route: protected (auth-guard)');
  appContainer.innerHTML = `
    <auth-guard>
      <photocat-app></photocat-app>
    </auth-guard>
  `;
}