# EmailSAAS Pro - Enterprise Desktop Application Specification

## Project Overview

**Project Name:** EmailSAAS Pro (On-Premise Edition)
**Project Type:** Enterprise Desktop Application
**Core Functionality:** AI-powered B2B cold email outreach platform with local data storage, offline-first architecture, and complete infrastructure independence
**Target Users:** Sales teams, marketing agencies, B2B companies requiring on-premise data control and complete infrastructure independence

---

## Architecture Overview

### System Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN PROCESS                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Window Mgmt  │  │ System Tray  │  │ Auto-updater         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ IPC
┌────────────────────────────┴────────────────────────────────────┐
│                    ELECTRON RENDERER PROCESS                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    NEXT.JS FRONTEND                       │   │
│  │  Dashboard | Leads | Campaigns | Templates | Analytics  │   │
│  │  Settings  | Compose | Sequences | Logs | AI Features     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                             │ localhost API
┌────────────────────────────┴────────────────────────────────────┐
│                    LOCAL NODE.JS BACKEND                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Express API │ │ Auth Svc    │ │ Email Svc   │ │ AI Svc    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Queue Svc   │ │ Scheduler   │ │ Webhook Svc │ │ Backup    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                    LOCAL POSTGRESQL DATABASE                     │
│  leads | campaigns | emails | templates | users | settings      │
│  analytics | audit_logs | api_keys | smtp_configs               │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack
- **Desktop Framework**: Electron 33.x with electron-builder
- **Frontend**: Next.js 15, React 19, Tailwind CSS, ShadCN UI
- **Backend**: Node.js + Express.js (embedded in Electron)
- **Database**: PostgreSQL 16 (local installation)
- **ORM**: Prisma 6.x
- **Email**: Nodemailer 7.x
- **State Management**: Zustand 5.x
- **Authentication**: bcryptjs + JWT (local)
- **Encryption**: crypto-js for API key encryption
- **Build**: electron-builder for Windows/macOS/Linux

---

## UI/UX Specification

### Layout Structure
- **Sidebar Navigation**: 240px fixed left sidebar with icons + labels
- **Header**: 64px top bar with user info, notifications, quick actions
- **Main Content**: Fluid width, responsive grid layouts
- **Modal System**: Centered overlays for forms and confirmations

