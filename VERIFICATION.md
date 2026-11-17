# Verification

Verified on 17 November 2026.

| Check | Result |
| --- | --- |
| Spring Boot API integration suite | 6 tests passed |
| JavaScript money and offline-ledger checks | 3 tests passed |
| React production build | Passed, approximately 84 KB compressed JavaScript |
| Docker multi-stage build | Passed, including API tests |
| PostgreSQL and SMTP end-to-end smoke check | Passed |
| Android debug build | Passed, approximately 4.3 MB APK |
| iOS simulator build | Passed with Xcode, signing disabled |
| Mobile browser UI | Sign-in, group details, balances, expense entry, and storage controls checked |
| API interruption and recovery | An expense saved during downtime synced once after restart |
| Database persistence across app-container restart | Confirmed |

The Docker check covered signup, verification email delivery, single-use verification links, group sharing after email verification, exact splits, retry deduplication, settlements, denied access for non-members, email backup attachments, backup throttling, password reset, single-use reset links, and session revocation.

The native artifacts are development builds. The Android APK points to `http://10.0.2.2:18090`, for an Android emulator accessing this Mac's Docker app. The iOS simulator app points to `http://localhost:18090`. Rebuild with a reachable HTTPS backend address for physical phones.

Google's real consent flow and real-inbox SMTP delivery require account-specific credentials and remain unverified. The device-bound exchange step is tested locally. Native build completion was checked. The native apps have not been exercised on physical phones or submitted to stores.

The included JSON backups can be retained or processed externally. There is no backup-import interface in this version.

## GitHub checkout verification

The initial `main` commit was cloned from GitHub into a separate directory. `npm ci`, the three frontend tests, the production UI build, and the six backend integration tests passed from that checkout. The Android Gradle wrapper is tracked as executable. Both Compose configurations passed configuration validation, and the PostgreSQL/SMTP smoke check passed again after publication.

`npm audit --omit=dev` reported zero vulnerabilities. The full development dependency audit reported four high-severity findings in Vite's dependency chain, rooted in the [picomatch repeated-extglob ReDoS advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). The registry offered picomatch 4.0.7 as its latest version at verification time. Recheck the advisory and registry for a patched version when updating the build tooling.
