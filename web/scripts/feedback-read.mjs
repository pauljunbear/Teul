const endpoint = 'http://127.0.0.1:4747';
const studioOrigin = 'http://127.0.0.1:5179';
async function get(path) {
  const response = await fetch(`${endpoint}${path}`);
  if (!response.ok) throw new Error(`Agentation ${path}: HTTP ${response.status}`);
  return response.json();
}

try {
  const sessions = (await get('/sessions')).filter(session => {
    try { return new URL(session.url).origin === studioOrigin; }
    catch { return false; }
  });
  const feedback = await Promise.all(sessions.map(async session => ({
    sessionId: session.id,
    url: session.url,
    ...(await get(`/sessions/${encodeURIComponent(session.id)}/pending`)),
  })));
  console.log(JSON.stringify(feedback.filter(session => session.count > 0), null, 2));
} catch (error) {
  console.error(`Cannot read studio feedback: ${error.message}\nStart npm run feedback first.`);
  process.exitCode = 1;
}
