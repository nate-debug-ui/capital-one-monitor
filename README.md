# Capital One new events

Playwright monitor for https://entertainment.capitalone.com/all-events?tab=exclusives.

## Behavior

### Morning availability email

The separate `Capital One daily available events` workflow scans the live Exclusives page daily at **07:30 America/New_York**, including daylight-saving changes. It creates one dated digest issue assigned to the repository owner. With GitHub email notifications enabled for participation, GitHub emails the complete digest. Delivery is best effort and may be later than 07:30.

The digest includes all distinct events not explicitly marked SOLD OUT, including LOW TICKETS. It includes each event's name, displayed date/time, venue/location, direct link, and listing status. It does not imply guaranteed inventory or eligibility. A complete scan with no available events sends a zero-available digest; an incomplete or failed scan fails the workflow instead of emailing a partial or stale list. Retry markers prevent duplicate delivery for the same day. Manual runs are labeled TEST and use a separate retry marker.

### New-event alerts

- Daily schedule at 08:00, 08:05, 08:10, …, 17:55, 18:00 in America/New_York, with automatic DST handling. A runtime guard rejects scans started outside that window, including delayed jobs. GitHub scheduling is best effort, so a delayed 18:00 run may be skipped.
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

## Telegram delivery

`Capital One Telegram delivery` runs after the monitor and morning digest workflows. It forwards the bot-created alert and digest issues to the paired private Telegram chat. Email delivery is independent. The bot token stays in the `TELEGRAM_BOT_TOKEN` Actions secret; the destination is stored using authenticated encryption in `telegram-state.json`, keyed by that secret, and is never logged. Token rotation requires explicit route re-pairing. After one-time setup, new Start messages cannot change the destination.

Long digests are split into messages with disabled link previews and paced at under one message per second. Delivery progress is persisted after each accepted message, so subsequent runs resume unfinished delivery. Telegram has no send-message idempotency key: a lost response or failed checkpoint after acceptance can occasionally cause a duplicate part on retry. Previously created issues are marked historical at setup; the initial test is a separate connection confirmation. Future alerts, attention notices, and daily digests are forwarded.

## Independent backup

An independent hourly cloud monitor can use the same identity and baseline rules. Each monitor maintains its own baseline.
