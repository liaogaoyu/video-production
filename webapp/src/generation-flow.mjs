// A quote is shared by the automatic preview and submission. Reuse its ID
// after a lost confirmation response so the server can return the same jobs.
export function generationFlow({ quote, confirm, now = Date.now }) {
  let current, pending, submitting;
  const getQuote = async () => {
    if (current && now() < current.expiresAt) return current;
    if (!pending) {
      pending = Promise.resolve().then(quote).then((value) => {
        current = value;
        return value;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  };
  return {
    getQuote,
    submit() {
      if (!submitting) {
        submitting = getQuote().then((value) => confirm(value.id))
          .finally(() => { submitting = undefined; });
      }
      return submitting;
    },
  };
}
