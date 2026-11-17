# Run and build Splitly

## Local Docker walkthrough

1. Start Docker Desktop.
2. Copy `.env.example` to `.env` in this directory.
3. Run `docker compose up --build -d`.
4. Open `http://localhost:18090` and create an account.
5. Open `http://localhost:18025`, select the verification email, and follow its link. Confirm verification in the app.
6. Create a group, include yourself and a friend, and add an expense.
7. If the friend has an email, create and verify that account to see the same shared group.
8. Open the group and record a payment from the suggestions. Full and partial payments are supported.
9. In Storage & account, choose Email my backup. Check Mailpit for the JSON attachment.
10. Sign out, choose Forgot password, and use the reset email in Mailpit. Reset links expire in 30 minutes and work once. Resetting a password revokes existing sessions.

## Google sign-in

Create an OAuth client of type Web application in your Google Cloud project. Set the consent screen and test users as appropriate for your Google project. Configure the following values in `.env`.

```dotenv
PUBLIC_URL=https://your-splitly-host.example
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Register the following authorized redirect URI with Google, using exactly the same public origin as `PUBLIC_URL`.

```text
https://your-splitly-host.example/api/auth/google/callback
```

For browser-only local testing, Google can use `http://localhost:18090/api/auth/google/callback` and `PUBLIC_URL=http://localhost:18090`. Native Google testing needs an address the phone or simulator can reach. On a real phone, `localhost` refers to that phone.

Restart the app service after changing the environment.

```sh
docker compose up -d app
```

The frontend opens Google in the system browser. The backend exchanges Google's authorization code and reads the verified profile from Google's userinfo endpoint. The frontend receives a one-use two-minute exchange code. Its locally generated SHA-256 verifier binds that exchange to the initiating app. The Google client secret stays on the server. Native return URLs use `dev.vijay.splitly://auth`, registered in both native projects.

Reference the [Google web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

## Real email delivery

Set these in `.env` to match your SMTP provider.

```dotenv
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_AUTH=true
SMTP_TLS=true
MAIL_FROM=hello@your-verified-domain.example
PUBLIC_URL=https://your-splitly-host.example
```

Use the SMTP provider's verified sender domain and credentials. Restart the app service. Send a verification email and reset email to your own test account to verify delivery before distributing a phone build.

## Android

Use Node 22 or newer, Java 21 for the Capacitor Android build, and Android Studio with SDK 36. The Spring Boot backend uses Java 17 independently.

```sh
cd frontend
npm ci
VITE_API_URL=https://your-splitly-host.example npm run build
npx cap sync android
npx cap open android
```

Select a device in Android Studio and run App. Use Android Studio's signed bundle flow with your signing key for a distributable release.

For the Android emulator and the local Docker app, build the debug variant with the emulator's host alias.

```sh
VITE_API_URL=http://10.0.2.2:18090 npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

The generated debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. HTTP is enabled by the debug-only manifest. Release builds use HTTPS. On a physical phone, use your deployed HTTPS API address.

## iOS

Use a Mac with Xcode and the iOS SDK. Capacitor uses Swift Package Manager for dependencies.

```sh
cd frontend
npm ci
VITE_API_URL=https://your-splitly-host.example npm run build
npx cap sync ios
npx cap open ios
```

Select your signing team and bundle identifier in Xcode, choose a simulator or connected device, and run App. For a simulator using the local Docker backend, build the UI with `VITE_API_URL=http://localhost:18090` before syncing iOS.

A simulator build can run without distribution signing.

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/splitly-ios CODE_SIGNING_ALLOWED=NO build
```

The app includes a PrivacyInfo manifest with the Preferences and Filesystem API usage reasons. Review the store privacy declarations against your final data practices when preparing a release.

Reference the [Capacitor setup guide](https://capacitorjs.com/docs/getting-started), [Preferences documentation](https://capacitorjs.com/docs/apis/preferences), and [Filesystem documentation](https://capacitorjs.com/docs/apis/filesystem).

## Backend and UI development

Run the database and mail service with Docker, and run the complete app in Docker for the simplest workflow. To change the UI with hot reload while the backend is running, run the following commands.

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies API calls to port 18090. The bundled app at port 18090 updates after a Docker rebuild.

For the backend, Java 17 and Maven are required. Set `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD`, and SMTP environment variables for the database and mail service you want it to use, then run `mvn spring-boot:run` from `backend`. The backend listens on port 8080 by default.

## Tests

```sh
cd backend
mvn test
cd ../frontend
npm ci
npm test
npm run build
cd ..
docker compose up --build -d
python3 scripts/smoke.py
```

The API integration tests use H2 in PostgreSQL compatibility mode. The Docker smoke check uses the actual PostgreSQL database and sends actual SMTP messages into local Mailpit. It creates sample accounts and three sample groups. It writes the sample login to `splitly-demo-account.json` in the operating system’s temporary directory and prints the file path plus a test summary.

For an offline check, open a group, stop the app container with `docker compose stop app`, add an expense, then run `docker compose start app` and use Sync now. Confirm the expense appears once and the pending count returns to zero. Native builds also retain their bundled interface when offline after restarting.

## Deployment settings

Expose the Spring Boot service through your HTTPS host. The Compose file binds web ports to loopback for local use. Configure your host or reverse proxy to reach app port 8080, set `PUBLIC_URL` to its external HTTPS origin, and set `ALLOWED_ORIGINS` to the deployed web origin plus `capacitor://localhost` and `https://localhost` for native clients.

Use a strong database password in `.env`, configure real SMTP, and keep credentials outside source control. The service runs as a non-root user. Put database backups on your host's normal backup schedule. Auth endpoints have a simple in-memory IP throttle. Multiple API instances would need a shared rate limiter. Schema creation is idempotent for this initial version. Add versioned migrations when making subsequent schema changes.
