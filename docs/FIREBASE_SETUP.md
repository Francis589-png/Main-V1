# Firebase setup

## 1. Create the Firebase project

Create a Firebase project and add a Web App.

Enable:

- Authentication → Email/Password
- Realtime Database

## 2. Add the web configuration

Copy the Firebase Web App configuration into `firebase-config.js`.

Do not put service-account JSON, Admin SDK credentials, or private keys in the repository.

## 3. Deploy database rules

With Firebase CLI installed and authenticated:

```bash
firebase use YOUR_PROJECT_ID
firebase deploy --only database
```

The repository's `firebase.json` points Firebase CLI at `database.rules.json`.

## 4. What is implemented

- Email/password registration
- Email/password login
- Auth state persistence through Firebase Auth
- Logout
- User profile record at `users/{uid}`
- Initial Realtime Database rules for user ownership and chat membership

## 5. Next backend phase

The next implementation should replace the demo conversation data with realtime data:

```text
users/{uid}
chats/{chatId}
chats/{chatId}/members/{uid}
chats/{chatId}/messages/{messageId}
```

Messages should contain only the fields needed for chat synchronization, for example:

```json
{
  "senderId": "uid",
  "text": "Hello",
  "type": "text",
  "createdAt": 0
}
```

Large media files should not be stored inside Realtime Database.
