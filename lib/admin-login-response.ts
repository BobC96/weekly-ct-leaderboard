// Firewall responses can contain nested JSON errors or HTML instead of app JSON.
// Only return strings that React can safely render as the login message.
export async function adminLoginError(response: Response): Promise<string> {
  if (response.status === 429) {
    return 'Too many login attempts. Please wait 15 minutes before trying again.'
  }
  try {
    const data: unknown = await response.json()
    if (data && typeof data === 'object' && 'error' in data
      && typeof data.error === 'string' && data.error.trim()) {
      return data.error
    }
  } catch {
    // Do not display an upstream HTML error page or JSON parsing exception.
  }
  return 'Login is temporarily unavailable. Please try again later.'
}
