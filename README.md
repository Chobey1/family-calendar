# Our family calendar — private proof of concept

## Shared To-Dos

The calendar and shared To-Dos appear side by side on desktop and stack on narrower screens. Tasks have a title, notes, optional due date, and family-member tags. A separate person filter narrows tasks; active items sort by due date with undated tasks last. Round completion controls move the shared task into a collapsed Completed list for everyone tagged. Completed items can be restored. Tasks do not enter calendar events, feeds, emails, or digests. Visible pages refresh shared tasks every 30 seconds, with a manual Refresh button as well.

Shared To-Dos and family member name editing are included in `main`. See [TODO-TESTING.md](TODO-TESTING.md) if you want a separate test instance on port 3081 without modifying the live database or sending test emails.

Phone-friendly shared calendars for adult accounts and child profiles. Run on Worleyserver using Docker Compose and private home-network/Tailscale access. Nothing is published to a hosted service by this project.

## Included

- Create an adult account, then create a named family or request to join using a family code.
- Joining requires approval from an existing adult. Every approved adult has full access to that family's calendar, profiles, name, codes, and requests. Each account currently belongs to one family.
- Pending applicants cannot read family data. Families have isolated events, members, requests, subscriptions, and email history.
- Child profiles without logins; tag multiple people and filter events by member.
- Agenda and month views, detailed events, Apple Maps directions links.
- One-time, daily, weekly, and yearly events with optional repeat end dates. Editing/deleting affects the entire series.
- Event types include Event, Birthday, and Anniversary. Birthdays/anniversaries ask for a person/couple's name and original date (including year), automatically schedule the next annual all-day occurrence, and calculate each year's age/count in the title, calendar, emails, and feed. Example: `Colby’s 41st Birthday!` on August 30, 2027 for a DOB of August 30, 1986. February 29 is observed February 28 in non-leap years and returns to February 29 in leap years.
- Start/end time dropdowns use quarter-hour choices. Changing the start defaults the end to one hour later, including date rollover. Existing off-quarter times remain available until changed.
- Repeating events have an **Edit series** shortcut, with explicit **Save series** and **Delete series** controls. The first event's dates are shown; changes affect the whole series, including past occurrences.
- Both parents receive reminders for child events; adult-only events notify tagged adults.
- Reminder options: off, 15 minutes, 30 minutes, 1 hour, or 1 day before.
- Sunday 3 p.m. America/Chicago weekly email covering the following Monday–Sunday.
- Preview mode saves email content inside Family & settings; SMTP mode sends through SMTP2GO.
- Styled HTML reminders/digests include an illustrated header, family name, details, calendar/maps buttons, and a plain-text fallback. Subject example: `Worley Family – Soccer practice in 15 minutes`.
- Revocable private read-only ICS feed, including all-day events. Expanded occurrences cover one month back and twelve months ahead.

## Run on Worleyserver

Requires Docker Engine, the Docker Compose plugin, and Tailscale. Copy this entire folder to a location you manage on Worleyserver. Do not copy `node_modules`.

1. Copy `.env.example` to `.env`.
2. Generate **two different** secrets (for example, run `openssl rand -hex 32` twice). Put one in `SETUP_TOKEN` and the other in `POSTGRES_PASSWORD`. Use hexadecimal for the database password so it is safe in the connection URL.
3. Keep `MAIL_MODE=preview` initially. Leave SMTP credentials blank.
4. Start the application:

   ```sh
   docker compose up -d --build
   ```

5. On Worleyserver, route the service through Tailscale HTTPS. For a host-installed Tailscale client, the expected command is:

   ```sh
   tailscale serve --bg http://127.0.0.1:3080
   ```

   This depends on your Tailscale setup. Check existing Serve routes before replacing them. If Tailscale runs in a container, its networking needs separate configuration. **Do not enable Funnel** for this private test.

6. Set `APP_URL` to the exact HTTPS URL reported by Tailscale (without a trailing slash), then apply it:

   ```sh
   docker compose up -d
   ```

7. With Tailscale connected, open that URL from your phone. Create the first adult account using the setup token, then create and name your family. Share the family code from Family & settings with your spouse. They create their own account and request to join; approve them in Family & settings. After the first account is created, remove the setup token from `.env` and run `docker compose up -d` again. Existing accounts remain valid.
8. Add child profiles in **Family & settings**. Create an event roughly 17 minutes from now with a 15-minute reminder. Within about one minute of its due time, inspect **View recent email activity** for the preview.

