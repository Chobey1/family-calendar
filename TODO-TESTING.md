# Optional test instance: shared To-Dos

Shared To-Dos are now included in `main`. The original `codex/shared-todos` branch remains available as a historical test branch. For ongoing testing, use `main` as shown below.

## Safest test: separate instance on your server

Replace `SERVER_LAN_IP` below with your own private server address.

These commands create another checkout, containers, and database on port **3081**, leaving the live calendar on **3080**. The named Compose project keeps its database volume separate. Emails are forced to preview mode to avoid sending test reminders.

```sh
cd ~/apps
git clone --branch main https://github.com/Chobey1/family-calendar.git family-calendar-test
cd family-calendar-test
cp ../family-calendar/.env .env
chmod 600 .env
printf '\nAPP_PORT=3081\n' >> .env
sed -i 's|^APP_URL=.*|APP_URL=http://SERVER_LAN_IP:3081|' .env
sed -i 's|^BIND_ADDRESS=.*|BIND_ADDRESS=SERVER_LAN_IP|' .env
sed -i 's|^COOKIE_SECURE=.*|COOKIE_SECURE=false|' .env
sed -i 's|^MAIL_MODE=.*|MAIL_MODE=preview|' .env
sed -i '/^SETUP_TOKEN=/d' .env
printf 'SETUP_TOKEN=%s\n' "$(openssl rand -hex 32)" >> .env
docker compose -p hearth-todo-test up -d --build
```

If the test folder already exists, update that checkout with `git pull --ff-only` instead of cloning again. Adjust the port if 3081 is already used. Open **http://SERVER_LAN_IP:3081 in a private/incognito browser window**. Cookies are shared across ports on the same host, so a private window prevents the test login from replacing your live login.

This is a fresh test database. Create test parent accounts/family and child profiles; the live calendar's existing data is not copied. Retrieve the test setup token privately with `grep '^SETUP_TOKEN=' .env` and enter its value in the first-account setup screen.

For later updates, from this test folder:

```sh
git pull --ff-only
docker compose -p hearth-todo-test up -d --build
```

Stop the test instance without deleting its database:

```sh
docker compose -p hearth-todo-test down
```

## What to try

- Desktop: calendar left, To-Dos right. Narrow screens: calendar above To-Dos. Check Modern and Hearth themes.
- Add a task with title, notes, optional due date, and tags for both adults.
- Active list order: overdue, upcoming by due date, and undated last. Calendar and task person filters operate independently.
- Filter to either tagged adult; both see the same task. Complete it with the round control: it disappears from both active views.
- Open Completed (collapsed initially), then use the checked circle to restore a task.
- Edit a task by clicking its title. Delete from its edit dialog if needed.
- Verify the task never appears as a calendar event, reminder, digest entry, or calendar-feed event.
- In another private browser/device session, use Refresh or wait up to 30 seconds for shared changes. Background refresh runs only while the page is visible.

Tasks belong to the family, not the selected calendar date range. Completed tasks stay stored until deleted. Existing child profiles can be tagged without logins. All approved adults have task access; pending join requests do not.

The database migration only adds a table/index; existing calendar data remains intact. Main now includes the To-Do feature. Running an older version leaves the To-Do table stored but unused. The separate-instance method above avoids changing the live database in the first place.

Automated tests cover task validation, shared completion/restoration, version conflicts, family isolation, task filtering/sorting, and separation from the calendar. Actual phone/desktop layout should also be checked in the test instance.
