# Capital One new events

Playwright monitor for https://entertainment.capitalone.com/all-events?tab=exclusives.

## Behavior

- Daily schedule at 08:00, 08:20, 08:40, …, 17:40, 18:00 in America/New_York, with automatic DST handling. A runtime guard rejects scans started outside that window, including delayed jobs. GitHub scheduling is best effort, so a delayed 18:00 run may be skipped.
- Chromium renders the page, verifies the Exclusives tab, follows every See more button, validates each card, and fails closed if the complete list cannot be read. The parser is based on the observed September 17, 2026 page structure.
- Extracts the name, displayed date/time, venue and city, and canonical event URL. The displayed date is retained without inventing a year when the card omits one.
- Numeric event IDs are identities. Reorder, duplicate cards, availability changes, and edits to existing details do not alert. Distinct sessions with different IDs are distinct events. If the source replaces an event with a new ID, it will appear new; there is no reliable way to distinguish that from a genuinely new listing using these cards alone.
- The first complete successful scan silently establishes the baseline. `state.json` stores the previous successful scan, all previously seen IDs, the failure counter, and durable pending alerts. Reappearing IDs stay silent. No cache expiration can erase the baseline.
- State is committed through GitHub's contents API using its SHA check. Workflow concurrency prevents overlapping writes. State commits do not trigger new checks.
- Alerts are GitHub issues assigned to the repository owner, including the event name/date/location/link. Assignment produces GitHub notifications; email/push delivery depends on the owner's GitHub notification settings. No separate mail service or secret is required. This configuration assumes a personal repository, not an organization owner.
- Pending notifications are saved before delivery. Retried runs check issue markers across open and closed issues before creating another alert. Keep alert issues rather than deleting them, so uncertain retries can find them.
- Three consecutive scraper failures create one attention issue per failure episode. The last successful baseline remains intact. Checks continue, and a successful scan resets the counter. GitHub installation, permissions, runner, or notification failures are workflow failures visible in Actions and are not counted by the scraper's three-failure counter.

## Free hosting and limits

Use the supplied standard Ubuntu runner in a public repository: GitHub documents this as free. This workflow does not upload artifacts or use a paid service. Private repositories consume an allowance and are not guaranteed free at this frequency.

GitHub can delay or drop scheduled runs and may disable public scheduled workflows after 60 days of repository inactivity. Review the Actions tab if checks stop. A source layout change, bot protection, or GitHub-hosted IP restriction can prevent collection; the first cloud run must be verified before relying on the monitor.

Sources: [GitHub runner billing](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [GitHub schedule and timezone behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Local checks

Requires Node.js 22 or newer.

```sh
npm ci
npm test
npx playwright install chromium
```

The workflow runs tests before monitoring. To manually start a deployed run, choose Actions → Capital One new events → Run workflow. The time window still applies. The first workflow-file push also triggers a run.

## Backup

An independent hourly cloud monitor can use the same identity and baseline rules. Each monitor maintains its own baseline.
