/**
 * Client ID management for user identification without accounts.
 * Generates and stores a UUID in localStorage to identify users across sessions.
 */

const CLIENT_ID_KEY = 'holiday_finder_client_id';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  // Simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or generate client ID from localStorage.
 * If no client ID exists, generates a new one and stores it.
 * 
 * @returns Client ID (UUID string)
 */
export function getClientId(): string {
  if (typeof window === 'undefined') {
    // Server-side rendering - return a placeholder (shouldn't happen in practice)
    return 'server-side';
  }

  try {
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    
    if (!clientId) {
      // Generate new client ID
      clientId = generateUUID();
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    
    return clientId;
  } catch (e) {
    // localStorage might be disabled or unavailable
    console.error('Failed to access localStorage:', e);
    // Return a session-based ID as fallback
    return generateUUID();
  }
}

/**
 * Clear the client ID from localStorage.
 * Useful for testing or resetting user identity.
 */
export function clearClientId(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(CLIENT_ID_KEY);
  } catch (e) {
    console.error('Failed to clear client ID:', e);
  }
}

/**
 * Check if a client ID exists in localStorage.
 * 
 * @returns True if client ID exists, false otherwise
 */
export function hasClientId(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return localStorage.getItem(CLIENT_ID_KEY) !== null;
  } catch (e) {
    return false;
  }
}
