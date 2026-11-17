# Build and run commands

Run these commands in a macOS or Linux terminal. Windows users can use WSL for the web/backend workflow and Android Studio for Android builds. iOS builds require macOS and Xcode.

## Clone and run the complete app

Docker Desktop is the only prerequisite for this route.

```sh
git clone https://github.com/Vijay10336/splitly.git
cd splitly
cp .env.example .env
docker compose up --build -d
curl --fail http://localhost:18090/api/health
```

Open [the app](http://localhost:18090) and [the development email inbox](http://localhost:18025). Create an account, verify its email using the development inbox, and create your first group.

```sh
# View logs and container status.
docker compose logs -f app
docker compose ps

# Stop and resume. The database volume persists.
docker compose stop
docker compose start

# Rebuild after changing the source.
docker compose up --build -d
```

## Develop the React interface

Start the Docker stack first. Install Node 22 or newer.

```sh
cd frontend
npm ci
npm run dev
```

Open [the development interface](http://localhost:5173). Vite forwards API requests to the Docker app at port 18090.

## Develop Spring Boot directly

Use Java 17 or newer and Maven 3.9 or newer. From the repository root, start the supporting services and free the app's port.

```sh
docker compose stop app
docker compose -f compose.yaml -f compose.dev.yaml up -d db mail
cd backend
SERVER_PORT=18090 \
DATABASE_URL=jdbc:postgresql://localhost:15432/splitly \
DATABASE_USER=splitly \
DATABASE_PASSWORD=splitly-local \
SMTP_HOST=localhost \
SMTP_PORT=11025 \
mvn spring-boot:run
```

Use the database password configured in `.env` if you changed the example value. Run `npm run dev` from `frontend` in a second terminal and open port 5173. Spring Boot's direct Maven run serves the API. The Docker build bundles the production React interface into its JAR.

Stop the Maven process with Ctrl+C before returning to `docker compose up --build -d` on port 18090.

## Build an Android debug APK

Install Android Studio, Android SDK 36, Java 21, and Node 22 or newer. Set `JAVA_HOME` to your Java 21 installation and `ANDROID_HOME` to the Android SDK path, or configure the SDK location in Android Studio.

From the repository root, build for an Android emulator accessing the local Docker backend.

```sh
cd frontend
npm ci
VITE_API_URL=http://10.0.2.2:18090 npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

The APK is written to `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. With an emulator running and Android platform-tools on your PATH, install it with the following command from `frontend/android`.

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

For a physical phone, rebuild the UI using your reachable HTTPS backend address. Run these commands from `frontend`.

```sh
VITE_API_URL=https://your-splitly-host.example npm run build
npx cap sync android
npx cap open android
```

Choose a connected phone in Android Studio and run App. Use **Build → Generate Signed App Bundle / APK** to create a signed distribution build with your own signing key.

For an Android App Bundle, run the following command from `frontend/android` after configuring release signing in Android Studio/Gradle.

```sh
./gradlew bundleRelease
```

The bundle is written to `app/build/outputs/bundle/release/app-release.aab`. Keep the signing key and passwords outside Git.

## Build an iOS simulator app

Install Xcode with an iOS simulator runtime and Node 22 or newer. From the repository root, run these commands.

```sh
cd frontend
npm ci
VITE_API_URL=http://localhost:18090 npm run build
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/splitly-ios CODE_SIGNING_ALLOWED=NO build
```

The simulator app is written to `/tmp/splitly-ios/Build/Products/Debug-iphonesimulator/App.app`. Open Xcode to select and run a simulator.

```sh
npx cap open ios
```

For a physical iPhone, run the following commands from `frontend`.

```sh
VITE_API_URL=https://your-splitly-host.example npm run build
npx cap sync ios
npx cap open ios
```

Select your Apple development team under **Signing & Capabilities**, connect your phone, and run App. For distribution, select **Product → Archive** and use Xcode Organizer to upload or export with your Apple signing account.

## Run the tests

From the repository root, run these commands.

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

The last command requires Python 3 and the default local Mailpit configuration. It creates sample accounts and groups and checks the complete PostgreSQL/SMTP workflow. See [VERIFICATION.md](VERIFICATION.md) for the checks completed during development.

## Configure Google and real email

Copy the settings in `.env.example` to `.env`. Add your Google OAuth client ID/secret, SMTP settings, and deployed public URL using [RUNBOOK.md](RUNBOOK.md). Native builds also require a reachable backend address in `VITE_API_URL` at build time. These settings are required for your own Google accounts, real inboxes, and physical phones.

After editing server settings, recreate the app service.

```sh
docker compose up -d app
```
