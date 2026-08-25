# Main — Production Messaging Architecture

## Current baseline

The repository is a framework-free browser application using native ES modules and Firebase Realtime Database. The current build script generates `firebase-config.js` from Netlify environment variables. The existing UI already has authentication, direct chats, connection discovery, basic groups, presence, typing, and read-state behavior, but the implementation is tightly coupled to global DOM controllers and Realtime Database data.

## Target architecture

The production migration will be incremental. Working UI behavior will be preserved while data access and business logic move behind services and hooks/modules.

```text
src/
  app/                 application bootstrap and routing
  components/          reusable UI components
  pages/               route-level screens
  hooks/               realtime/auth lifecycle hooks
  services/
    auth/              Firebase Authentication
    users/             profile and username operations
    chat/              conversations and messages
    media/             secure media upload client
    notifications/     notification state
  firebase/            Firebase initialization and shared providers
  types/               shared TypeScript models
  utils/               validation, formatting, pagination helpers
functions/              privileged Cloud Functions, including Pinata
```

The migration will not happen as a blind rewrite. Existing root-level JavaScript files remain the compatibility baseline until equivalent functionality is migrated and verified.

## Target Firestore model

### users/{uid}

- `uid`
- `username`
- `usernameLower`
- `displayName`
- `photoCID`
- `bio`
- `privacy`
- `createdAt`
- `updatedAt`

Presence is intentionally kept separate so frequent status changes do not rewrite the profile document.

### presence/{uid}

- `online`
- `lastSeen`
- `updatedAt`

### conversations/{conversationId}

- `type`: `direct | group`
- `title`
- `photoCID`
- `createdBy`
- `lastMessageId`
- `lastMessagePreview`
- `lastMessageAt`
- `createdAt`
- `updatedAt`

### conversations/{conversationId}/members/{uid}

- `uid`
- `role`: `member | admin | owner`
- `joinedAt`
- `muted`
- `pinned`
- `lastReadMessageId`
- `lastReadAt`

### conversations/{conversationId}/messages/{messageId}

- `senderId`
- `type`: `text | image | video | audio | document`
- `text`
- `replyToMessageId`
- `mediaId`
- `createdAt`
- `updatedAt`
- `deletedAt`

Reactions are stored as a subcollection or bounded map depending on the final write/read profile. Read state is stored per member rather than rewriting every message for every reader.

### media/{mediaId}

- `cid`
- `mimeType`
- `fileName`
- `size`
- `senderId`
- `messageId`
- `createdAt`

Media metadata is readable only when the requesting user is authorized for the owning conversation or profile.

### notifications/{uid}/items/{notificationId}

- `type`
- `conversationId`
- `messageId`
- `actorId`
- `createdAt`
- `readAt`

## Realtime strategy

- Conversation lists use bounded realtime listeners for the signed-in user's membership documents.
- Active message views listen only to the newest page/window of a single conversation.
- Older messages use cursor pagination with `createdAt`/document ID ordering.
- Typing state is ephemeral and debounced; it is never written on every input event.
- Presence updates are throttled and use disconnect-safe server timestamps where supported.
- Read state updates the member's cursor instead of every message whenever possible.

## Pinata/IPFS architecture

```text
Browser
  -> authenticated callable/HTTP Cloud Function
  -> validate auth, MIME type and size
  -> Pinata
  -> CID
  -> Firestore media metadata
  -> IPFS gateway URL
```

Pinata JWTs and any other privileged credentials are server-only. The browser never receives the JWT. Gateway failures will surface a recoverable media error instead of a broken image/video element.

## Security model

Firestore rules must derive authorization from `request.auth.uid` and conversation membership documents. Client-provided role/admin fields are never trusted. Group administration will be performed through transactions or server-side operations that verify the existing member role. User profiles can only be changed by their owner, while private conversation data is readable only by members.

## Migration milestones

1. Repository audit and production foundation — this document, environment contract, and branch isolation.
2. React + TypeScript + Vite migration while preserving current behavior.
3. Firebase Authentication completion: verification, reset, persistence, protected routing.
4. User profile and username model.
5. Firestore schema and security rules.
6. Direct messaging with pagination and efficient realtime listeners.
7. Presence, typing, delivery and read state.
8. Group roles and administration.
9. Secure Pinata/IPFS media service.
10. Voice/media messaging.
11. Search and notifications.
12. Settings, privacy and appearance.
13. UI polish, mobile keyboard behavior and performance.
14. Automated tests, security review and production deployment verification.

Each migration step must pass syntax/type/build checks before the next step is started.
