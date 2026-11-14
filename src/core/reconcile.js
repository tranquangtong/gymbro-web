// Shared by the web app (Firestore side) and the Worker (D1 side) so both
// compute the same fingerprint for a set of records.
const deletedFlag = r => r.deleted === true || r.deleted === 1 || String(r.deleted).toLowerCase() === 'true' ? 1 : 0;
export async function fingerprint(rows) {
  const lines = rows.map(r => `${r.id}|${r.updated_at || ''}|${deletedFlag(r)}`).sort().join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function summarize(rows) { return { count: rows.length, hash: await fingerprint(rows) }; }
