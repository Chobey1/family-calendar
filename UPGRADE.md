# Family registration and styled emails

## Update your server

Your existing accounts, passwords, sessions, children, events, subscription links, family names, and mail history are preserved. Startup runs an additive, repeatable database migration. No new SMTP credentials are required.

From the existing application folder, back up before updating:

```sh
docker compose exec -T db pg_dump -U calendar family_calendar > family-calendar-before-family-update.sql
git pull --ff-only
docker compose up -d --build
docker compose ps
```

Leave `.env` in place. Reload your browser and set the family name in **Family & settings**, for example **Example Family**. Existing names are preserved, including the old default `Our family`. The invitation code and pending join requests are available there too.

Create a new future test event to check the styled email in both inboxes. Historical sent/preview messages retain their original text and are not resent. Pending reminders still using the old plain-text format are upgraded when encountered by the scheduler. Email rendering should be checked in the actual email clients after deployment.

Keep database backups private. `.gitignore` excludes `.sql` backups (but retains schema.sql). Do not use `docker compose down -v`, which deletes the database volume.

## Account flow

1. A new adult selects **Create an account**, then chooses **Create a family** or **Join a family**.
2. Creating a family asks for its name and gives it a random 16-character code. Share the code privately from Family & settings.
3. Entering a code submits a request. The applicant sees a waiting screen and cannot access family events, members, settings, subscription links, or emails.
4. Any existing adult can approve or decline under Family & settings. Adults see fresh requests when opening that panel. Applicants use **Check approval** to refresh their status.
5. Once approved, an adult has the same full family access as the creator. Children remain profiles without logins.

Each account currently belongs to one family. A pending applicant can cancel their request or create their own family. Declined applicants can request again. Codes can be replaced by any approved adult. Rotation disables new requests with the old code; existing pending requests still need explicit review. Codes do not expire automatically.

The first account on a fresh installation requires the server's SETUP_TOKEN; existing installations do not need it again. Registration does not yet verify email ownership or send approval emails, and there is no self-service password recovery. Keep the deployment private while testing.

## Emails

- Reminder subject: **Example Family – Soccer practice in 15 minutes**. One-hour/day reminders use corresponding wording.
- Weekly subject: **Example Family – Our week ahead · Oct 19–Oct 25**.
- A shared original calendar-and-landscape illustration sits above a dark green family-name header. It is embedded inline in the email, without a remote image host; some clients may still hide images.
- Content includes event time, tagged members, venue/address, notes, directions, and buttons for Maps and the calendar.
- Weekly emails group events by day. All emails include plain-text alternatives.
- Recent email activity includes **Open styled email preview** for newly generated HTML messages. Preview access is authenticated and restricted to the message's family.

Weekly timing remains Sunday at 3 p.m. Central. Child events notify all approved adults in their family; adult-only events notify tagged adults. Historical messages and existing pending HTML digests remain snapshots, and emails already delivered cannot be changed.

## Validation

Automated tests cover recurrence/DST, recipients, subject/content escaping, plain-text fallback, schema upgrades with existing records, approval/rejection, and HTTP access between isolated families. Database tests use PGlite, a local PostgreSQL engine. Real Docker/PostgreSQL startup, phone layouts, and email-client rendering still require validation on your server/devices.

Regenerate the tracked illustration with `node scripts/make-email-header.mjs` if its source changes. It uses no external assets.
