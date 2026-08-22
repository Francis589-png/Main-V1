# Main V1 — Netlify + Firebase

Main V1 uses Netlify for the frontend and Firebase for authentication/realtime backend services.

## Netlify environment variables

Create these site environment variables in Netlify before the first production deploy:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

The Netlify build generates `firebase-config.js` from these values. Do not commit Firebase service-account credentials or private server keys.

Firebase Web configuration values are intended for the client application; security must come from Firebase Authentication and Realtime Database/Storage rules.

## Netlify setup

1. Import `Francis589-png/Main-V1` into Netlify.
2. Keep the build command as `npm run build`.
3. Keep the publish directory as `.`.
4. Add the seven Firebase environment variables above under the site's environment variables.
5. Deploy.

Netlify automatically rebuilds on pushes to the connected Git branch.

## Firebase setup

1. Create/register the Firebase Web App.
2. Enable Email/Password Authentication.
3. Create Realtime Database.
4. Deploy `database.rules.json` to the Realtime Database.
5. Add the Netlify production domain to Firebase Authentication → Settings → Authorized domains.

## Important

The frontend Firebase configuration is not a substitute for Firebase security rules. Never place Firebase Admin SDK/service-account credentials in the frontend or Netlify build variables that are injected into the browser.
