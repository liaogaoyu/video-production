// Keep a valid exchange available when local state temporarily disagrees with OAuth.
async function handleAuthFailure({ session, error, pool, accounts, now = Date.now() }) {
  if (accounts.getAuthSession && ["cancelled", "authorized", "failed", "expired"].includes(accounts.getAuthSession(session.id).status)) return;
  const prematureExpiry = /过期/.test(error.message) && Date.parse(session.expires_at) > now;
  if (prematureExpiry) {
    try {
      const credit = await pool.inspect(session.account_id);
      if (credit.authorized) {
        const updated = accounts.markAuth(session.id, "authorized", credit.message);
        if (updated !== false) {
          accounts.applyCheck(session.account_id, credit);
          accounts.clearDeviceCode(session.account_id, session.id);
        }
        return;
      }
    } catch { /* Preserve the encrypted exchange until its actual deadline. */ }
    accounts.markAuth(session.id, "awaiting_user", "正在继续检查即梦授权，请稍候");
    return;
  }
  accounts.markAuth(session.id, /过期/.test(error.message) ? "expired" : "failed", error.message);
}

module.exports = { handleAuthFailure };