If port 3080 is already used, change its host-side mapping in `compose.yaml` and the Tailscale target. The database is not exposed on a host port. Keep Tailscale access rules limited to the intended devices/users.

## Connect SMTP2GO

Use an SMTP2GO SMTP user and a sender address verified in your SMTP2GO account. Set these locally in `.env`; never commit or share that file:

```dotenv
MAIL_MODE=smtp
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
MAIL_FROM=your-verified-sender@example.com
```

The username and sender above are examples, not usable credentials. Then run `docker compose up -d`. Create a **new future test event** to test delivery. Already-previewed messages are not resent when switching to SMTP mode. TLS is required for SMTP connections. Confirm actual receipt in both inboxes and check SMTP2GO activity; a `sent` status means the provider accepted the message, not guaranteed inbox delivery. This initial build has no provider bounce webhooks.

## Apple / Google Calendar

In Family & settings, generate a subscription link. Treat it like a password: it grants read access to the calendar to anyone who has the link and network access. Generating another link revokes the previous one. Tailscale restricts network access separately.

Events are created/edited through this website. Subscriptions are read-only, and refresh timing is controlled by the calendar client. Google cannot fetch a Tailscale-only URL. Apple subscription fetching on your actual devices still needs verification; it may depend on where the client fetch occurs. Do not rely on the subscription for email reminder timing. The application sends those independently.

## Test checklist on the server

- Both parents can sign in separately from their phones over Tailscale.
- Parent A adds a child and creates an event; Parent B refreshes and sees it.
- Filtering by the child finds the event; filtering by an untagged adult does not.
- Confirm locations, directions, and notes on a narrow phone screen.
- Confirm reminder previews, then actual SMTP delivery to the right parents.
- Edit or delete an event before its reminder; verify the old pending reminder is cancelled.
- Confirm a weekly event's clock time remains consistent across daylight saving.
- Try a calendar subscription in Apple Calendar; verify repeat occurrences and changes after the client refreshes.
- Check the Sunday digest after 3 p.m. Central.

## Development and automated checks

Node 22+ and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm audit --prod
```

For an HTTP localhost test only, use `APP_URL=http://localhost:3080` and `COOKIE_SECURE=false`. For home-network access, also set `BIND_ADDRESS` to the server's private LAN IP and set `APP_URL` to that address with port 3080. Restore secure cookies for HTTPS. The application uses hashed passwords, hashed session tokens, same-origin request checks, family-scoped queries, and registration/login/join throttling. Registration is now available to anyone who can reach the application; email verification and password recovery are not implemented. Keep this proof of concept private.

## Reliability and limits

- Worker runs every minute, using a database lock to prevent concurrent workers and unique job keys to avoid normal duplicate scheduling.
- Reminder jobs retry up to five times. Reminders more than fifteen minutes overdue expire rather than arriving hours late. Weekly digests catch up on Sunday until midnight; an outage through Monday misses that week's digest.
- A crash after SMTP accepts a message but before the database marks it sent can cause a duplicate. SMTP does not provide an exactly-once guarantee.
- Changes cancel pending reminders for the old version. An email already accepted by SMTP cannot be recalled. Weekly digests are snapshots at the time they are queued.
- All-day events use an exclusive end date and midnight local time as the reminder reference. For a one-day all-day event, select the same date for start and end; the form advances the end to the following day.
- Time zone, digest time, and reminder defaults are fixed for this initial build. No per-occurrence edits, private events, cross-family sharing, monthly recurrence, native push/SMS, or two-way calendar sync yet. Separate family spaces are supported.
- AI wording is deferred; the digest currently uses an exact formatted agenda. A wall-display view is also deferred.
- Browser rendering, Docker startup, real PostgreSQL integration, Apple subscription behavior, and actual SMTP delivery must be verified on the target server before relying on the application.

## Backups and maintenance

Back up `.env` securely and make regular database dumps:

```sh
docker compose exec -T db pg_dump -U calendar family_calendar > family-calendar-backup.sql
```

Keep dumps private: they include calendar details and password hashes. Test restoring to a separate test database before relying on the backup. `docker compose down` preserves the named database volume; **do not use `down -v`** unless you intend to delete all calendar data. Changing `POSTGRES_PASSWORD` in `.env` does not change an already-initialized database user's password.

Useful diagnostics:

```sh
docker compose ps
docker compose logs --tail=100 app worker
```

The worker retains email activity for 90 days. The initial application does not provide self-service password resets, account removal, or child-profile editing; those are follow-up work. See [UPGRADE.md](UPGRADE.md) for the family-registration and styled-email upgrade.
