// 🛡️ SECURITY CONFIGURATION
const PRODUCTION_DOMAIN = 'studio-neon-three-52.vercel.app';

// Whitelist of domains allowed for redirection
const ALLOWED_HOSTS = new Set([
  PRODUCTION_DOMAIN,
  'localhost:3000', // Allows testing in local development
  // 'studio-neon-three-52.vercel.app', // (Redundant if PRODUCTION_DOMAIN is used, but safe to keep)
]);

/**
 * Validates a redirect URL against an allowlist to prevent Open Redirect attacks.
 * * @param url - The intended redirect URL (e.g., from searchParams.get('next'))
 * @param defaultPath - The fallback path if the URL is invalid or malicious (default: '/dashboard')
 * @returns A safe, validated string ready for redirect()
 */
export function getSafeRedirect(url: string | null | undefined, defaultPath: string = '/dashboard'): string {
  if (!url) return defaultPath;

  try {
    // 1. Handle Relative URLs (e.g., "/dashboard", "/settings")
    // Security Check: Must start with "/" but NOT "//" (protocol-relative URL attack)
    // Example: "//google.com" is treated as "https://google.com" by browsers, so we block it.
    if (url.startsWith('/') && !url.startsWith('//')) {
      return url;
    }

    // 2. Handle Absolute URLs (e.g., "https://studio-neon-three-52.vercel.app/dashboard")
    // We attempt to parse the URL. If it fails, it throws an error and falls back to default.
    const parsedUrl = new URL(url);
    
    // Security Check: Is the hostname in our ALLOWED_HOSTS list?
    if (ALLOWED_HOSTS.has(parsedUrl.hostname)) {
      return url;
    }

    // 3. Log blocked attempts (Optional but good for monitoring)
    if (process.env.NODE_ENV === 'development') {
      console.warn(`🔒 Security: Blocked unsafe redirect attempt to: ${url}`);
    }
    
  } catch (error) {
    // If URL parsing fails (e.g., "javascript:alert(1)"), it's malicious.
    console.error('🔒 Security: Invalid redirect URL format:', url);
  }

  // 4. Fallback: If any check failed, go to the default safe path.
  return defaultPath;
}