### Visual Design
- **Color Palette**:
  - Primary: Orange (#f97316) - brand identity
  - Secondary: Slate (#64748b, #94a3b8)
  - Background: White (#ffffff), Slate-50 (#f8fafc)
  - Success: Green (#22c55e)
  - Warning: Amber (#f59e0b)
  - Error: Red (#ef4444)
  - Dark mode support: Slate-900 (#0f172a)

- **Typography**:
  - Font Family: Inter (system fallback: -apple-system, BlinkMacSystemFont, Segoe UI)
  - Headings: Bold (600-700), sizes 2xl to 4xl
  - Body: Regular (400), 14-16px
  - Monospace: JetBrains Mono for code/logs

- **Spacing System**: 4px base unit (4, 8, 12, 16, 24, 32, 48, 64)
- **Border Radius**: 6px default, 8px for cards, 12px for modals
- **Shadows**: sm, md, lg, xl for elevation levels

### Components
- **Navigation**: Collapsible sidebar with active states, icons, badges
- **Cards**: White background, subtle border, rounded corners
- **Tables**: Striped rows, sortable headers, pagination
- **Forms**: Labeled inputs, validation states, helper text
- **Buttons**: Primary (orange), Secondary (outline), Ghost
- **Dialogs**: Centered, with backdrop blur
- **Toasts**: Bottom-right notifications with auto-dismiss
- **Loading States**: Spinners, skeletons, progress bars

### Responsive Breakpoints
- Desktop: 1280px+
- Tablet: 768px - 1279px (sidebar collapses to icons)
- Mobile: < 768px (bottom navigation)

---

## Database Schema

### Core Tables

```prisma
// User Management
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  password      String
  name          String
  role          UserRole  @default(USER)
  recoveryPhrase String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?

  leads         Lead[]
  campaigns     Campaign[]
  emailLogs     EmailLog[]
  templates     Template[]
  settings      UserSettings?
  auditLogs     AuditLog[]
}

enum UserRole {
  ADMIN
  MANAGER
  USER
}

// Leads Management
model Lead {
  id            String    @id @default(uuid())
  userId        String
  companyName   String
  contactName   String
  email         String
  phone         String?
  country       String?
  website       String?
  linkedIn      String?
  productInterest String?
  status        LeadStatus @default(PENDING)
  source        String    @default("manual")
  notes         String?
  customFields  Json?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])
  emails        EmailLog[]
  campaigns     CampaignLead[]

  @@index([userId, status])
  @@index([email])
}

enum LeadStatus {
  PENDING
  CONTACTED
  REPLIED
  CONVERTED
  BOUNCED
  UNSUBSCRIBED
}

// Campaign Management
model Campaign {
  id            String    @id @default(uuid())
  userId        String
  name          String
  description   String?
  status        CampaignStatus @default(DRAFT)
  scheduleType  ScheduleType @default(IMMEDIATE)
  scheduledAt   DateTime?
  dailyLimit    Int       @default(50)
  warmupEnabled Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  startedAt     DateTime?
  completedAt   DateTime?

  user          User      @relation(fields: [userId], references: [id])
  leads         CampaignLead[]
  emails        EmailLog[]
  sequences     Sequence[]
  templates     Template[]

  @@index([userId, status])
}

enum CampaignStatus {
  DRAFT
  SCHEDULED
  RUNNING
  PAUSED
  COMPLETED
  CANCELLED
}

enum ScheduleType {
  IMMEDIATE
  SCHEDULED
  SEQUENCE
}

// Email Templates
model Template {
  id            String    @id @default(uuid())
  userId        String
  name          String
  subject       String
  body          String    @db.Text
  type          TemplateType @default(GENERAL)
  variables     String[]
  aiPrompt      String?
  category      String?
  isPublic      Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])
  emails        EmailLog[]

  @@index([userId, type])
}

enum TemplateType {
  INITIAL
  FOLLOWUP
  GENERAL
  CUSTOM
}

// Email Logs
model EmailLog {
  id            String    @id @default(uuid())
  userId        String
  leadId        String
  campaignId    String?
  templateId    String?
  subject       String
  body          String    @db.Text
  fromEmail     String
  toEmail       String
  status        EmailStatus @default(PENDING)
  sentAt        DateTime?
  openedAt      DateTime?
  clickedAt     DateTime?
  repliedAt     DateTime?
  bouncedAt     DateTime?
  bounceReason  String?
  messageId     String?
  trackingId    String    @unique @default(uuid())
  error         String?

  user          User      @relation(fields: [userId], references: [id])
  lead          Lead      @relation(fields: [leadId], references: [id])
  campaign      Campaign? @relation(fields: [campaignId], references: [id])
  template      Template? @relation(fields: [templateId], references: [id])

  @@index([userId, status])
  @@index([leadId])
  @@index([campaignId])
  @@index([sentAt])
}

enum EmailStatus {
  PENDING
  QUEUED
  SENDING
  SENT
  DELIVERED
  OPENED
  CLICKED
  REPLIED
  BOUNCED
  FAILED
}

// Email Sequences
model Sequence {
  id            String    @id @default(uuid())
  userId        String
  campaignId    String
  name          String
  stepOrder     Int
  delayDays     Int       @default(1)
  delayHours    Int       @default(0)
  templateId    String
  condition     SequenceCondition @default(IF_NO_REPLY)
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  campaign      Campaign  @relation(fields: [campaignId], references: [id])
  template      Template  @relation(fields: [templateId], references: [id])

  @@index([campaignId, stepOrder])
}

enum SequenceCondition {
  IF_NO_REPLY
  IF_OPENED
  IF_CLICKED
  ALWAYS
}

// User Settings
model UserSettings {
  id            String    @id @default(uuid())
  userId        String    @unique

  // SMTP Configuration
  smtpHost      String?
  smtpPort      Int       @default(587)
  smtpUser      String?
  smtpPass      String?
  smtpSecure    Boolean   @default(false)
  smtpProvider  SmtpProvider?

  // Email Provider
  useResend     Boolean   @default(false)
  resendApiKey  String?

  // AI Configuration
  openaiKey     String?
  anthropicKey  String?
  geminiKey     String?
  defaultAiModel String   @default("openai")

  // Profile
  companyName   String?
  website       String?
  whatsApp      String?
  linkedInUrl   String?
  twitterUrl   String?
  signature     String?   @db.Text

  // Sending Limits
  dailyLimit    Int       @default(50)
  warmupEnabled Boolean   @default(false)
  warmupSchedule Json?

  // Inbox Rotation
  inboxRotation Boolean   @default(false)
  emailAliases  String[]

  // Notifications
  notifyOnBounce Boolean @default(true)
  notifyOnReply  Boolean @default(true)
  notifyOnDaily  Boolean @default(false)

  // GDPR
  gdprEnabled   Boolean   @default(false)
  dataRetentionDays Int    @default(365)

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])
}

enum SmtpProvider {
  GMAIL
  OUTLOOK
  ZOHO
  CUSTOM
}

// Analytics
model Analytics {
  id            String    @id @default(uuid())
  userId        String
  date          DateTime  @db.Date
  emailsSent    Int       @default(0)
  emailsDelivered Int     @default(0)
  emailsOpened  Int       @default(0)
  emailsClicked Int       @default(0)
  emailsReplied Int       @default(0)
  emailsBounced Int       @default(0)
  leadsAdded    Int       @default(0)
  leadsConverted Int      @default(0)

  @@unique([userId, date])
  @@index([userId, date])
}

// Audit Logs
model AuditLog {
  id            String    @id @default(uuid())
  userId        String
  action        String
  entityType    String
  entityId      String?
  details       Json?
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime  @default(now())

  user          User      @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([entityType, entityId])
}

// API Keys
model ApiKey {
  id            String    @id @default(uuid())
  userId        String
  name          String
  keyHash       String
  keyPrefix     String
  provider      String
  isActive      Boolean   @default(true)
  lastUsedAt    DateTime?
  expiresAt     DateTime?
  createdAt     DateTime  @default(now())

  user          User      @relation(fields: [userId], references: [id])

  @@index([userId, isActive])
}

// Campaign-Leads Junction
model CampaignLead {
  id            String    @id @default(uuid())
  campaignId    String
  leadId        String
  addedAt       DateTime  @default(now())
  contactedAt   DateTime?
  status        CampaignLeadStatus @default(PENDING)

  campaign      Campaign  @relation(fields: [campaignId], references: [id])
  lead          Lead      @relation(fields: [leadId], references: [id])

  @@unique([campaignId, leadId])
  @@index([campaignId, status])
}

enum CampaignLeadStatus {
  PENDING
  CONTACTED
  REPLIED
  CONVERTED
  FAILED
}
```

---

## Security Specification

### Local Encryption
- **API Keys**: AES-256 encryption using crypto-js with machine-specific key
- **Passwords**: bcrypt with 12 rounds
- **Database**: PostgreSQL with local user authentication
- **Session**: JWT with 24-hour expiry, refresh tokens

### RBAC (Role-Based Access Control)
- **Admin**: Full access, user management, all settings
- **Manager**: Campaign management, analytics, lead management
- **User**: Own data only, limited settings

### Audit Logging
- All CRUD operations logged
- Login/logout events
- Settings changes
- Export/import actions

### GDPR Compliance
- Local-only data storage
- Data export capability
- Data deletion capability
- Configurable retention periods

---

## Feature Specifications

### 1. Authentication System
- Local user registration
- Login with email/password
- Recovery phrase-based password reset
- Session management with JWT
- Auto-logout on inactivity

### 2. AI Integration
- **OpenAI**: GPT-4, GPT-3.5-turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Haiku
- **Google Gemini**: Gemini Pro, Gemini Flash
- Features:
  - Email generation
  - Personalization
  - Follow-up generation
  - Subject line optimization
  - Reply drafting

### 3. SMTP Integration
- **Gmail**: OAuth2 or App Password
- **Outlook/Office 365**: OAuth2 or App Password
- **Zoho Mail**: API credentials
- **Custom SMTP**: Full configuration
- Features:
  - Multiple sender identities
  - Inbox rotation
  - Rate limiting
  - Bounce handling
  - Unsubscribe headers

### 4. Offline-First Architecture
- Full functionality without internet:
  - Lead CRUD
  - Campaign management
  - Template editing
  - Analytics viewing
  - Settings configuration
- Queue system for pending emails

### 5. Campaign Management
- Create/edit campaigns
- Schedule campaigns
- Sequence builder (multi-step follow-ups)
- A/B testing templates
- Performance tracking

### 6. Lead Management
- Manual entry
- CSV import
- Excel import
- Bulk operations
- Status management

### 7. Analytics Dashboard
- Daily/weekly/monthly views
- Open rate, click rate, reply rate
- Campaign comparison
- Lead conversion funnel

### 8. Backup System
- Automatic daily backups
- Manual backup on demand
- Backup encryption
- Restore functionality

---

## API Endpoints

### Authentication
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/reset
- GET /api/auth/me

### Leads
- GET /api/leads
- POST /api/leads
- PUT /api/leads/:id
- DELETE /api/leads/:id
- POST /api/leads/import
- GET /api/leads/export

### Campaigns
- GET /api/campaigns
- POST /api/campaigns
- PUT /api/campaigns/:id
- DELETE /api/campaigns/:id
- POST /api/campaigns/:id/start
- POST /api/campaigns/:id/pause

### Emails
- POST /api/emails/generate
- POST /api/emails/send
- GET /api/emails/logs

### Templates
- GET /api/templates
- POST /api/templates
- PUT /api/templates/:id
- DELETE /api/templates/:id

### Sequences
- GET /api/sequences
- POST /api/sequences
- PUT /api/sequences/:id

### Settings
- GET /api/settings
- PUT /api/settings
- POST /api/settings/test-smtp

### Analytics
- GET /api/analytics/overview
- GET /api/analytics/daily

### System
- GET /api/system/health
- GET /api/system/backup
- POST /api/system/restore

---

## Electron Configuration

### Main Process Features
- Window management (minimize, maximize, close)
- System tray with quick actions
- Auto-updater integration
- Native notifications

### Build Configuration
- Windows: NSIS installer (.exe)
- macOS: DMG + ZIP
- Linux: AppImage + deb

### Application Metadata
- Name: EmailSAAS Pro
- Version: 1.0.0

---

## Installation & Setup

### First-Run Wizard
1. Database setup (auto-install PostgreSQL)
2. Admin account creation
3. SMTP configuration (optional)
4. AI API keys (optional)

### System Requirements
- Windows 10/11 (64-bit)
- 4GB RAM minimum
- 2GB disk space

---

## Migration from SaaS

### Changes from Original Architecture
1. Replace InsForge SDK with local Prisma client
2. Convert Next.js API routes to Express endpoints
3. Add local authentication (remove NextAuth)
4. Implement local file-based encryption
5. Add Electron wrapper and build configuration
6. Remove cloud dependencies
7. Local-only data storage
8. Different user management approach