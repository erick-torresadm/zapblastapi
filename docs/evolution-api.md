# Evolution API v2 — Complete Reference

> **Version covered:** 2.1.1 – 2.3.x (Baileys engine)  
> **Base URL:** `https://{your-server}/`  
> **Auth header:** `apikey: <YOUR_API_KEY>` on every request  
> **Content-Type:** `application/json` (unless noted)

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Authentication](#2-authentication)
3. [Instance Management](#3-instance-management)
4. [Send Messages](#4-send-messages)
5. [Chat Controls](#5-chat-controls)
6. [Groups](#6-groups)
7. [Webhooks](#7-webhooks)
8. [Other Event Transports](#8-other-event-transports)
9. [Integrations](#9-integrations)
10. [Error Reference](#10-error-reference)
11. [remoteJid / @lid Issues](#11-remotejid--lid-issues)
12. [Brazilian 9-Digit Phone Numbers](#12-brazilian-9-digit-phone-numbers)
13. [Best Practices](#13-best-practices)

---

## 1. Overview & Architecture

Evolution API is an open-source WhatsApp integration layer built on top of [Baileys](https://github.com/WhiskeySockets/Baileys). It exposes a REST API that lets you:

- Manage multiple WhatsApp sessions ("instances") on one server
- Send every WhatsApp message type (text, media, audio, sticker, location, contact, poll, list, buttons, status/stories, reactions, PTV)
- Receive real-time events via Webhook, WebSocket, RabbitMQ, SQS, or Pusher
- Integrate with Chatwoot, Typebot, OpenAI, Dify, Flowise, n8n, and more

### JID Formats

| Format | When used |
|---|---|
| `5511999999999@s.whatsapp.net` | Individual contact (standard) |
| `5511999999999-1234567890@g.us` | Group |
| `status@broadcast` | Status/broadcast |
| `NNNNNNNNNN@lid` | Linked ID — META privacy feature, replaces `@s.whatsapp.net` for some users (see §11) |

---

## 2. Authentication

### Global API Key

Set in server env as `AUTHENTICATION_API_KEY`. Grants admin access to all instances.

```
apikey: your-global-key
```

### Instance API Key

Each instance can have its own API key returned at creation time. Grants access only to that instance.

```
apikey: instance-specific-key
```

All endpoints require one of these headers. No Bearer token prefix needed.

---

## 3. Instance Management

### 3.1 Create Instance

```
POST /instance/create
```

**Headers:** `apikey`, `Content-Type: application/json`

**Body:**

```json
{
  "instanceName": "my-instance",
  "token": "optional-custom-api-key",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS",
  "number": "5511999999999",
  "mobile": false,
  "rejectCall": false,
  "msgCall": "I cannot answer calls right now",
  "groupsIgnore": false,
  "alwaysOnline": false,
  "readMessages": false,
  "readStatus": false,
  "syncFullHistory": false,
  "webhook": {
    "url": "https://your-domain.com/webhook",
    "byEvents": false,
    "base64": false,
    "enabled": true,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
  },
  "proxy": {
    "host": "proxy.example.com",
    "port": "8080",
    "protocol": "http",
    "username": "user",
    "password": "pass"
  },
  "chatwootAccountId": "1",
  "chatwootToken": "chatwoot-token",
  "chatwootUrl": "https://chatwoot.example.com",
  "chatwootSignMsg": true,
  "chatwootReopenConversation": true,
  "chatwootConversationPending": false,
  "chatwootImportContacts": true,
  "chatwootNameInbox": "WhatsApp",
  "chatwootMergeBrazilContacts": true,
  "chatwootImportMessages": true,
  "chatwootDaysLimitImportMessages": 3
}
```

**Success Response (200):**

```json
{
  "instance": {
    "instanceName": "my-instance",
    "instanceId": "uuid-here",
    "status": "created"
  },
  "hash": {
    "apikey": "generated-or-custom-key"
  },
  "webhook": { "url": "https://your-domain.com/webhook", "enabled": true },
  "qrcode": {
    "code": "2@ABC123...",
    "base64": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

---

### 3.2 Connect Instance (Get QR Code)

```
GET /instance/connect/{instance}
```

Returns a fresh QR code. Scan with WhatsApp mobile → Settings → Linked Devices.

**Response:**

```json
{
  "code": "2@XYZ...",
  "base64": "data:image/png;base64,..."
}
```

> If the instance is already connected the response returns the current connection state instead.

---

### 3.3 Fetch Instances

```
GET /instance/fetchInstances?instanceName=my-instance
```

Omit the query parameter to list all instances (global key required).

**Response (array):**

```json
[
  {
    "instance": {
      "instanceName": "my-instance",
      "instanceId": "uuid",
      "owner": "5511999999999",
      "profileName": "John",
      "profilePictureUrl": "https://...",
      "profileStatus": "Hey there!",
      "status": "open",
      "serverUrl": "https://your-server",
      "apikey": "instance-api-key",
      "connectionStatus": "open",
      "integration": "WHATSAPP-BAILEYS"
    }
  }
]
```

Connection states: `open` | `connecting` | `close`

---

### 3.4 Instance Settings

```
POST /instance/setPresence/{instance}
```

```json
{ "presence": "available" }
```

Presence options: `available` | `unavailable`

---

### 3.5 Logout Instance

```
DELETE /instance/logout/{instance}
```

Disconnects WhatsApp but keeps the instance record. Re-scan QR to reconnect.

**Response:** `{ "status": "SUCCESS", "error": false, "response": { "message": "Instance logged out" } }`

---

### 3.6 Delete Instance

```
DELETE /instance/delete/{instance}
```

Permanently removes the instance and all associated data.

---

### 3.7 Restart Instance

```
PUT /instance/restart/{instance}
```

---

## 4. Send Messages

All send-message endpoints share these common optional fields in the body:

| Field | Type | Description |
|---|---|---|
| `delay` | integer | Milliseconds to wait before sending (simulates typing) |
| `quoted` | object | Quote/reply to a message (`{ key: {id, remoteJid, fromMe}, message: {...} }`) |
| `mentionsEveryOne` | boolean | `@everyone` mention in groups |
| `mentioned` | string[] | Array of numbers to `@mention` (e.g. `["5511999999999"]`) |
| `linkPreview` | boolean | Show URL preview card (text only, default `true`) |

### 4.1 Send Plain Text

```
POST /message/sendText/{instance}
```

```json
{
  "number": "5511999999999",
  "text": "Hello! *bold* _italic_ ~strikethrough~ ```monospace```",
  "delay": 1000,
  "linkPreview": true,
  "mentionsEveryOne": false,
  "mentioned": [],
  "quoted": {
    "key": {
      "id": "BAE5F2D3E4F5A6B7",
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false
    },
    "message": { "conversation": "Original message" }
  }
}
```

**`number` field formats accepted:**

| Format | Notes |
|---|---|
| `5511999999999` | Recommended — digits only, no `+` |
| `5511999999999@s.whatsapp.net` | Full JID also accepted |
| `5511999999999-1234567890@g.us` | Group JID |

**Success Response (201):**

```json
{
  "key": {
    "remoteJid": "5511999999999@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE5A1B2C3D4E5F6"
  },
  "message": {
    "extendedTextMessage": {
      "text": "Hello!",
      "matchedText": "https://...",
      "previewType": "VIDEO"
    }
  },
  "messageTimestamp": "1709550600",
  "status": "PENDING"
}
```

---

### 4.2 Send Media

```
POST /message/sendMedia/{instance}
```

Supports three delivery methods: URL, base64 string, or multipart file upload.

**JSON (URL or base64):**

```json
{
  "number": "5511999999999",
  "mediatype": "image",
  "media": "https://example.com/photo.jpg",
  "caption": "Check this out!",
  "fileName": "photo.jpg",
  "mimetype": "image/jpeg",
  "delay": 1000
}
```

| `mediatype` | Accepted formats | Max size |
|---|---|---|
| `image` | JPG, PNG, GIF, WEBP | 5 MB |
| `video` | MP4, 3GP, AVI, MOV | 16 MB |
| `document` | PDF, DOC, XLS, PPT, ZIP, … | 100 MB |
| `audio` | MP3, OGG, WAV, AAC | 16 MB |

> **Note:** For voice notes (PTT/push-to-talk), use `sendWhatsAppAudio` or `sendAudio` instead.

**Base64 document example:**

```json
{
  "number": "5511999999999",
  "mediatype": "document",
  "media": "data:application/pdf;base64,JVBERi0x...",
  "fileName": "contract.pdf",
  "caption": "Please sign and return"
}
```

**File Upload (multipart/form-data):**

```
curl -X POST https://server/message/sendMedia/my-instance \
  -H "apikey: KEY" \
  -F "number=5511999999999" \
  -F "mediatype=document" \
  -F "caption=Invoice" \
  -F "file=@/path/to/invoice.pdf"
```

---

### 4.3 Send Audio (Voice Note / PTT)

```
POST /message/sendWhatsAppAudio/{instance}
```

Sends audio as a WhatsApp voice note (push-to-talk waveform UI).

```json
{
  "number": "5511999999999",
  "audio": "https://example.com/audio.ogg",
  "delay": 1000,
  "encoding": true
}
```

`encoding: true` — re-encode to OGG/Opus format compatible with WhatsApp (recommended).  
`audio` — URL or base64 string (`data:audio/ogg;base64,...`).

---

### 4.4 Send Sticker

```
POST /message/sendSticker/{instance}
```

```json
{
  "number": "5511999999999",
  "sticker": "https://example.com/sticker.webp",
  "delay": 500
}
```

`sticker` — URL or base64 of a WebP file (static or animated).

---

### 4.5 Send Location

```
POST /message/sendLocation/{instance}
```

```json
{
  "number": "5511999999999",
  "name": "Evolution HQ",
  "address": "Av. Paulista, 1000, São Paulo, SP",
  "latitude": -23.5618,
  "longitude": -46.6555,
  "delay": 0
}
```

---

### 4.6 Send Contact (vCard)

```
POST /message/sendContact/{instance}
```

```json
{
  "number": "5511999999999",
  "contact": [
    {
      "fullName": "John Doe",
      "wuid": "5511888888888",
      "phoneNumber": "5511888888888",
      "organization": "Acme Corp",
      "email": "john@acme.com",
      "url": "https://acme.com"
    }
  ]
}
```

- `fullName` and `phoneNumber` are required; all other fields optional.
- `wuid` must be numeric only (WhatsApp User ID).
- Up to 5 contacts per message recommended.

---

### 4.7 Send Reaction

```
POST /message/sendReaction/{instance}
```

```json
{
  "key": {
    "remoteJid": "5511999999999@s.whatsapp.net",
    "fromMe": false,
    "id": "BAE5F2D3E4F5A6B7"
  },
  "reaction": "👍"
}
```

Send an empty string `""` as `reaction` to remove an existing reaction.

---

### 4.8 Send Poll

```
POST /message/sendPoll/{instance}
```

```json
{
  "number": "5511999999999",
  "name": "What is your favorite color?",
  "selectableCount": 1,
  "values": ["Red", "Green", "Blue", "Yellow"],
  "delay": 1000
}
```

- `selectableCount`: number of options a user can select (1 = single-choice).
- `values`: array of option strings (max 12).

---

### 4.9 Send List

```
POST /message/sendList/{instance}
```

```json
{
  "number": "5511999999999",
  "title": "Main Menu",
  "description": "Choose an option below",
  "buttonText": "See Options",
  "footerText": "Powered by Evolution API",
  "sections": [
    {
      "title": "Services",
      "rows": [
        { "title": "Support", "description": "Talk to our support team", "rowId": "support" },
        { "title": "Sales", "description": "Talk to sales", "rowId": "sales" }
      ]
    },
    {
      "title": "Info",
      "rows": [
        { "title": "About Us", "description": "Learn more", "rowId": "about" }
      ]
    }
  ],
  "delay": 1000
}
```

> **Note:** List messages only render on WhatsApp mobile (Android/iOS). Desktop shows a fallback.

---

### 4.10 Send Buttons

```
POST /message/sendButtons/{instance}
```

```json
{
  "number": "5511999999999",
  "title": "Hello!",
  "description": "Please choose an option",
  "footer": "Evolution API",
  "buttons": [
    { "type": "reply", "displayText": "Option 1", "id": "opt1" },
    { "type": "reply", "displayText": "Option 2", "id": "opt2" },
    { "type": "copy", "displayText": "Copy Code", "copyCode": "PROMO2024" },
    { "type": "url", "displayText": "Visit Site", "url": "https://example.com" },
    { "type": "call", "displayText": "Call Us", "phoneNumber": "5511999999999" }
  ],
  "mediaMessage": {
    "type": "image",
    "media": "https://example.com/banner.jpg"
  },
  "delay": 1000
}
```

Button types: `reply` | `url` | `copy` | `call`

> **Note:** Button messages require a WhatsApp Business account and only render on mobile.

---

### 4.11 Send Status (Stories)

```
POST /message/sendStatus/{instance}
```

```json
{
  "type": "text",
  "content": "Good morning! ☀️",
  "backgroundColor": "#FF5733",
  "font": 1,
  "statusJidList": ["5511999999999@s.whatsapp.net", "5511888888888@s.whatsapp.net"],
  "allContacts": false,
  "delay": 0
}
```

For image/video status:

```json
{
  "type": "image",
  "content": "https://example.com/banner.jpg",
  "caption": "Check this out!",
  "statusJidList": ["5511999999999@s.whatsapp.net"],
  "allContacts": true
}
```

`type` options: `text` | `image` | `video` | `audio`  
`font` (text type): `1`=SERIF, `2`=NORICAN, `3`=BRYNDAN_WRITE, `4`=BEBASNEUE, `5`=OSWALD

---

### 4.12 Send PTV (Picture-in-Picture Video / Video Note)

```
POST /message/sendPtv/{instance}
```

```json
{
  "number": "5511999999999",
  "video": "https://example.com/video.mp4",
  "delay": 0
}
```

Sends a circular video note (like Telegram's video messages). Must be MP4, ideally square, under 16MB.

---

## 5. Chat Controls

### 5.1 Check Is WhatsApp

```
POST /chat/whatsappNumbers/{instance}
```

Check whether phone numbers are registered on WhatsApp.

```json
{
  "numbers": ["5511999999999", "5511888888888", "5521999999999"]
}
```

**Response:**

```json
[
  {
    "exists": true,
    "jid": "5511999999999@s.whatsapp.net",
    "number": "5511999999999"
  },
  {
    "exists": false,
    "jid": "5511888888888@s.whatsapp.net",
    "number": "5511888888888"
  }
]
```

> ⚠️ **@lid caveat:** If a contact uses `@lid`, their JID returned here may be `@lid`-suffixed, not `@s.whatsapp.net`. See §11.

---

### 5.2 Fetch Profile

```
GET /chat/fetchProfile/{instance}?number=5511999999999
```

Or POST:

```
POST /chat/fetchProfile/{instance}
```

```json
{ "number": "5511999999999" }
```

**Response:**

```json
{
  "wuid": "5511999999999@s.whatsapp.net",
  "name": "John Doe",
  "numberExists": true,
  "picture": "https://pps.whatsapp.net/v/...",
  "status": "Hey there! I am using WhatsApp.",
  "isBusiness": false
}
```

---

### 5.3 Fetch Profile Picture URL

```
GET /chat/fetchProfilePictureUrl/{instance}?number=5511999999999&sendUrl=true
```

---

### 5.4 Find Contacts

```
GET /chat/findContacts/{instance}?where={"pushName":"John"}
```

Returns all cached contacts matching the optional filter.

---

### 5.5 Find Messages

```
GET /chat/findMessages/{instance}?where={"key":{"remoteJid":"5511999999999@s.whatsapp.net"}}&limit=20
```

---

### 5.6 Find Chats

```
GET /chat/findChats/{instance}
```

---

### 5.7 Archive Chat

```
PATCH /chat/archiveChat/{instance}
```

```json
{
  "chat": "5511999999999@s.whatsapp.net",
  "archive": true
}
```

---

### 5.8 Mark as Read

```
POST /chat/markMessageAsRead/{instance}
```

```json
{
  "readMessages": [
    {
      "id": "BAE5F2D3E4F5A6B7",
      "fromMe": false,
      "remoteJid": "5511999999999@s.whatsapp.net"
    }
  ]
}
```

---

### 5.9 Delete Message for Everyone

```
DELETE /chat/deleteMessageForEveryone/{instance}
```

```json
{
  "id": "BAE5F2D3E4F5A6B7",
  "remoteJid": "5511999999999@s.whatsapp.net",
  "fromMe": true
}
```

---

### 5.10 Update Message

```
PATCH /chat/updateMessage/{instance}
```

Edit a sent text message.

```json
{
  "number": "5511999999999",
  "key": {
    "id": "BAE5F2D3E4F5A6B7",
    "remoteJid": "5511999999999@s.whatsapp.net",
    "fromMe": true
  },
  "text": "Updated message text"
}
```

---

### 5.11 Send Presence (Typing Indicator)

```
POST /chat/sendPresence/{instance}
```

```json
{
  "number": "5511999999999",
  "options": {
    "presence": "composing",
    "delay": 3000
  }
}
```

`presence`: `composing` | `recording` | `paused` | `available` | `unavailable`

---

### 5.12 Block / Unblock

```
PUT /chat/updateBlockStatus/{instance}
```

```json
{
  "number": "5511999999999",
  "status": "block"
}
```

`status`: `block` | `unblock`

---

## 6. Groups

### 6.1 Create Group

```
POST /group/create/{instance}
```

```json
{
  "subject": "My Awesome Group",
  "description": "Welcome to the group!",
  "participants": [
    "5511999999999",
    "5511888888888"
  ]
}
```

**Response:**

```json
{
  "groupJid": "5511999999999-1234567890@g.us",
  "inviteCode": "AbCdEfGhIjKl",
  "participants": [...]
}
```

---

### 6.2 Update Group Subject

```
PUT /group/updateGroupSubject/{instance}?groupJid=5511999999999-1234567890@g.us
```

```json
{ "subject": "New Group Name" }
```

---

### 6.3 Update Group Description

```
PUT /group/updateGroupDescription/{instance}?groupJid=5511999999999-1234567890@g.us
```

```json
{ "description": "Updated group description" }
```

---

### 6.4 Fetch All Groups

```
GET /group/fetchAllGroups/{instance}?getParticipants=true
```

---

### 6.5 Find Group Members

```
GET /group/participants/{instance}?groupJid=5511999999999-1234567890@g.us
```

**Response:**

```json
{
  "participants": [
    { "id": "5511999999999@s.whatsapp.net", "admin": "superadmin" },
    { "id": "5511888888888@s.whatsapp.net", "admin": null }
  ]
}
```

---

### 6.6 Update Group Members (Add / Remove / Promote / Demote)

```
PUT /group/updateParticipant/{instance}?groupJid=5511999999999-1234567890@g.us
```

```json
{
  "action": "add",
  "participants": ["5521999999999", "5531999999999"]
}
```

`action`: `add` | `remove` | `promote` | `demote`

---

### 6.7 Invite Link

```
GET /group/inviteCode/{instance}?groupJid=5511999999999-1234567890@g.us
```

**Response:** `{ "inviteCode": "AbCdEfGhIjKl", "inviteUrl": "https://chat.whatsapp.com/AbCdEfGhIjKl" }`

---

### 6.8 Revoke Invite Link

```
PUT /group/revokeInviteCode/{instance}?groupJid=5511999999999-1234567890@g.us
```

---

### 6.9 Find Group by Invite Code

```
GET /group/inviteInfo/{instance}?inviteCode=AbCdEfGhIjKl
```

---

### 6.10 Leave Group

```
DELETE /group/leaveGroup/{instance}?groupJid=5511999999999-1234567890@g.us
```

---

### 6.11 Update Group Settings

```
PUT /group/updateSetting/{instance}?groupJid=5511999999999-1234567890@g.us
```

```json
{ "action": "announcement" }
```

`action`: `announcement` (only admins can send) | `not_announcement` (everyone can send) | `locked` (only admins can edit settings) | `unlocked`

---

### 6.12 Toggle Ephemeral Messages

```
PATCH /group/toggleEphemeral/{instance}?groupJid=5511999999999-1234567890@g.us
```

```json
{ "expiration": 86400 }
```

`expiration`: seconds (0 = disable, 86400 = 24h, 604800 = 7d, 7776000 = 90d)

---

## 7. Webhooks

### 7.1 Set Webhook

```
POST /webhook/set/{instance}
```

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://your-domain.com/webhook",
    "byEvents": false,
    "base64": false,
    "headers": {
      "x-custom-auth": "secret123",
      "jwt_key": "your-jwt-secret"
    },
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_EDITED",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "QRCODE_UPDATED",
      "CONNECTION_UPDATE",
      "CONTACTS_UPSERT",
      "CONTACTS_UPDATE",
      "CHATS_UPSERT",
      "CHATS_UPDATE",
      "CHATS_DELETE",
      "GROUPS_UPSERT",
      "GROUPS_UPDATE",
      "GROUP_PARTICIPANTS_UPDATE",
      "PRESENCE_UPDATE",
      "LABELS_EDIT",
      "LABELS_ASSOCIATION",
      "CALL",
      "TYPEBOT_START",
      "TYPEBOT_CHANGE_STATUS"
    ]
  }
}
```

When `byEvents: true`, events POST to `{url}/{event-slug}`, e.g.:
- `https://your-domain.com/webhook/messages-upsert`
- `https://your-domain.com/webhook/connection-update`

When `jwt_key` is provided in headers, Evolution generates a JWT and sends it as `Authorization: Bearer <token>` with each request.

---

### 7.2 Find Webhook

```
GET /webhook/find/{instance}
```

---

### 7.3 Webhook Payload Structure

All webhook POSTs share this envelope:

```json
{
  "event": "messages.upsert",
  "instance": "my-instance",
  "data": { /* event-specific */ },
  "destination": "https://your-domain.com/webhook",
  "date_time": "2024-03-04T10:30:00.000Z",
  "sender": "5511999999999",
  "server_url": "https://your-evolution-server.com",
  "apikey": "instance-api-key"
}
```

---

### 7.4 Event Payloads

#### `messages.upsert` — Incoming / Outgoing Message

```json
{
  "event": "messages.upsert",
  "instance": "my-instance",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0XXXXX"
    },
    "pushName": "John Doe",
    "message": {
      "conversation": "Hello!"
    },
    "messageType": "conversation",
    "messageTimestamp": 1709550600,
    "instanceId": "uuid",
    "source": "android"
  }
}
```

> ⚠️ `remoteJid` may be `NNNN@lid` for some contacts. See §11.

Common `messageType` values: `conversation` | `extendedTextMessage` | `imageMessage` | `videoMessage` | `audioMessage` | `documentMessage` | `stickerMessage` | `locationMessage` | `contactMessage` | `reactionMessage` | `pollCreationMessage` | `listMessage` | `buttonsMessage`

#### `connection.update`

```json
{
  "event": "connection.update",
  "instance": "my-instance",
  "data": {
    "state": "open",
    "statusReason": 200
  }
}
```

`state`: `open` | `connecting` | `close`

#### `qrcode.updated`

```json
{
  "event": "qrcode.updated",
  "instance": "my-instance",
  "data": {
    "qrcode": {
      "code": "2@ABC...",
      "base64": "data:image/png;base64,iVBORw0KGgo..."
    }
  }
}
```

#### `messages.update` — Read Receipts / Status

```json
{
  "event": "messages.update",
  "instance": "my-instance",
  "data": [
    {
      "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": true, "id": "BAE5XXX" },
      "update": { "status": 3 }
    }
  ]
}
```

Status codes: `1`=PENDING, `2`=SERVER_ACK, `3`=DELIVERY_ACK, `4`=READ, `5`=PLAYED

#### `groups.upsert` — Group Created/Joined

```json
{
  "event": "groups.upsert",
  "instance": "my-instance",
  "data": [
    {
      "id": "5511999999999-1234567890@g.us",
      "subject": "My Group",
      "subjectOwner": "5511999999999@s.whatsapp.net",
      "subjectTime": 1709550600,
      "size": 5,
      "creation": 1709550600,
      "owner": "5511999999999@s.whatsapp.net",
      "desc": "Group description",
      "participants": [
        { "id": "5511999999999@s.whatsapp.net", "admin": "superadmin" }
      ]
    }
  ]
}
```

#### `group.participants.update`

```json
{
  "event": "group.participants.update",
  "instance": "my-instance",
  "data": {
    "id": "5511999999999-1234567890@g.us",
    "author": "5511999999999@s.whatsapp.net",
    "participants": ["5521999999999@s.whatsapp.net"],
    "action": "add"
  }
}
```

`action`: `add` | `remove` | `promote` | `demote`

---

### 7.5 Global Webhook Environment Variables

```env
WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=https://your-domain.com/webhook
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false
WEBHOOK_REQUEST_TIMEOUT_MS=60000

# Retry / backoff
WEBHOOK_RETRY_MAX_ATTEMPTS=10
WEBHOOK_RETRY_INITIAL_DELAY_SECONDS=5
WEBHOOK_RETRY_USE_EXPONENTIAL_BACKOFF=true
WEBHOOK_RETRY_MAX_DELAY_SECONDS=300
WEBHOOK_RETRY_JITTER_FACTOR=0.2
WEBHOOK_RETRY_NON_RETRYABLE_STATUS_CODES=400,401,403,404,422

# Event toggles
WEBHOOK_EVENTS_APPLICATION_STARTUP=false
WEBHOOK_EVENTS_QRCODE_UPDATED=true
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_MESSAGES_UPDATE=true
WEBHOOK_EVENTS_MESSAGES_EDITED=true
WEBHOOK_EVENTS_MESSAGES_DELETE=true
WEBHOOK_EVENTS_SEND_MESSAGE=true
WEBHOOK_EVENTS_CONTACTS_SET=true
WEBHOOK_EVENTS_CONTACTS_UPSERT=true
WEBHOOK_EVENTS_CONTACTS_UPDATE=true
WEBHOOK_EVENTS_PRESENCE_UPDATE=true
WEBHOOK_EVENTS_CHATS_SET=true
WEBHOOK_EVENTS_CHATS_UPSERT=true
WEBHOOK_EVENTS_CHATS_UPDATE=true
WEBHOOK_EVENTS_CHATS_DELETE=true
WEBHOOK_EVENTS_GROUPS_UPSERT=true
WEBHOOK_EVENTS_GROUPS_UPDATE=true
WEBHOOK_EVENTS_GROUP_PARTICIPANTS_UPDATE=true
WEBHOOK_EVENTS_LABELS_EDIT=true
WEBHOOK_EVENTS_LABELS_ASSOCIATION=true
WEBHOOK_EVENTS_CALL=true
WEBHOOK_EVENTS_ERRORS=false
WEBHOOK_EVENTS_ERRORS_WEBHOOK=
```

---

## 8. Other Event Transports

### 8.1 WebSocket

Connect to `ws://{server}/{instance}/events` (or `wss://`). Events are emitted in real-time with the same JSON envelope as webhooks.

### 8.2 RabbitMQ

Set endpoint:

```
POST /rabbitmq/set/{instance}
```

```json
{
  "rabbitmq": {
    "enabled": true,
    "uri": "amqp://user:pass@localhost:5672",
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }
}
```

### 8.3 Amazon SQS

```
POST /sqs/set/{instance}
```

```json
{
  "sqs": {
    "enabled": true,
    "accessKeyId": "AKIA...",
    "secretAccessKey": "...",
    "accountId": "123456789012",
    "region": "us-east-1",
    "events": ["MESSAGES_UPSERT"]
  }
}
```

### 8.4 Pusher

```
POST /pusher/set/{instance}
```

```json
{
  "pusher": {
    "enabled": true,
    "appId": "app-id",
    "key": "app-key",
    "secret": "app-secret",
    "cluster": "us2",
    "useTLS": true,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }
}
```

---

## 9. Integrations

### 9.1 Typebot

```
POST /typebot/set/{instance}
```

```json
{
  "typebot": {
    "enabled": true,
    "url": "https://typebot.example.com",
    "typebot": "my-typebot-id",
    "expire": 20,
    "keywordFinish": "#stop",
    "delayMessage": 1000,
    "unknownMessage": "Sorry, I didn't understand",
    "listeningFromMe": false,
    "stopBotFromMe": false,
    "keepOpen": false
  }
}
```

### 9.2 OpenAI

```
POST /openai/set/{instance}
```

```json
{
  "openai": {
    "enabled": true,
    "openaiCredsId": "creds-uuid",
    "triggerType": "keyword",
    "triggerOperator": "equals",
    "triggerValue": "ai",
    "expire": 30,
    "keywordFinish": "#exit",
    "delayMessage": 1000,
    "unknownMessage": "I didn't understand",
    "listeningFromMe": false,
    "stopBotFromMe": false,
    "keepOpen": false,
    "speechToText": false
  }
}
```

### 9.3 Chatwoot

Configured at instance creation or via:

```
POST /chatwoot/set/{instance}
```

```json
{
  "chatwoot": {
    "enabled": true,
    "accountId": "1",
    "token": "chatwoot-user-access-token",
    "url": "https://chatwoot.example.com",
    "signMsg": true,
    "reopenConversation": true,
    "conversationPending": false,
    "nameInbox": "WhatsApp",
    "mergeBrazilContacts": true,
    "importContacts": true,
    "importMessages": true,
    "daysLimitImportMessages": 3,
    "organization": "",
    "logo": ""
  }
}
```

---

## 10. Error Reference

### HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 / 201 | Success |
| 400 | Bad Request — invalid payload, missing fields, JID issue |
| 401 | Unauthorized — missing or invalid `apikey` |
| 404 | Not Found — instance doesn't exist or number not on WhatsApp |
| 422 | Unprocessable Entity — validation failure |
| 500 | Internal Server Error |

### Common Error Bodies

```json
{ "status": 400, "error": "Bad Request", "message": "..." }
```

| Error message | Cause | Fix |
|---|---|---|
| `jidOptions.exists false` | Trying to send to a JID that WhatsApp says doesn't exist — commonly triggered by `@lid` JIDs | Use phone-based JID or see §11 |
| `Owned media must be a url or base64` | `media` field is neither URL nor base64 | Fix media value |
| `For base64 the file name must be informed` | Sending base64 document without `fileName` | Add `fileName` field |
| `fullName cannot be empty` | Empty `fullName` in contact | Provide non-empty name |
| `wuid must be a numeric string` | `wuid` contains non-numeric chars | Strip non-digits |
| `Instance not found` | Instance name is wrong or deleted | Check instance name |
| `not-authorized` | API key incorrect | Check `apikey` header |
| `Unknown argument "lid"` | Database query received `@lid` JID unexpectedly | Update to latest Evolution API |
| `connect ECONNREFUSED` | Can't reach WhatsApp servers | Check network/proxy |

---

## 11. remoteJid / @lid Issues

### Background

WhatsApp is rolling out **Linked IDs (`@lid`)** — a privacy-first identifier that replaces the phone-number-based `@s.whatsapp.net` JID for some users. As of 2025–2026, this is an ongoing migration and affects Evolution API (and the underlying Baileys library) in multiple ways.

### Symptoms

1. **Webhook payloads** arrive with `remoteJid: "123456789@lid"` instead of `5511999999999@s.whatsapp.net`
2. **Sending to `@lid`** returns HTTP 400: `BadRequestException: jidOptions.exists false`
3. **`/chat/findContacts`** returns stale `@lid` entries
4. **`Chat` table** stops creating new rows for `@lid` contacts
5. **Typebot / Chatwoot / n8n** automations break because they try to send to the `@lid` JID
6. **Group participant-leave events** carry `@lid` instead of a phone JID

### Root Cause

Baileys (the WhatsApp Web library) has incomplete `@lid → @s.whatsapp.net` mapping in some code paths. Evolution API inherits this limitation.

### Partial Fix (v2.3.x+)

PR [#2544](https://github.com/evolution-foundation/evolution-api/pull/2544) allows `@lid` contacts to **bypass the `onWhatsApp` validation** when sending messages — so the send attempt is made even if the JID type is `@lid`. This partially resolves the 400 error but does not guarantee delivery.

### Recommended Workarounds

**Option A — Extract phone from `senderPn`**

When a webhook arrives with `@lid`, check for the `senderPn` field:

```js
function resolveJid(payload) {
  let remoteJid = payload.data?.key?.remoteJid ?? "";
  if (remoteJid.endsWith("@lid")) {
    const senderPn = payload.data?.key?.senderPn
                  || payload.data?.senderPn
                  || "";
    if (senderPn) {
      remoteJid = `${senderPn.replace(/\D/g, "")}@s.whatsapp.net`;
    } else {
      // Cannot resolve — skip or queue for retry
      console.warn("Unresolvable @lid JID, no senderPn:", remoteJid);
      return null;
    }
  }
  return remoteJid;
}
```

**Option B — Use `pushName` + contact lookup**

If `senderPn` is absent, query `/chat/findContacts` using the `pushName` and match against known contacts.

**Option C — Ask the user to initiate**

For business flows, encourage users to initiate the conversation. The first message from a user typically carries enough context to resolve the JID.

**Option D — n8n / Automation platforms**

Add a pre-processing node that intercepts `@lid` JIDs before sending:

```js
// n8n Function node
const data = $input.first().json;
const remoteJid = data.body?.data?.key?.remoteJid || "";
const senderPn  = data.body?.data?.key?.senderPn  || "";

if (remoteJid.endsWith("@lid") && senderPn) {
  data.body.data.key.remoteJid = `${senderPn.replace(/\D/g, "")}@s.whatsapp.net`;
}
return [{ json: data }];
```

### Status (as of 2026)

The meta-issue [#1872](https://github.com/evolution-foundation/evolution-api/issues/1872) tracks all `@lid` problems. The fix requires Baileys-level `@lid → @s.whatsapp.net` mapping. Monitor this issue for updates. Always run the **latest stable release** to get partial fixes as they land.

---

## 12. Brazilian 9-Digit Phone Numbers

### Background

Brazil added a 9th digit to mobile numbers in most area codes starting in 2012. Before, mobile numbers had 8 digits (DDDs 11–99). The format changed from:

- **Old:** `55` + DDD (2 digits) + number (8 digits) = 12 digits total  
  e.g., `5511 9999-9999` → `551199999999`
- **New:** `55` + DDD (2 digits) + `9` + number (8 digits) = 13 digits total  
  e.g., `5511 9 9999-9999` → `5511999999999`

### The Problem

WhatsApp stores some older Brazilian numbers **without** the 9th digit (12-digit format), while newer contacts have 13 digits. When you query a 13-digit number, the API may say `exists: false` because WhatsApp knows it as a 12-digit JID (or vice-versa).

### Detection & Retry Strategy

Always try **both variants** for Brazilian numbers (DDD 11–99):

```js
function getBrazilianVariants(number) {
  // Strip any non-digit characters
  const digits = number.replace(/\D/g, "");
  
  if (!digits.startsWith("55")) return [digits]; // Not Brazilian
  
  const ddd    = digits.slice(2, 4);
  const rest   = digits.slice(4);
  
  if (rest.length === 9 && rest.startsWith("9")) {
    // Has 9th digit → also try without it
    return [digits, "55" + ddd + rest.slice(1)];
  } else if (rest.length === 8) {
    // Missing 9th digit → also try with it
    return [digits, "55" + ddd + "9" + rest];
  }
  
  return [digits];
}

async function sendTextBrazilianSafe(instance, number, text, apikey, baseUrl) {
  const variants = getBrazilianVariants(number);
  
  for (const variant of variants) {
    // First check if number exists
    const checkRes = await fetch(`${baseUrl}/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: [variant] })
    }).then(r => r.json());
    
    const entry = checkRes[0];
    if (entry?.exists) {
      // Send to the JID returned by the check (may differ from what we sent)
      return fetch(`${baseUrl}/message/sendText/${instance}`, {
        method: "POST",
        headers: { apikey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: entry.jid, text })
      }).then(r => r.json());
    }
  }
  
  throw new Error(`Number ${number} not found on WhatsApp (tried ${variants.join(", ")})`);
}
```

### Important Notes

- The `number` field in send endpoints accepts both 12- and 13-digit Brazilian numbers; Evolution API internally queries WhatsApp's servers (`onWhatsApp`) to resolve the correct JID.
- If you receive a `remoteJid` from a webhook, **always use that exact JID** to reply — don't reconstruct it from a stored phone number. WhatsApp chose that JID for a reason.
- Some DDD codes (e.g., 21 Rio, 81 Recife) had issues in older versions. These were fixed in PR [#382](https://github.com/EvolutionAPI/evolution-api/pull/382) and [#393](https://github.com/EvolutionAPI/evolution-api/pull/393).

---

## 13. Best Practices

### Number Formatting

```
✅  5511999999999          (digits only, country code + DDD + number)
✅  5511999999999@s.whatsapp.net  (full JID)
✅  5511999999999-1234567890@g.us (group JID)
❌  +55 11 99999-9999      (spaces, dashes, + sign)
❌  11999999999            (missing country code)
```

### Always Use the `remoteJid` from Webhook to Reply

```js
// ✅ Correct — use the JID exactly as received
const jid = payload.data.key.remoteJid;
sendText(instance, jid, "Reply text");

// ❌ Wrong — reconstructing may get the digit-count wrong
const jid = payload.data.pushName + "@s.whatsapp.net";
```

### Rate Limiting & Delays

- Add `delay` (milliseconds) to simulate human typing and avoid spam detection.
- Recommended: 1000–3000ms for automated messages.
- For bulk sends, space messages at least 1–2 seconds apart.
- WhatsApp may ban instances that send messages too fast.

### Instance Lifecycle

```
create → connect (scan QR) → open (connected)
                           ↓
                     logout / delete
```

- Monitor `connection.update` events. If state goes to `close`, re-connect or re-scan.
- Keep `syncFullHistory: false` for faster initial sync unless you need history.

### Idempotency for Webhooks

Evolution API retries failed webhook deliveries with exponential backoff (up to 10 attempts). Your handler **must be idempotent**:

```js
const processed = new Set();

app.post("/webhook", (req, res) => {
  const { event, data } = req.body;
  const msgId = data?.key?.id;
  
  if (msgId && processed.has(msgId)) {
    return res.sendStatus(200); // Already handled
  }
  
  // Process...
  if (msgId) processed.add(msgId);
  res.sendStatus(200);
});
```

### Respond to Webhooks Within Timeout

Your endpoint must respond HTTP 200–299 within `WEBHOOK_REQUEST_TIMEOUT_MS` (default 60s). Process events asynchronously:

```js
app.post("/webhook", (req, res) => {
  res.sendStatus(200); // Respond immediately
  processEventAsync(req.body); // Handle in background
});
```

### Media Best Practices

- Prefer **URLs** over base64 (smaller payload, faster delivery).
- Ensure media URLs are **publicly accessible** (no auth).
- For documents sent as base64, always include `fileName`.
- Use `sendWhatsAppAudio` (not `sendMedia` with `audio`) for voice notes.

### Group Messaging

- For mentions, include participant JIDs in `mentioned` **and** the `@number` text in the message body.
- Use `mentionsEveryOne: true` carefully — WhatsApp may throttle or ban for spam.
- Always verify participants with `GET /group/participants/{instance}` before targeting.

### Security

- Never expose your global API key client-side.
- Use per-instance API keys for individual services.
- Validate JWT tokens on incoming webhooks when using `jwt_key`.
- Use HTTPS for webhook URLs.
- Whitelist Evolution API server IP(s) if your firewall allows it.

### Monitoring

```env
WEBHOOK_EVENTS_ERRORS=true
WEBHOOK_EVENTS_ERRORS_WEBHOOK=https://your-domain.com/webhook-errors
```

Set up alerts on `connection.update` with `state: close` to detect disconnections immediately.

---

## Quick Reference — Endpoint Summary

| Method | Path | Description |
|---|---|---|
| POST | `/instance/create` | Create instance |
| GET | `/instance/connect/{instance}` | Get QR code |
| GET | `/instance/fetchInstances` | List instances |
| DELETE | `/instance/logout/{instance}` | Disconnect |
| DELETE | `/instance/delete/{instance}` | Remove instance |
| PUT | `/instance/restart/{instance}` | Restart |
| POST | `/message/sendText/{instance}` | Send text |
| POST | `/message/sendMedia/{instance}` | Send image/video/doc/audio file |
| POST | `/message/sendWhatsAppAudio/{instance}` | Send voice note |
| POST | `/message/sendSticker/{instance}` | Send sticker |
| POST | `/message/sendLocation/{instance}` | Send location |
| POST | `/message/sendContact/{instance}` | Send vCard |
| POST | `/message/sendReaction/{instance}` | React to message |
| POST | `/message/sendPoll/{instance}` | Send poll |
| POST | `/message/sendList/{instance}` | Send list menu |
| POST | `/message/sendButtons/{instance}` | Send buttons |
| POST | `/message/sendStatus/{instance}` | Post status/story |
| POST | `/message/sendPtv/{instance}` | Send video note |
| POST | `/chat/whatsappNumbers/{instance}` | Check if on WhatsApp |
| POST | `/chat/fetchProfile/{instance}` | Fetch profile |
| GET | `/chat/fetchProfilePictureUrl/{instance}` | Profile picture |
| GET | `/chat/findContacts/{instance}` | List contacts |
| GET | `/chat/findMessages/{instance}` | Search messages |
| GET | `/chat/findChats/{instance}` | List chats |
| PATCH | `/chat/archiveChat/{instance}` | Archive/unarchive |
| POST | `/chat/markMessageAsRead/{instance}` | Mark read |
| DELETE | `/chat/deleteMessageForEveryone/{instance}` | Delete message |
| PATCH | `/chat/updateMessage/{instance}` | Edit message |
| POST | `/chat/sendPresence/{instance}` | Typing indicator |
| PUT | `/chat/updateBlockStatus/{instance}` | Block/unblock |
| POST | `/group/create/{instance}` | Create group |
| GET | `/group/fetchAllGroups/{instance}` | List groups |
| GET | `/group/participants/{instance}` | Group members |
| PUT | `/group/updateParticipant/{instance}` | Add/remove/promote/demote |
| PUT | `/group/updateGroupSubject/{instance}` | Rename group |
| PUT | `/group/updateGroupDescription/{instance}` | Set description |
| GET | `/group/inviteCode/{instance}` | Get invite link |
| PUT | `/group/revokeInviteCode/{instance}` | Revoke invite |
| GET | `/group/inviteInfo/{instance}` | Info by invite code |
| DELETE | `/group/leaveGroup/{instance}` | Leave group |
| PUT | `/group/updateSetting/{instance}` | Group settings |
| PATCH | `/group/toggleEphemeral/{instance}` | Ephemeral messages |
| POST | `/webhook/set/{instance}` | Configure webhook |
| GET | `/webhook/find/{instance}` | Get webhook config |
| POST | `/rabbitmq/set/{instance}` | Configure RabbitMQ |
| POST | `/sqs/set/{instance}` | Configure SQS |
| POST | `/pusher/set/{instance}` | Configure Pusher |
| POST | `/typebot/set/{instance}` | Configure Typebot |
| POST | `/openai/set/{instance}` | Configure OpenAI |
| POST | `/chatwoot/set/{instance}` | Configure Chatwoot |

---

*Last updated: June 2026. Source: [Evolution API GitHub](https://github.com/evolution-foundation/evolution-api), official docs (doc.evolution-api.com/v2), and community issue tracker.*
