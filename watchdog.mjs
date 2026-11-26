// Allow three 20-minute intervals plus five minutes for the hosted runner to start.
const overdueAfterMs = 65 * 60 * 1000;

export function updatePrimaryHealth(state, {beforeScan, backup, scanSucceeded, now = new Date()}) {
  // Older checkpoints predate the backup. Their last success was a primary scan.
  const previousSuccess = Object.hasOwn(beforeScan, 'lastPrimarySuccess')
    ? beforeScan.lastPrimarySuccess
    : beforeScan.lastSuccess;
  state.lastPrimarySuccess = previousSuccess ?? null;
  state.primaryWatchStartedAt = beforeScan.primaryWatchStartedAt ?? previousSuccess ?? now.toISOString();

  if (!backup && scanSucceeded) {
    state.lastPrimarySuccess = state.lastSuccess;
    if (state.primaryOverdueSince) {
      state.pending.push({
        key: `recovered-${state.primaryOverdueSince}`,
        title: 'Capital One event checks have recovered',
        message: `The 20-minute monitor completed a full scan at ${state.lastSuccess}.`,
      });
      delete state.primaryOverdueSince;
    }
    return;
  }

  const since = state.lastPrimarySuccess ?? state.primaryWatchStartedAt;
  if (state.primaryOverdueSince || now.getTime() - Date.parse(since) < overdueAfterMs) return;
  state.primaryOverdueSince = since;
  state.pending.push({
    key: `overdue-${since}`,
    title: 'Capital One event checks are overdue',
    message: `No complete scan from the 20-minute monitor since ${since}. Check its GitHub Actions history. The hourly browser backup is scheduled separately.`,
  });
}
