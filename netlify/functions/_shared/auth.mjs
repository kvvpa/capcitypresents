export async function requireAdminUser(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    throw Object.assign(new Error('Please sign in to the CapCity admin first.'), { status: 401 });
  }

  const identityUrl = new URL('/.netlify/identity/user', request.url);
  const response = await fetch(identityUrl, {
    headers: { Authorization: authorization },
  });
  if (!response.ok) {
    throw Object.assign(new Error('Your admin session expired. Sign in again and retry.'), { status: 401 });
  }
  const user = await response.json();
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
  };
}
