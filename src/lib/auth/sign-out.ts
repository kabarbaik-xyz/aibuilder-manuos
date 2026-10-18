export async function signOutRequest(fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('Could not sign out. Please try again.');
  }
}
