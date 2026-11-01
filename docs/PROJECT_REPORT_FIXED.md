# Project Report

# Project Report

# OCTAPOINT PROJECT DOCUMENT

 

|  |  |
| --- | --- |
|   |  |
| Group Members | Mai Nguyễn Nam Hải – 089205010770Nguyễn Trung Hiếu – 038206026152Phạm Văn Đức Hiệp – 033207014948Hoàng Anh Duy – 066207005330Nguyễn Lê Thành Đạt -  083207001125 |
| Supervisor | Nguyễn Văn Chiến |

# Acknowledgement

We would like to thank our supervisor for the guidance and feedback throughout this project. The Software Engineering course helped us understand how a project is planned and built, from gathering requirements and designing the system to managing work and ensuring quality.

We are also grateful to every team member for their effort and cooperation while working on **OctaPoint**. Although we still have much to learn, we hope this report is a useful starting point for further development.

# Definition and Acronyms

| **Term** | **Definition** |
| --- | --- |
| CaaS | Credit-as-a-Service (in this project "credit" means a merchant's loyalty points, not money or monetary credit) |
| MVP | Minimum Viable Product |
| SRS | Software Requirement Specification |
| WBS | Work Breakdown Structure |
| UAT | User Acceptance Testing |
| FE / UC / BR / CR / LI / MSG | Major Feature / Use Case / Business Rule / Common Requirement / Limitation / Application Message |
| ERD | Entity Relationship Diagram |
| RBAC | Role-Based Access Control |
| Tenant / Merchant | A business customer of OctaPoint; its data is isolated from other merchants |
| POS | Point of Sale |
| API / SDK | Application Programming Interface / Software Development Kit |
| HMAC | Hash-based Message Authentication Code (HMAC-SHA256 signs API requests) |
| MCP | Model Context Protocol, a standard that lets AI assistants call external tools |
| Sui / Move | Layer-1 blockchain used by OctaPoint (Testnet only) / its smart contract language |
| Digest | ID of a transaction on Sui; opens in Sui Explorer |
| Anchoring | Recording the proof (hash) of a database transaction on Sui |
| Must / Should | Must = required for the final demo; Should = optional, done only if time remains |
| Gas | Network fee on Sui, paid by the platform |
| Points | A customer's loyalty balance, stored in the database |

# I. Project Introduction

## 1. Overview

### 1.1 Project Information

- **Project name:** A Blockchain-Backed Credit-as-a-Service Platform with Developer SDKs and AI-Ready MCP Integration for Enterprise Loyalty Systems
- **Software type:** Cloud SaaS platform, Developer SDK, MCP Server, Move smart contract

### 1.2 Project Team

| **Full Name** | **Role** | **Email** |
| --- | --- | --- |
| Mai Nguyễn Nam Hải | Leader | <Haimnn0770@ut.edu.vn> |
| Nguyễn Trung Hiếu | Member | <nguyenhieu241106@gmail.com> |
| Phạm Văn Đức Hiệp | Member | <duchiep.18022007@gmail.com> |
| Hoàng Anh Duy | Member | <qwertytrustme@gmail.com> |
| Nguyễn Lê Thành Đạt | Member | <Nguyenthanhdat.4136@gmail.com> |

## 2. Product Background

Loyalty systems are widely used in supermarkets, malls, F&B chains and e-commerce, but traditional systems face four problems:

1. **Security:** centralized systems can suffer API abuse, forged or replayed requests and unauthorized point issuance. OctaPoint addresses forged and replayed API requests (HMAC signature, timestamp and idempotency key); brute-force and rate-limit protection are out of scope (LI-09).
2. **Integration cost:** each business must build and maintain its own connection to the loyalty system.
3. **Low transparency:** records kept only in a central database are hard to verify and reconcile.
4. **Web3 barriers:** wallets, seed phrases and network fees are too complex for ordinary businesses and users.

OctaPoint is proposed as a blockchain-backed CaaS platform on the Sui blockchain. A TypeScript SDK and an AI-ready MCP Server simplify integration, while Move smart contracts provide verifiable transaction proof.

## 3. Business Opportunity

As retailers and venues digitize customer engagement, demand for plug-and-play loyalty infrastructure is growing. Web2 platforms lack auditability, while Web3 platforms are too complex for mainstream users. OctaPoint targets the gap between them:

- The platform pays Sui gas fees, so no wallet is needed.
- Every transaction is saved to PostgreSQL first and anchored on Sui in the background, so POS responses are never delayed.
- A read-only MCP Server lets AI assistants answer customer-credit questions safely.

## 4. Software Product Vision

For enterprise merchants who want to manage loyalty points securely and plug them into existing applications, OctaPoint is a blockchain-backed CaaS platform combining a REST API, a TypeScript SDK, Sui Move smart contracts and an MCP Server. Merchants and developers can issue points, redeem points, check balances, view history and set loyalty rules without building the whole workflow themselves. Sui provides verifiable transaction references, and AI agents get read-only tools over credit data; the MCP Server exposes no tool that can issue, redeem or change points. Production-scale deployment and AI-driven transactions are left for future versions.

## 5. Project Scope & Limitations

### 5.1 Major Features

- **FE1. Authentication & Access Control:** secure login/logout; roles Admin, Merchant Owner, Merchant Staff.
- **FE2. Merchant & Tenant Management:** merchant registration, Admin approval/suspension; data isolated per merchant (account details are managed through UC-02).
- **FE3. Customer & Points Management:** customers identified by code per merchant; issue, redeem (with insufficient-balance check) and balance inquiry; safe under concurrent requests.
- **FE4. Loyalty Rule Configuration:** each merchant sets its own earn ratio and minimum redemption.
- **FE5. Transaction History & Audit:** every transaction is logged with time, status and blockchain reference. Records cannot be edited or deleted; mistakes are fixed by reversal transactions. Each record also stores who performed it, the bill amount and the earn ratio used.
- **FE6. API Gateway & Security:** REST API protected by API key, HMAC-SHA256 signature and timestamp check; idempotency key required on issue and redeem requests.
- **FE7. Web Portal:** one web app with role-based menus for Merchant and Admin, plus basic dashboard counters.
- **FE8. Blockchain Anchoring on Sui Testnet:** save to database first, then record on Sui in the background via a Move contract; store the digest and link it to Sui Explorer; retry automatically on failure.
- **FE9. TypeScript SDK:** Node.js library to issue, redeem, check balance and view history, with automatic request signing.
- **FE10. MCP Server (read-only):** lets AI assistants query balances and transactions; loyalty-rule lookup (Should).

### 5.2 Limitations & Exclusions

- **LI-01:** Academic MVP / proof of concept, not for production and no availability guarantee.
- **LI-02:** Sui Testnet only; no mainnet, multi-chain or cross-chain.
- **LI-03:** Rules are limited to earn ratio and minimum redemption (no expiry, tiers, campaigns, analytics or fraud detection). The dashboard shows basic counters only. The audit log (CR-04) is stored in the database only; there is no screen to view it.
- **LI-04:** Online only; no offline mode and no point transfer between merchants.
- **LI-05:** MCP tools are read-only. This is enforced by the MCP Server exposing no write tools; it uses a normal merchant API key (no read-only key scope).
- **LI-06:** No Enoki/zkLogin, sponsored-transaction service, Walrus, Seal, Stripe billing, ClickHouse, Redis, <http://socket.io>  , gRPC or mTLS. The platform pays gas itself.
- **LI-07:** End customers have no UI. Admin is a role inside the same portal.
- **LI-08:** Anchoring is asynchronous. The database is the source of truth; the blockchain only holds proof, not balances. Transactions are retried automatically (BR-12). Temporary infrastructure problems (Testnet or RPC unavailable, network errors, the platform wallet out of gas) never use up the retries: the transaction stays `PENDING_ANCHOR` and is tried again until the problem is fixed. Only repeated non-temporary errors make a transaction `FAILED`, which is a final state in this MVP (no manual re-anchoring). There is no automatic verification feature: a reviewer can recompute the proof hash from the ledger record (BR-20) and compare it with the on-chain value in Sui Explorer.
- **LI-09:** Security is limited to API key, HMAC signature and timestamp check (no rate limiting, brute-force or personal-data protection).
- **LI-10:** SDK is Node.js/TypeScript only and not published to npm. Portal is desktop-first and English only.
- **LI-11:** Manual functional testing only; lightweight documentation (SRS, use cases, ERD, API spec, test checklist, guides).
- **LI-12:** Should items in the WBS may be delivered partially or not at all.
- **LI-13:** Reversal is done only by the Owner in the portal (no reversal API or SDK method; Staff cannot reverse, so a counter refund is handled by the Owner). An `ISSUE` cannot be reversed when the customer's balance is too low (BR-05); such cases are handled outside the system.
- **LI-14:** Account recovery is manual: no forgot-password flow and no email sending. A team member resets a password with the `reset:password` script after checking the person's identity (see the deployment guide). The first Admin account is created directly in the database. There is no reject action for registrations: unapproved merchants stay `Pending`.
- **LI-15:** Customers cannot be deleted or merged; a customer created by mistake is deactivated (3.2.3.1).
- **LI-16:** Customers are created in the portal only, one by one: there is no API/SDK method and no bulk import. A POS must use customer codes that already exist (MSG22 otherwise).

# II. Project Management Plan

## 1. Overview

### 1.1 Scope & Estimation

| **No.** | **WBS Item** | **Complexity** | **Priority** | **Effort (man-hours)** |
| --- | --- | --- | --- | --- |
| **1** | **FE01. Authentication & Access Control** |  |  | **32** |
| 1.1 | Login, Logout & Session | Simple | Must | 12 |
| 1.2 | User Profile & Password Update | Simple | Must | 8 |
| 1.3 | RBAC (Admin, Owner, Staff) | Medium | Must | 12 |
| **2** | **FE02. Merchant & Tenant Management** |  |  | **32** |
| 2.1 | Merchant Registration | Medium | Must | 12 |
| 2.2 | Admin Approval & Suspension | Simple | Must | 8 |
| 2.3 | Multi-tenant Data Isolation | Medium | Must | 12 |
| **3** | **FE03. Customer & Points Management** |  |  | **46** |
| 3.1 | Customer Records & Deactivation (by Customer Code) | Simple | Must | 8 |
| 3.2 | Point Issuance & Balance Inquiry | Medium | Must | 12 |
| 3.3 | Point Redemption & Balance Validation | Medium | Must | 12 |
| 3.4 | Concurrency Control | Complex | Must | 14 |
| **4** | **FE04. Loyalty Rule Configuration** |  |  | **20** |
| 4.1 | Earn Ratio Configuration | Simple | Must | 6 |
| 4.2 | Minimum Redemption Configuration | Simple | Must | 6 |
| 4.3 | Rule Calculation on Transactions | Medium | Must | 8 |
| **5** | **FE05. Transaction History & Audit** |  |  | **32** |
| 5.1 | Issue & Redeem Logging, Audit Log (CR-04) | Medium | Must | 10 |
| 5.2 | Immutable Ledger & Reversal | Complex | Must | 14 |
| 5.3 | Blockchain Reference & History Filter | Medium | Must | 8 |
| **6** | **FE06. API Gateway & Security** |  |  | **40** |
| 6.1 | API Key & Secret Management | Simple | Must | 8 |
| 6.2 | HMAC-SHA256 & Timestamp Verification | Complex | Must | 20 |
| 6.3 | Idempotency Key Handler | Medium | Must | 12 |
| **7** | **FE07. Web Portal** |  |  | **48** |
| 7.1 | Role-based Layout & Navigation | Medium | Must | 12 |
| 7.2 | Basic Dashboard Counters | Simple | Must | 8 |
| 7.3 | Merchant Screens (Customers, Rules, API Keys, Staff, Logs) | Medium | Must | 16 |
| 7.4 | Admin Screens (Merchants, Overview) | Medium | Must | 12 |
| **8** | **FE08. Blockchain Anchoring on Sui Testnet** |  |  | **42** |
| 8.1 | Move Smart Contract | Complex | Must | 16 |
| 8.2 | Background Anchoring Worker | Complex | Must | 16 |
| 8.3 | Retry Logic & Sui Explorer Link | Medium | Must | 10 |
| **9** | **FE09. TypeScript SDK** |  |  | **22** |
| 9.1 | Core Methods (Issue, Redeem, Balance, History) | Medium | Must | 10 |
| 9.2 | Automatic Request Signing | Medium | Must | 8 |
| 9.3 | README & Sample Code | Simple | Must | 4 |
| **10** | **FE10. MCP Server (Read-only)** |  |  | **20** |
| 10.1 | Server Setup & Balance/History Tools | Medium | Must | 16 |
| 10.2 | Loyalty Rule Retrieval Tool | Simple | Should | 4 |
| **11** | **Documentation** |  |  | **52** |
| 11.1 | SRS, ERD & API Specification | Medium | Must | 40 |
| 11.2 | Installation Guide, Deployment & User Manual | Simple | Must | 12 |
| **12** | **Testing & Demo** |  |  | **32** |
| 12.1 | Manual Test Checklist & Execution | Medium | Must | 24 |
| 12.2 | UAT & Demo Rehearsal | Simple | Must | 8 |
|  | **TOTAL ESTIMATED EFFORT (Must 414 + Should 4)** |  |  | **418** |

### 1.2 Project Objectives

| **#** | **Goal** | **Success Criteria** | **Verification** |
| --- | --- | --- | --- |
| 1 | Documentation | 100% of required documents (SRS, ERD, API guide, user manual) completed | Peer review on Google Docs |
| 2 | Functional implementation | Every Must feature runs end-to-end without crashing the server | Manual run-through via Web Portal and Postman |
| 3 | Blockchain verification | Issued transactions record a valid digest linkable to Sui Explorer while Testnet is available (while Testnet is unavailable they stay `PENDING_ANCHOR` and are retried, LI-08) | Check on Sui Testnet Explorer |
| 4 | AI agent integration | MCP Server returns accurate balance and transaction data (read-only, BR-14) | Manual test with an MCP client |
| 5 | Final demo (UAT) | Demo script (register → approve → set rule → create API key → add customer → issue → redeem → view ledger/digest → SDK call → MCP query) runs with zero blocker defects | Live dry run with supervisor |

### 1.3 Project Risks

| **#** | **Risk** | **Impact** | **Possibility** | **Response Plan** |
| --- | --- | --- | --- | --- |
| 1 | Changing requirements | Medium | Medium | Baseline SRS, change control, weekly review |
| 2 | Limited Sui Move and MCP knowledge | High | High | Early proof of concept in Week 5; supervisor guidance; one-function MVP contract |
| 3 | Sui Testnet unstable or RPC unavailable | Medium | High | Asynchronous anchoring, automatic retry, PostgreSQL as source of truth; prepare an already-anchored sample transaction before the demo |
| 4 | Concurrent requests corrupt balances | High | Medium | Row locking (`SELECT ... FOR UPDATE`); idempotency keys as extra control |
| 5 | Member absence | Medium | Medium | Cross-training, backup owner, regular stand-ups |
| 6 | HMAC signature mismatch between SDK and API | Medium | Low | One shared signing-string definition and test vectors in Postman |
| 7 | Schedule delay | High | High | Finish Must items first; drop Should items if needed; weekly progress check |

## 2. Management Approach

### 2.1 Project Process

The project uses **Agile Scrum** with 2-week sprints (4 sprints, 8 weeks).

- **Sprint 1–2 (Week 1–4):** initiation, requirements, scope baseline, self-training (Sui Move, MCP).
- **Sprint 3 (Week 5–6):** architecture and database design, core features and API security (FE1–FE6), basic portal screens, SRS finalized.
- **Sprint 4 (Week 7–8):** portal completion, Sui anchoring, SDK, MCP Server (FE7–FE10), manual testing, UAT, documentation, deployment.
- **Ceremonies:** 15-minute stand-up, Sprint Planning, Sprint Review, Sprint Retrospective.
- **Artefacts:** Product Backlog, Sprint Backlog, Burndown Chart, Increment.

### 2.2 Quality Management

Goal: a stable, accurate and maintainable system for the features that are delivered.

- **Defect prevention:** TypeScript and Move coding standards; database constraints and transaction locking.
- **Reviewing:** at least 1 reviewer per pull request; peer review of documents.
- **API testing (manual):** Postman for REST flows, HMAC checks and MCP tool responses; check digests on Sui Testnet Explorer; check concurrency (BR-06) by sending parallel requests from Postman.
- **System testing:** on the deployed demo (Vercel frontend, Render/Railway backend) using the test checklist.
- **Acceptance testing:** UAT with the supervisor using the demo script; all Must features must pass before the defense.

## 3. Project Deliverables

| **#** | **Deliverable** | **Due** | **Who and how** |
| --- | --- | --- | --- |
| 1 | Project Introduction & Management Plan | Week 5 | Hải (Doer), Hiếu (Reviewer); Google Docs, peer reviewed |
| 2 | SRS & System Design (Use Case, ERD, Sequence) | Week 5–6 | Hiếu, Duy (Doers), Hải (Reviewer); Google Docs, [draw.](http://draw.io/)io, <http://dbdiagram.io> |
| 3 | Core Loyalty APIs & Gateway Security (FE1–FE6) | Week 6 | Hiếu, Duy; Node.js/Hono + PostgreSQL, tested in Postman, GitHub PR review |
| 4 | Web Portal (FE7) | Week 7 | Hiệp (Doer), Hải (Reviewer); Next.js + Tailwind, built from SRS 3.1 |
| 5 | Move Contract & Anchoring Worker (FE8) | Week 7 | Hiếu, Duy, Đạt; deployed to Testnet, digest checked on Sui Explorer |
| 6 | TypeScript SDK & MCP Server (FE9–FE10) | Week 7 | Đạt (Doer), Duy (Supporter); tested with a sample script and an MCP client |
| 7 | API Specification, Test Checklist & Test Report | Week 8 | Đạt (Doer), Hải, Hiếu (Reviewers); checklist run manually |
| 8 | Release Package, Installation Guide & User Manual | Week 8 | Hải (Doer), all (Reviewers); release tagged on GitHub `main` |

## 4. Responsibility Assignments

*D = Doer, R = Reviewer, S = Supporter, I = Informed*

| **Responsibility** | **Hải** | **Hiếu** | **Hiệp** | **Duy** | **Đạt** |
| --- | --- | --- | --- | --- | --- |
| Project Planning & Tracking | D | R | I | I | S |
| Project Introduction Document | D | R | S | I | I |
| SRS (Overview Part) | D | R | I | S | I |
| SRS (User & Functional Requirements) | R | D | S | D | S |
| System Design (Architecture, ERD, Sequence) | R | D | I | S | I |
| Frontend (Web Portal, FE7) | R | I | D | I | S |
| Backend (Core Engine & Security, FE1–FE6) | S | D | I | D | I |
| Integration (Sui, SDK, MCP, FE8–FE10) | I | D | I | D | D |
| Manual Testing & QA | R | R | S | S | D |
| Final Deployment & Documentation | D | R | R | R | R |

## 5. Project Communications

| **Item** | **Who** | **When** | **Tool** |
| --- | --- | --- | --- |
| Weekly Planning Meeting | All members | Friday | Google Meet / offline |
| Weekly Progress Review | All members | Tuesday | Google Docs, Zalo |
| Internal Feature Demo | Developer + reviewer | After each feature | Screen share (Zalo / Meet) |
| Code Review | Developer + reviewer | Before merge | GitHub Pull Request |
| Documentation Review | 2 assigned members | Every 2 weeks | Google Docs comments |
| Urgent Bug Sync | Involved members | Ad-hoc | Zalo chat/call |
| Final Demo Rehearsal | All members | Week before defense | In person |

## 6. Configuration Management

### 6.1 Document Management

- Documents are stored in a shared Google Drive with folders Requirements, Design, Testing, Deployment.
- Versions are named `DocumentName_v1.0`, `v1.1`, ...; major changes are logged in the Record of Changes.
- Editors: team members. Viewers: supervisor.
- Weekly backup to a GitHub repository.

### 6.2 Source Code Management

- Hosted on GitHub with branches `main` (demo-ready), `develop`, `feature/*` and `hotfix/*`.
- Every pull request needs at least 1 peer review before merging.
- Commit format: `[Feature] ...` or `[Fix] ...`. Tasks are tracked in GitHub Projects and Issues.

### 6.3 Tools & Infrastructures

| **Category** | **Tools** |
| --- | --- |
| Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, TypeScript, Hono |
| Database | PostgreSQL |
| Blockchain | Sui Testnet, Move, `@mysten/sui` SDK |
| SDK & AI | TypeScript/Node.js SDK, MCP SDK |
| Diagramming / Docs | [draw.io](http://draw.io/), [dbdiagram.io](http://dbdiagram.io/) / Google Docs, Sheets |
| Version control | GitHub (code), Google Drive (documents) |
| Deployment | Vercel (frontend), Render / Railway (backend) |
| Project management & testing | GitHub Projects; Postman, Sui Testnet Explorer |

# III. Software Requirement Specification

## 1. Product Overview

OctaPoint is a cloud-based CaaS platform for enterprise loyalty systems. It uses the Sui blockchain for tamper-evident transaction proof and offers a TypeScript SDK, a desktop-first Web Portal, an HMAC-secured API Gateway and an MCP Server.

- **Operational environment:**
    - Client: desktop-first web portal on modern browsers (Chrome, Edge, Firefox, Safari).
    - Server: Node.js 20+ with Hono and TypeScript.
    - Database: PostgreSQL 16+, the single source of truth for balances and ledgers.
    - Blockchain: Sui Testnet through `@mysten/sui` and public JSON-RPC.
- **Anticipated users:** Admin, Merchant Owner, Merchant Staff; external systems: merchant POS (via SDK) and AI agents (via MCP).
- **Constraints & assumptions:** academic MVP; Testnet only; online only; end customers have no UI; rules limited to earn ratio and minimum redemption; MCP is read-only; no Redis, ClickHouse, Walrus, Enoki, Stripe, gRPC or mTLS (see LI-01 to LI-15); anchoring is asynchronous; portal is desktop-first and English only.
- **Dependencies:** stable Internet and Sui Testnet RPC nodes; a configured PostgreSQL instance.

## 2. User Requirements

### 2.1 System Actors

| **#** | **Actor** | **Description** |
| --- | --- | --- |
| 1 | Administrator | Approves or suspends merchants and monitors platform counters and the system ledger. |
| 2 | Merchant Owner | Owns a merchant tenant: sets loyalty rules, manages API keys and staff, audits the ledger, creates reversals. |
| 3 | Merchant Staff | Cashier or branch staff: looks up customers, checks balances, issues and redeems points. |
| 4 | Client System / SDK | External POS, e-commerce or mobile backend calling the REST API through the TypeScript SDK. |
| 5 | AI Agent | AI assistant (e.g., Claude Desktop, Cursor) reading credit data through MCP, read-only. |

### 2.2 Use Cases

#### 2.2.1 Use Case Diagram

#### 2.2.2 Use Case Descriptions

| **ID** | **Use Case** | **Actors** | **Description** |
| --- | --- | --- | --- |
| UC-01 | Log in / Log out | Admin, Owner, Staff | Authenticates by email and password and starts a role-scoped session. |
| UC-02 | Manage Account Profile | All internal users | Shows account details and changes the password. |
| UC-03 | View Admin Dashboard | Admin | Shows platform-wide counters. |
| UC-04 | Approve / Suspend Merchant | Admin | Activates or suspends a merchant tenant. |
| UC-05 | View Merchant Dashboard | Owner | Shows the merchant's customers, circulating points and today's transactions. |
| UC-06 | Configure Loyalty Rules | Owner | Sets earn ratio and minimum redemption. |
| UC-07 | Manage API Credentials | Owner | Generates and revokes API key/secret pairs. |
| UC-08 | Manage Merchant Staff | Owner | Creates and deactivates staff accounts. |
| UC-09 | Manage Customer Profiles | Owner, Staff | Creates and updates customers by `customer_code`; the Owner also deactivates and reactivates them. |
| UC-10 | Issue Points | Owner, Staff, Client System | Adds points based on the bill amount. |
| UC-11 | Redeem Points | Owner, Staff, Client System | Deducts points after balance and threshold checks. |
| UC-12 | Check Customer Balance | Owner, Staff, Client System, AI Agent | Returns a customer's current balance. |
| UC-13 | View Transaction Ledger | Admin, Owner, Staff, Client System | Shows transaction history with Sui Explorer links. |
| UC-14 | Create Reversal Transaction | Owner | Corrects a faulty transaction with an offsetting record. |
| UC-15 | Verify HMAC & Timestamp | Client System | Gateway validates API key, signature and timestamp of every API call. |
| UC-16 | Anchor Proof on Sui | System (worker) | Sends the proof hash to the Move contract and stores the digest. |
| UC-17 | Query Credit via MCP | AI Agent | Handles read-only MCP tool calls. |
| UC-18 | Register Merchant Account | Prospective Owner | Creates a `Pending` merchant and its owner account. |

## 3. Functional Requirements

### 3.1 System Functional Overview

#### 3.1.1 Merchant Web Portal Screen Flow

#### 3.1.2 Merchant Web Portal Screen Description

| **#** | **Feature** | **Screen** | **Description** |
| --- | --- | --- | --- |
| 1 | Authentication | Login | Shared entry point for all roles (Admin, Owner, Staff); routes by role (3.2.1.1). |
| 2 | Onboarding | Merchant Registration | Public form to create a `Pending` merchant. |
| 3 | Analytics | Merchant Dashboard | Owner-only counters: customers, circulating points, today's transactions. |
| 4 | Customers | Customer List | Searchable list with balances, "+ Add Customer", Issue/Redeem per row; Owner: Deactivate/Reactivate. |
| 5 | Points | Issue / Redeem Dialog | Enter bill amount or points and confirm. |
| 6 | Loyalty Rules | Rules | Owner-only form for `earn_ratio` and `min_redemption_threshold`. |
| 7 | Developer Hub | API Keys | Owner-only; generate (secret shown once) and revoke. |
| 8 | Staff | Staff Accounts | Owner-only; add and deactivate staff. |
| 9 | Ledger | Transaction Ledger | Filters, status, Sui Explorer link, "Reverse" action (Owner). |
| 10 | Profile | Account Settings | Shows identity and changes password. |

#### 3.1.3 Admin Web System Screen Flow

#### 3.1.4 Admin Web System Screen Description

| **#** | **Feature** | **Screen** | **Description** |
| --- | --- | --- | --- |
| 1 | Authentication | Login | Same shared Login screen; Admin is routed to the Admin Dashboard. |
| 2 | Analytics | Admin Dashboard | Total merchants (Pending / Active / Suspended), customers, points issued and redeemed. |
| 3 | Tenant Administration | Merchant Management | All merchants with status badges and Approve / Suspend actions. |
| 4 | Audit | System Ledger Logs | Read-only platform-wide log with anchoring status and Sui digests. |
| 5 | Profile | Account Settings | Shows identity and changes password. |

#### 3.1.5 Developer SDK, End-User Checkout & AI MCP Interaction Flows

- **Developer SDK flow:** Owner creates an API key → developer sets up the SDK → merchant POS calls the SDK → API Gateway verifies the request (3.2.3.4) → database is updated → worker anchors the proof on Sui (3.2.5.3).
- **End-user checkout:** customers have no UI (LI-07). The merchant's own checkout calls the SDK to issue or redeem points.
- **AI MCP flow:** AI assistant → MCP Server (stdio) → read-only tool → data of one merchant (3.2.4.1).

#### 3.1.6 Screen & Module Authorization Matrix

| **Screen / Function** | **Admin** | **Owner** | **Staff** | **Client System** | **AI Agent** |
| --- | --- | --- | --- | --- | --- |
| Login / Logout, Account Settings | ✔ | ✔ | ✔ | ✘ | ✘ |
| Admin Dashboard, Merchant Management | ✔ | ✘ | ✘ | ✘ | ✘ |
| System Ledger Logs (all merchants) | Read | ✘ | ✘ | ✘ | ✘ |
| Merchant Dashboard | ✘ | ✔ | ✘ | ✘ | ✘ |
| Customers | ✘ | ✔ | ✔ | ✘ | ✘ |
| Issue / Redeem Points | ✘ | ✔ | ✔ | ✔ | ✘ |
| Check Balance | ✘ | ✔ | ✔ | ✔ | ✔ |
| Loyalty Rules | ✘ | ✔ | ✘ | Read (Should) | Read (Should) |
| API Keys, Staff Accounts, Reversal | ✘ | ✔ | ✘ | ✘ | ✘ |
| Transaction Ledger (own merchant) | ✘ | ✔ | ✔ | Read | Read |

Access outside a role's permissions returns MSG04 (CR-03). Deactivating or reactivating a customer is Owner-only.

#### 3.1.7 Non-Screen System Functions

| **#** | **Function** | **Description** |
| --- | --- | --- |
| 1 | API request verification | Checks API key, timestamp and HMAC signature of every API call (UC-15). |
| 2 | Anchoring Worker | Anchors `PENDING_ANCHOR` transactions on Sui and retries failures (UC-16). |
| 3 | Idempotency handling | Returns the saved response for a repeated idempotency key (BR-10). |
| 4 | Audit logging & code generation | Logs critical actions (CR-04) and generates `TXN-` / `MCH-` codes (CR-05). |

#### 3.1.8 Entity Relationship Diagram

### 3.2 Detailed Functional Specifications

#### 3.2.1 Tenant Onboarding, RBAC & Walletless Auth Module

##### 3.2.1.1 Merchant Login & Self-Service Onboarding

**Log in / Log out**

- **Trigger:** user opens the web app or clicks "Log Out".
- **Actors:** Admin, Merchant Owner, Merchant Staff.
- **Purpose:** verify identity and route the user by role.
- **Data processing:**
    1. User submits email and password.
    2. System verifies the email and the BCrypt hash first, then checks that the user is active and the merchant status (BR-18).
    3. On success it starts a session (BR-19) and opens the Admin Dashboard, Merchant Dashboard or Customers screen by role (MSG03).
    4. Wrong credentials or an inactive user → MSG02 (same message, so the reason is not revealed); only after the credentials are verified, a `Pending` or `Suspended` merchant → MSG15.
- **Business rules:** BR-02, BR-18, BR-19.
- **Screen layout:**

**Register merchant**

- **Trigger:** visitor clicks "Register" on the Login screen.
- **Actors:** Prospective Merchant Owner.
- **Purpose:** create a merchant tenant and its Owner account.
- **Data processing:**
    1. User enters business name, owner name, email and password.
    2. System checks required fields (MSG01), that the email is unique (MSG31) and the password policy (CR-08, MSG37).
    3. System creates a `Pending` merchant (`MCH-` code) and a `MERCHANT_OWNER` user, then shows MSG30. The Owner can log in only after approval (MSG15).
- **Business rules:** BR-18.
- **Screen layout:**

##### 3.2.1.2 Approve / Suspend Merchants

- **Trigger:** Admin selects "Merchants".
- **Actors:** Admin.
- **Purpose:** review registrations and manage merchant status.
- **Data processing:**
    1. System lists merchants with name, email, registration date and status.
    2. "Approve" sets `Active` and restores the merchant's suspended API keys (MSG13).
    3. "Suspend" sets `Suspended` and suspends all its API keys (MSG14); its users' sessions end on the next request.
    4. Both actions are audit-logged (CR-04).
    5. Allowed changes: `Pending` → `Active` (Approve), `Active` → `Suspended` (Suspend), `Suspended` → `Active` (Approve). A `Pending` merchant cannot be suspended, and there is no reject action (LI-14).
- **Business rules:** BR-02, BR-18, BR-19.
- **Screen layout:**

##### 3.2.1.3 Manage Staff Accounts

- **Trigger:** Owner selects "Staff".
- **Actors:** Merchant Owner.
- **Purpose:** create and deactivate cashier accounts.
- **Data processing:**
    1. System lists the staff of the current merchant.
    2. "+ Add Staff": full name, email, initial password following CR-08 (the user can change it in Account Settings); the email must be unique (MSG31). The `MERCHANT_STAFF` user is linked to the merchant (MSG28).
    3. Owner can deactivate a staff account (not delete); that user can no longer log in.
- **Business rules:** BR-01, BR-02, BR-19.
- **Screen layout:**

##### 3.2.1.4 Manage Account Profile

- **Trigger:** user selects "Account Settings".
- **Actors:** Admin, Owner, Staff.
- **Purpose:** show account details and change the password.
- **Data processing:**
    1. System shows full name, email and role.
    2. User enters the current and new password; a wrong current password is rejected (MSG36); the new password must follow CR-08 (MSG37).
    3. System stores the new BCrypt hash and writes an audit record (CR-04, MSG29).
- **Business rules:** BR-02.
- **Screen layout:**

#### 3.2.2 Dynamic Rule Engine & Move Smart Contract Module

##### 3.2.2.1 Configure Loyalty Rules

- **Trigger:** Owner selects "Rules".
- **Actors:** Merchant Owner.
- **Purpose:** set the earn ratio and the minimum redemption.
- **Data processing:**
    1. System shows `earn_ratio` (VND per point) and `min_redemption_threshold` (points).
    2. Owner edits the values and clicks "Save"; both must be positive integers (BR-07).
    3. System updates the merchant's rule (BR-01) and shows MSG05. The change applies to later transactions only (BR-22).
- **Business rules:** BR-01, BR-07, BR-22.
- **Screen layout:**

##### 3.2.2.2 Anchoring Smart Contract (Sui Move)

- **Trigger:** called by the Anchoring Worker for each transaction.
- **Actors:** System (worker).
- **Purpose:** record proof of a transaction on Sui Testnet.
- **Data processing:**
    1. One function receives the transaction ID and the proof hash and stores them on-chain. Only the platform's publisher account can call it, and a transaction ID that is already stored is rejected.
    2. The contract holds no balances and no personal data (BR-20).
    3. The platform pays the gas fee (BR-13) and the digest is returned to the worker. The platform wallet's private key is kept only as a server secret (never in the repository or database) and the wallet is funded from the Testnet faucet.
- **Business rules:** BR-11, BR-13, BR-20.

#### 3.2.3 Core Credit Engine, API Gateway & TypeScript SDK Module

##### 3.2.3.1 Manage Customers

- **Trigger:** Owner or Staff clicks "Customers".
- **Actors:** Merchant Owner, Merchant Staff.
- **Purpose:** manage customers and their balances.
- **Data processing:**
    1. System lists the customers of the current merchant; search by code, name or phone.
    2. "+ Add Customer": name and `customer_code` (required) and phone (optional); the code must be unique in the merchant (BR-04, MSG27) and a phone number, if given, must be unique in the merchant (MSG38). The balance starts at 0 (MSG28).
    3. Name and phone can be edited (MSG29; the phone must stay unique, MSG38); the code cannot be changed and customers cannot be deleted or merged. The Owner can deactivate a customer created by mistake and reactivate it later (both are audit-logged, CR-04); an inactive customer keeps its history and balance, its code stays reserved, and it cannot be issued or redeemed (MSG39).
    4. Customers are created only here; an API request with an unknown code returns MSG22.
- **Business rules:** BR-01, BR-04.
- **Screen layout:**

##### 3.2.3.2 Issue & Redeem Points

- **Trigger:** "Issue" or "Redeem" on a customer row, or an authenticated API request.
- **Actors:** Owner, Staff, Client System / SDK.
- **Purpose:** add points for purchases or deduct points for rewards.
- **Data processing:**
    1. System rejects the request if the loyalty rules are not set (MSG32) the customer does not exist (MSG22) or the customer is inactive (MSG39).
    2. **Issue:** in one database transaction, the system locks the customer row (BR-06), then calculates points = floor(amount ÷ `earn_ratio`) (BR-17; MSG24 if 0; MSG33 if above 1,000,000 points or if the new balance would exceed 1,000,000,000), adds the points and saves an `ISSUE` record as `PENDING_ANCHOR` with the bill amount, the `earn_ratio` used and who performed it (user or API key) (MSG06).
    3. **Redeem:** in one database transaction, the system locks the row first, then checks that the points requested are at least `min_redemption_threshold` (MSG09, checked first) and that the balance covers them (MSG08), deducts the points and saves a `REDEEM` record as `PENDING_ANCHOR` with who performed it (MSG07).
    4. The transaction is then queued for Sui anchoring (MSG20).
- **Business rules:** BR-05, BR-06, BR-07, BR-12, BR-17, BR-22.
- **Screen layout:**

##### 3.2.3.3 Manage API Credentials (Developer Hub)

- **Trigger:** Owner opens "API Keys".
- **Actors:** Merchant Owner.
- **Purpose:** provide credentials for POS and SDK integration.
- **Data processing:**
    1. System lists keys with masked ID, status (`Active`, `Suspended`, `Revoked`) and date.
    2. "+ Generate New Key" creates a random key ID and secret (MSG10). A merchant can have at most 5 keys that are `Active` or `Suspended`; beyond that → MSG40 (revoke one first).
    3. The secret is shown once (MSG11) and stored only in encrypted form (CR-07).
    4. "Revoke" permanently deactivates a key (MSG12).
- **Business rules:** BR-01, BR-08, BR-18.
- **Screen layout:**

##### 3.2.3.4 Verify API Request (API Gateway)

- **Trigger:** every external request to `POST /points/issue`, `POST /points/redeem`, `GET /customers/{code}/balance` and `GET /customers/{code}/transactions`, plus (Should) `GET /loyalty-rules` for the MCP tool `get_loyalty_rules`.
- **Actors:** Client System / SDK, API Gateway.
- **Purpose:** block forged or replayed requests and find the merchant.
- **Data processing:**
    1. The request must carry `X-API-Key`, `X-Timestamp` and `X-Signature` (BR-08). An unknown, suspended or revoked key → MSG18.
    2. A timestamp more than ±5 minutes from server time → MSG17 (BR-09); this error also returns `server_time` so the client can see its clock difference.
    3. System recomputes `HMAC-SHA256(secret, timestamp + "." + method + "." + path + "." + SHA256(body) + "." + idempotency_key)`; a mismatch → MSG16. `X-Timestamp` is Unix time in seconds; `path` includes the query string exactly as sent; `SHA256(body)` is the lowercase hex hash of the raw request body (the hash of an empty string when there is no body); `idempotency_key` is the exact value of the `X-Idempotency-Key` header, or an empty string when the header is absent, so a replayed signed request cannot be given a new key; the signature is lowercase hex. The SDK signs the same way.
    4. The merchant is taken from the API key (BR-01). Invalid data → MSG33; unexpected errors → MSG23.
    5. `POST /points/issue` and `POST /points/redeem` must carry `X-Idempotency-Key` (missing → MSG33). A repeated key returns the saved response; the same key with another payload → MSG34 (BR-10). The SDK generates a key for each call unless the developer supplies one.
    6. Success returns JSON with the transaction ID, type, points, new balance and status (`PENDING_ANCHOR`); errors return the CR-06 JSON with the message code. `GET /customers/{code}/transactions` returns newest first, 20 per page (`page` parameter), with type, status and date filters.
- **Business rules:** BR-01, BR-08, BR-09, BR-10.

##### 3.2.3.5 TypeScript SDK

- **Trigger:** a merchant developer calls an SDK method in a Node.js app.
- **Actors:** Client System / SDK.
- **Purpose:** call the API without writing request-signing code.
- **Data processing:**
    1. The SDK is created with `baseUrl`, `apiKey` and `apiSecret`.
    2. Methods: `issuePoints`, `redeemPoints`, `getBalance`, `listTransactions`.
    3. Each call adds the timestamp and signature (3.2.3.4) automatically, and an idempotency key for issue and redeem (the key is part of the signature).
    4. API errors are thrown with the message code (e.g., MSG08).
- **Business rules:** BR-08, BR-09.

#### 3.2.4 OctaPoint MCP Server Module

##### 3.2.4.1 Query Credit via MCP Tools

- **Trigger:** an AI agent calls an MCP tool.
- **Actors:** AI Agent.
- **Purpose:** give AI assistants read-only access to a merchant's credit data.
- **Data processing:**
    1. The server runs over stdio with one merchant's API credentials; all queries belong to that merchant (BR-01). It runs locally on the machine of the AI client and keeps the API secret only in its own configuration.
    2. `get_balance(customer_code)` returns the current balance (MSG22 if not found). Both tools trim and upper-case the customer code before calling the API, because AI assistants often send lower case.
    3. `list_transactions(customer_code)` returns the latest 10 transactions: ID, type, points, status, Sui digest.
    4. (Should) `get_loyalty_rules()` returns the earn ratio and the minimum redemption (via `GET /loyalty-rules`).
    5. No tool can change data (BR-14). Invalid credentials → MSG18.
- **Business rules:** BR-01, BR-14.

#### 3.2.5 Transaction History & Immutable Audit Module

##### 3.2.5.1 View Transaction Ledger & Sui Explorer Link

- **Trigger:** user selects "Ledger" (Admin: "System Ledger Logs").
- **Actors:** Owner, Staff (own merchant); Admin (all merchants, read-only).
- **Purpose:** show an audit trail of point movements with blockchain proof.
- **Data processing:**
    1. System lists transactions (newest first, records with the same time ordered by id, 20 per page): ID, time, customer code, type, points, bill amount (for `ISSUE`), performed by (user or API key), status, Sui digest.
    2. Filters: type, status, date (UTC+7) and customer code (Admin: also merchant).
    3. For `ANCHORED` transactions the digest links to Sui Testnet Explorer; for `PENDING_ANCHOR` and `FAILED` only the status is shown.
    4. Owner sees a "Reverse" button on eligible rows.
- **Business rules:** BR-01, BR-03, BR-12.
- **Screen layout:**

##### 3.2.5.2 Create Reversal Transaction

- **Trigger:** Owner clicks "Reverse" on a ledger row.
- **Actors:** Merchant Owner.
- **Purpose:** correct a faulty transaction without changing history.
- **Data processing:**
    1. In one database transaction, the system locks the customer row (BR-06) and then checks that the transaction is an `ISSUE` or `REDEEM` and has not been reversed (BR-21, MSG26). The anchoring status of the original does not matter, and an inactive customer does not block a reversal.
    2. The system applies the opposite amount. Reversing an `ISSUE` is rejected if the balance would go below 0 (BR-05, MSG25); reversing a `REDEEM` is rejected if the balance would exceed 1,000,000,000 (MSG41).
    3. System saves a `REVERSAL` record linked to the original, with who performed it, as `PENDING_ANCHOR` (MSG19); the original record is unchanged (BR-03).
- **Business rules:** BR-03, BR-05, BR-06, BR-21.
- **Screen layout:**

##### 3.2.5.3 Anchor Transactions on Sui Testnet

- **Trigger:** runs automatically every 30 seconds.
- **Actors:** System (worker).
- **Purpose:** record transaction proof on Sui without slowing users down.
- **Data processing:**
    1. A single worker picks `PENDING_ANCHOR` transactions whose next attempt time has arrived, oldest first, up to a configured batch size per run, locking each row so that two runs never pick the same transaction.
    2. It calls the Move contract with the transaction ID and the proof hash (BR-20), one transaction at a time.
    3. Success: it saves `sui_digest` and sets `ANCHORED`; the Ledger then shows the digest link (MSG21). If the contract reports the ID as already stored, an earlier attempt succeeded: the worker looks for the `Anchored` event with that ID (newest first, at most 1,000 events), reads the digest from it and sets `ANCHORED`; if the event is not found it counts as an ordinary failure (b).
    4. Failure, two cases. (a) Temporary infrastructure error (Testnet or RPC unavailable, network error or timeout, platform wallet out of gas): this does not count as an attempt; the transaction stays `PENDING_ANCHOR`, the run stops, the error is stored and logged, and the transaction is tried again after 5 minutes. (b) Any other error counts as an attempt: it retries after 1, 2, 4, 8 and 16 minutes, then sets `FAILED`, a final state in this MVP (LI-08). The attempt count, next attempt time and last error are stored on the record (BR-03). Balances are never changed (BR-11).
- **Business rules:** BR-03, BR-11, BR-12, BR-20.

#### 3.2.6 Admin Monitoring & Analytics Module

##### 3.2.6.1 View Admin Dashboard

- **Trigger:** Admin logs in or selects "Dashboard".
- **Actors:** Admin.
- **Purpose:** show platform-wide counters.
- **Data processing:**
    1. **Total Merchants:** all merchants, split by Pending, Active and Suspended.
    2. **Total Customers:** customers of all merchants, whatever their status.
    3. **Total Points Issued / Redeemed:** points of `ISSUE` / `REDEEM` transactions minus the points of their `REVERSAL` transactions.
- **Business rules:** BR-01, BR-02.
- **Screen layout:**

##### 3.2.6.2 View Merchant Dashboard

- **Trigger:** Owner logs in or selects "Dashboard".
- **Actors:** Merchant Owner.
- **Purpose:** show counters of the owner's merchant.
- **Data processing:**
    1. **Total Customers** of the merchant.
    2. **Circulating Points:** sum of all customers' balances.
    3. **Today's Transactions:** number of transactions of all types (`ISSUE`, `REDEEM`, `REVERSAL`) and statuses created today (UTC+7).
- **Business rules:** BR-01, BR-02.
- **Screen layout:**

## 4. Non-Functional Requirements

### 4.1 External Interfaces

- **User interface:** Next.js and Tailwind CSS; desktop-first (1280×720 and above); English only.
- **Hardware:** standard desktop clients only.
- **API Gateway:** REST over HTTPS with JSON.
- **SDK:** TypeScript/Node.js library with automatic HMAC-SHA256 signing.
- **MCP:** JSON-RPC over stdio.
- **Blockchain:** public Sui Testnet JSON-RPC via `@mysten/sui`.

### 4.2 Quality Attributes

- **Maintainability:** modular layers (API, services, database, blockchain worker); strict TypeScript; API documented in a Postman collection.
- **Usability:** consistent navigation and toast messages; issuing or redeeming points takes at most 3 steps.
- **Reliability:** Sui outages do not block database transactions; anchoring is retried automatically (BR-12).
- **Performance:** 95% of issue, redeem, balance and history requests respond within 200 ms, measured at the API server, with up to 20 concurrent clients (anchoring excluded); these are design targets, not load-tested (LI-11); screens load within 3 seconds.
- **Scalability:** designed for 10 merchants, 10,000 customers each and 5 transactions per second (database transactions; anchoring catches up from a backlog and has no throughput guarantee).
- **Design constraints:** no Redis, Walrus, Enoki or Stripe (LI-06); the database is the source of truth (LI-08).
- **Security:** HMAC-SHA256 with a ±5-minute window; BCrypt passwords; API secrets stored encrypted (CR-07); HTTPS; sessions expire after 8 hours (BR-19); tenant isolation by `merchant_id` (BR-01).

## 5. Requirement Appendix

### 5.1 Business Rules

| **ID** | **Rule** |
| --- | --- |
| **BR-01** | **Tenant Isolation:** all customers, rules, transactions and staff belong to one `merchant_id`. Only the Admin has read-only cross-merchant access. |
| **BR-02** | **Role Authorization:** users access only what their role (`ADMIN`, `MERCHANT_OWNER`, `MERCHANT_STAFF`) allows (matrix 3.1.6). |
| **BR-03** | **Immutable Ledger:** transactions cannot be edited or deleted; errors are fixed by an offsetting `REVERSAL`. Only `status`, `sui_digest` and the anchoring retry fields (attempt count, next attempt time) are updated by the system. |
| **BR-04** | **Scoped Customer Code:** `customer_code` is unique within a merchant and cannot be changed. A phone number, when given, is unique within a merchant. |
| **BR-05** | **Non-Negative Balance:** balances never go below zero; redemptions and reversals that would do so are rejected. |
| **BR-06** | **Atomic Balance Updates:** point changes run in a database transaction with row locking (`SELECT ... FOR UPDATE`). The row is locked before any check that depends on the balance or on earlier transactions. The database also enforces balance \>= 0 and at most one `REVERSAL` per original transaction. |
| **BR-07** | **Rule Validity:** `earn_ratio` and `min_redemption_threshold` are positive integers; a single redemption of fewer points than `min_redemption_threshold` is rejected (MSG09, checked before the balance check). |
| **BR-08** | **API Authentication:** API calls need valid `X-API-Key`, `X-Timestamp` and `X-Signature` headers. |
| **BR-09** | **Timestamp Freshness:** requests more than ±5 minutes from server time are rejected. |
| **BR-10** | **Idempotency:** issue and redeem requests must carry an `X-Idempotency-Key`. For the same API key, the same key within 24 hours of its first use returns the saved response of the first request; the same key with another request (different method, path or body) is rejected. The idempotency key is also part of the HMAC signature (3.2.3.4). A duplicate that arrives while the first request is still processing waits for it. Failed requests are not saved, so the same key can be retried. |
| **BR-11** | **Database as Source of Truth:** PostgreSQL holds the balances; the blockchain is only an external proof. |
| **BR-12** | **Asynchronous Anchoring:** every transaction is saved as `PENDING_ANCHOR`, then anchored in the background (`ANCHORED`). Failed attempts are retried. Temporary infrastructure errors (Testnet or RPC unavailable, network error, wallet out of gas) do not count as attempts; any other error counts, and after 5 retries the transaction is marked `FAILED`. |
| **BR-13** | **Platform Gas Sponsorship:** the platform pays gas fees; merchants and customers need no wallet. |
| **BR-14** | **Read-Only AI Protocol:** MCP tools only read data (`get_balance`, `list_transactions`, `get_loyalty_rules` if implemented). The MCP Server exposes no write tool; it uses a normal merchant API key (LI-05). |
| **BR-15** | **No Cross-Merchant Transfers:** points cannot be transferred or combined across merchants. |
| **BR-16** | **Single Point Type:** each merchant has one point type; each customer has one balance per merchant. |
| **BR-17** | **Point Calculation:** points = floor(bill amount ÷ `earn_ratio`); a result of 0 is rejected (MSG24) and a result above 1,000,000 points is rejected (MSG33). The remainder is not carried over (15,000 VND at 10,000 VND per point gives 1 point). |
| **BR-18** | **Merchant Status:** a merchant is `Pending`, `Active` or `Suspended`. Only `Active` merchants can log in or use API keys. Suspending suspends its API keys; approving restores them, except keys revoked by the Owner. Transitions are listed in 3.2.1.2. Transactions already saved as `PENDING_ANCHOR` are still anchored while a merchant is suspended. |
| **BR-19** | **Session Validity:** sessions expire after 8 hours or on logout, and end when the user is deactivated or the merchant is not `Active`. User and merchant status are checked against the database on every authenticated request; an ended session shows MSG35. |
| **BR-20** | **On-chain Data Minimization:** only the transaction ID and a hash are written on-chain, never personal data. The proof hash is the SHA-256 of the canonical JSON (keys sorted) of the transaction's fixed fields: `transaction_id`, `merchant_id`, `customer_code`, `type`, `points`, `created_at` and, for a `REVERSAL`, the original transaction ID. `status` and `sui_digest` are not part of the hash. |
| **BR-21** | **Reversal Eligibility:** an `ISSUE` or `REDEEM` can be reversed once; a `REVERSAL` cannot be reversed. The anchoring status of the original does not matter and the customer may be inactive. A reversal that would push the balance below 0 (reversing an `ISSUE`, MSG25) or above 1,000,000,000 (reversing a `REDEEM`, MSG41) is rejected. |
| **BR-22** | **Rules Before Points:** issue and redeem are rejected until loyalty rules are saved; a rule change affects only later transactions. |

### 5.2 Common Requirements

| **ID** | **Name** | **Description** |
| --- | --- | --- |
| **CR-01** | Data Validation | Required fields on web forms and API payloads are validated on client and server. |
| **CR-02** | Data Formats | Timestamps in ISO 8601 UTC; `customer_code` is 1–32 uppercase letters or digits; phone (optional) is 10 digits starting with 0; points and amounts are positive integers stored as 64-bit values, with these ceilings: bill amount ≤ 1,000,000,000 VND, points per request (including the points calculated for an `ISSUE`) ≤ 1,000,000, customer balance ≤ 1,000,000,000 points, `earn_ratio` and `min_redemption_threshold` ≤ 1,000,000 (a request that would exceed a ceiling → MSG33); lowercase `customer_code` is rejected (MSG33); `X-Timestamp` is Unix time in seconds; "today" and date filters use UTC+7. |
| **CR-03** | Session Authorization | Internal endpoints require a valid session and check the role. |
| **CR-04** | Audit Logging | Rule changes, API key changes, merchant approval/suspension, staff changes, customer deactivation/reactivation, password changes and reversals are logged (user, action, time); issue and redeem are recorded in the ledger with who performed them (3.2.3.2). The log is stored in the database only (LI-03). |
| **CR-05** | Unique Codes | `TXN-[YYYYMMDD (UTC)]-[8 uppercase alphanumeric]` for transactions, `MCH-[6 uppercase alphanumeric]` for merchants; both are UNIQUE in the database and a duplicate code is regenerated. |
| **CR-06** | Error Handling | Errors return JSON (`code`, `message`) without stack traces. |
| **CR-07** | Secret Security | API secrets are shown once and stored only in encrypted form (reversible, because HMAC needs the raw secret) with a master key kept in a server environment variable, never in the database or repository. |
| **CR-08** | Password Policy | Passwords are 8–64 characters with at least one letter and one digit, and must differ from the email. A new password must also differ from the current one. Violations → MSG37. Applies to registration, the staff initial password and password change. |

### 5.3 Application Messages List

| **#** | **Code** | **Type** | **Context** | **Content** |
| --- | --- | --- | --- | --- |
| 1 | MSG01 | Inline | Form validation | This field is required and cannot be left blank. |
| 2 | MSG02 | Inline | Login | Incorrect email or password. Please try again. |
| 3 | MSG03 | Toast (Success) | Login | Login successful. Welcome to OctaPoint! |
| 4 | MSG04 | Toast (Error) | Authorization | Access denied. You do not have permission to perform this action. |
| 5 | MSG05 | Toast (Success) | Rule config | Loyalty rules have been updated successfully. |
| 6 | MSG06 | Toast (Success) | Points | Successfully issued {points} points to customer {customer\_code}. |
| 7 | MSG07 | Toast (Success) | Points | Successfully redeemed {points} points. New balance: {new\_balance}. |
| 8 | MSG08 | Toast (Error) | Points | Insufficient point balance for this redemption. |
| 9 | MSG09 | Toast (Error) | Points | Redemption amount must be at least {min\_points} points. |
| 10 | MSG10 | Toast (Success) | Developer Hub | API Key and Secret generated successfully. |
| 11 | MSG11 | Toast (Warning) | Developer Hub | Please copy your API Secret now. It will not be shown again! |
| 12 | MSG12 | Toast (Success) | Developer Hub | API Key has been revoked successfully. |
| 13 | MSG13 | Toast (Success) | Admin | Merchant has been approved and activated. |
| 14 | MSG14 | Toast (Warning) | Admin | Merchant has been suspended. |
| 15 | MSG15 | Toast (Error) | Login | Your merchant account is suspended or pending approval. |
| 16 | MSG16 | API Error | Gateway | Invalid HMAC-SHA256 signature. |
| 17 | MSG17 | API Error | Gateway | Request timestamp is expired or outside the valid window. |
| 18 | MSG18 | API Error | Gateway | API Key is invalid, suspended or revoked. |
| 19 | MSG19 | Toast (Success) | Ledger | Reversal transaction {reversal\_id} executed successfully. |
| 20 | MSG20 | Toast (Info) | Anchoring | Transaction saved. Awaiting Sui Testnet proof anchoring. |
| 21 | MSG21 | Status label (Ledger) | Anchoring | Transaction proof anchored on Sui Testnet. |
| 22 | MSG22 | Toast / API Error | Customer lookup | Customer code not found. |
| 23 | MSG23 | Toast / API Error | System | An unexpected error occurred. Please try again later. |
| 24 | MSG24 | Toast (Error) | Points | The spend amount is too low to earn any point. |
| 25 | MSG25 | Toast (Error) | Ledger | Reversal rejected: the customer's balance would become negative. |
| 26 | MSG26 | Toast (Error) | Ledger | This transaction has already been reversed or cannot be reversed. |
| 27 | MSG27 | Inline | Customers | This customer code already exists. |
| 28 | MSG28 | Toast (Success) | Create | Add new {entity\_name} successfully. |
| 29 | MSG29 | Toast (Success) | Update | Update {entity\_name} successfully. |
| 30 | MSG30 | Toast (Success) | Registration | Registration submitted. Your account is pending approval. |
| 31 | MSG31 | Inline | Registration / Staff | This email is already registered. |
| 32 | MSG32 | Toast / API Error | Points | Loyalty rules are not set yet. |
| 33 | MSG33 | API Error | Gateway | Request data is invalid. |
| 34 | MSG34 | API Error | Gateway | This Idempotency-Key was already used with a different request. |
| 35 | MSG35 | Toast (Error) | Session | Your session has ended. Please log in again. |
| 36 | MSG36 | Inline | Account Settings | The current password is incorrect. |
| 37 | MSG37 | Inline | Password | Password must be 8–64 characters and include at least one letter and one digit. |
| 38 | MSG38 | Inline | Customers | This phone number already exists. |
| 39 | MSG39 | Toast / API Error | Points | This customer is inactive. |
| 40 | MSG40 | Toast (Error) | Developer Hub | The maximum number of active API keys has been reached. Revoke one first. |
| 41 | MSG41 | Toast (Error) | Ledger | Reversal rejected: the customer's balance would exceed the maximum. |
