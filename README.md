# Splitly

A lightweight shared-expense app built with React, Capacitor 8, Java 17, Spring Boot 3.5, and PostgreSQL. One React interface runs in the browser and in the included Android and iOS projects.

## What works

- Email/password signup and login, verification emails, and password reset.
- Google sign-in through the system browser, with a short-lived return code bound to the initiating device.
- Groups with named people and optional email addresses. Verified email holders can see groups shared with that address.
- Equal splits across any selected people, payer selection, balances, suggested repayments, and recording full or partial settlements.
- INR, USD, EUR, GBP, AUD, and CAD. Each group has one currency. The overview keeps currencies separate.
- Device storage, queued offline changes, database sync, email backups, and JSON export through the native share sheet or browser download.

Amounts use integer minor units throughout. An expense of 100 paise shared three ways becomes 34, 33, and 33. Stable member IDs determine who gets the extra unit.

## Get the code

```sh
git clone https://github.com/Vijay10336/splitly.git
cd splitly
```

Use [COMMANDS.md](COMMANDS.md) for copy-and-paste commands to run the app, develop the API/UI, build Android and iOS apps, and run tests. Use [RUNBOOK.md](RUNBOOK.md) for Google OAuth, SMTP, and deployment configuration.

## Run with Docker

From this directory, run these commands with Docker Desktop running.

```sh
cp .env.example .env
docker compose up --build -d
```

Open [Splitly](http://localhost:18090) and [the local email inbox](http://localhost:18025). Create an account, then open its verification email in the local inbox. Create a group with at least two people, add an expense, and record a repayment.

The default email service is Mailpit. Verification, reset, and backup emails appear in the local inbox. Configure real SMTP credentials in `.env` to deliver to actual inboxes.

```sh
docker compose logs -f app
docker compose stop
docker compose start
```

The PostgreSQL volume survives stopping and recreating containers. `docker compose down -v` deletes that database volume.

## Android and iOS

See [RUNBOOK.md](RUNBOOK.md) for native build steps, simulator addresses, Google setup, SMTP configuration, and verification commands. Android Studio and Xcode projects are included under `frontend/android` and `frontend/ios`.

For phone builds, configure `VITE_API_URL` to a backend address reachable from the phone, rebuild the UI, and run Capacitor sync. Use HTTPS for deployment.

## Storage

| Location | Stored data | Behavior |
| --- | --- | --- |
| Phone | Account profile, last synced groups, and pending changes | Capacitor Preferences persists a small account snapshot. Browser builds use its localStorage fallback. |
| PostgreSQL | Accounts, password hashes, group memberships, expenses, shares, settlements, hashed sessions, reset links, and processed command IDs | Authoritative shared records and room for future server features. |
| User email | A requested JSON attachment containing synced groups and expenses | Sent only to the account's verified email address. |

Expense changes save on the device before sync. A stable command ID makes retries safe if a connection drops after the server commits. Group row locks serialize concurrent writes. If a change is rejected, it stays in the queue and the error is displayed. Review the data, export a local copy if needed, then use the discard control to remove unsynced changes before entering a corrected change.

After restarting the app, saved expenses remain available offline. Sign in again to sync. Access tokens stay in memory and expire after seven days on the server. Signing out removes the device snapshot, with confirmation if unsynced changes exist. Device snapshots and email attachments contain readable expense data. Phone access protection comes from the device's lock and app sandbox.

Email and downloaded backups are portable JSON exports. This version has no backup-import screen. Device storage holds a whole snapshot and is intended for small personal groups. Large histories can move to SQLite behind `src/storage.js` later.

## Project structure

```text
backend/src/main/java/dev/vijay/splitly/
  AuthService.java          Accounts, sessions, verification, password reset
  GoogleController.java     Google authorization and device-bound return flow
  LedgerService.java        Group permissions, splits, balances, settlements
  LedgerController.java     Sync and backup endpoints
  MailService.java          Verification/reset messages and JSON attachments
  Security.java             Bearer authentication, CORS, basic auth throttling
backend/src/main/resources/schema.sql
frontend/src/
  main.jsx                  App navigation and sync coordinator
  AuthScreen.jsx            Signup, sign-in, verification, and reset screens
  GroupScreen.jsx           Group activity and balances
  forms.jsx                 Group, expense, and settlement entry
  components.jsx            Small reusable UI components
  api.js                    HTTP requests and in-memory session
  ledger.js                 Offline previews and money helpers
  storage.js                Device persistence
  google.js                 Browser/native Google sign-in
frontend/android/           Android Studio project
frontend/ios/               Xcode project
scripts/smoke.py             Full Docker-stack smoke check
```

## Scope of this version

Groups have a fixed member list after creation. Any verified group member can add expenses and record settlements. Recording a settlement updates the ledger. Monetary transfers happen outside the app. There are no expense-edit, deletion, push-notification, or administrative screens yet.

Google's actual account sign-in needs your OAuth credentials. Real email delivery needs your SMTP provider. Store distribution needs your developer accounts, signing configuration, public backend, and store submission work.

## Interface design

The app uses a custom Material UI theme, locally bundled Inter typography, clearer controls, and responsive layouts. See the [design notes and palette](docs/DESIGN.md).
