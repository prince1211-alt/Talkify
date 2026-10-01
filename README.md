# Talkify

Talkify is a real-time chat application with end-to-end encrypted messaging, group chats, video calls and AI meeting summaries.

## Features

- **Private chats**: one-to-one messaging with text and images
- **Group chats**: create groups, add or remove members, leave or delete groups
- **End-to-end encryption**: messages and images are encrypted in the browser; the server only stores encrypted data
- **Video calls**: one-to-one and group video calls with mute and camera controls
- **AI meeting summary**: record call audio and get a short summary posted in the chat
- **Real-time updates**: new messages, online status and group changes appear instantly
- **Email OTP verification** for signup and password reset
- **Responsive design** for desktop and mobile

## Tech Stack

**Frontend**
- React 19 + Vite
- Zustand (state management)
- Tailwind CSS
- Socket.io Client
- WebRTC (video calls)
- Web Crypto API (encryption)

**Backend**
- Node.js + Express 5
- MongoDB + Mongoose
- Socket.io
- JWT authentication + bcrypt
- Cloudinary (image storage)
- Groq (speech-to-text and AI summaries)
- Brevo / Resend / SMTP (OTP emails)

## Project Structure

```
Talkify/
├── backend/
│   ├── config/          # Database, CORS, Socket.io, Cloudinary, uploads
│   ├── controllers/     # Users, messages, groups, calls, meeting summary
│   ├── middleware/      # Authentication and rate limiting
│   ├── models/          # User, Message, Group, GroupMessage, OTP
│   ├── routes/          # API routes
│   ├── utils/           # Email sending and OTP helpers
│   └── index.js         # Server entry point
│
└── frontend/
    └── src/
        ├── components/  # Chat window, sidebar, video call screen, modals
        ├── pages/       # Login, Sign up, Chat dashboard
        ├── store/       # Auth, chat and call state
        ├── utils/       # Encryption helpers
        └── lib/         # API client
```

## Getting Started

### Prerequisites

- Node.js 18 or newer
- A MongoDB database (local or MongoDB Atlas)

### 1. Clone the repository

```bash
git clone https://github.com/prince1211-alt/Talkify.git
cd Talkify
```

### 2. Run the backend

```bash
cd backend
cp .env.example .env    # fill in your values
npm install
npm run dev
```

The backend runs on `http://localhost:5000`.

### 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

> In development, if no email service is set up, the OTP code is printed in the backend terminal.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
| --- | --- |
| `MONGODB_URL` | MongoDB connection string |
| `JWT_SECRET` | Secret key for login tokens |
| `PORT` | Server port (default `5000`) |
| `NODE_ENV` | `development` or `production` |
| `FRONTEND_URL` | Frontend URL allowed to use the API (e.g. `https://your-app.vercel.app`) |
| `MAIL_FROM` | Sender email address (verified with your email provider) |
| `BREVO_API_KEY` | Brevo API key for OTP emails (or use `RESEND_API_KEY` / `SMTP_*`) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary account for images |
| `GROQ_API_KEY` | Groq API key for meeting summaries (optional) |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | TURN server for calls on strict networks (optional) |

See `backend/.env.example` for the full list.

### Frontend (`frontend/.env`)

| Variable | Description |
| --- | --- |
| `VITE_BACKEND_URL` | Backend URL used in production (e.g. `https://your-backend.onrender.com`) |

## Deployment

**Separate frontend and backend (e.g. Vercel + Render)**

- Backend: root `backend`, build `npm install`, start `npm start`, set `NODE_ENV=production` and `FRONTEND_URL`
- Frontend: root `frontend`, build `npm run build`, output `dist`, set `VITE_BACKEND_URL`

**Single server**

Build the frontend, then start the backend with `NODE_ENV=production`. The backend serves the frontend from `frontend/dist`.

```bash
cd frontend && npm install && npm run build
cd ../backend && npm install && npm start
```

## Scripts

| Folder | Command | Description |
| --- | --- | --- |
| backend | `npm run dev` | Start the server with auto-reload |
| backend | `npm start` | Start the server |
| frontend | `npm run dev` | Start the development server |
| frontend | `npm run build` | Build for production |
| frontend | `npm run lint` | Check code with ESLint |

## Author

[prince1211-alt](https://github.com/prince1211-alt)
