# OCTAPOINT PROJECT RULES & CONTEXT FOR GITHUB COPILOT

## 1. Project Overview
OctaPoint is a B2B2C Blockchain-Backed Credit-as-a-Service (CaaS) Enterprise Loyalty Platform built on Sui Testnet, featuring a TypeScript SDK and an AI-Ready MCP Server.

## 2. Strict Source of Truth Rules (MANDATORY)
- NEVER invent new database table names or column names. ALWAYS read `#file:packages/database/postgres/prisma/schema.prisma` before generating any SQL, Prisma queries, ERD, Class Diagram, or Database documentation.
- NEVER invent new Use Case IDs (`UC-01` to `UC-20`) or Business Rule IDs (`BR-01` to `BR-20`). ALWAYS follow `#file:docs/00-master-spec.md`.
- Keep implementation clean, modular, and strictly within the assigned directory:
  - Frontend (`apps/web-portals/`): Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Zustand.
  - Backend (`apps/api-gateway/`): Hono (TypeScript), Prisma ORM, PostgreSQL. Divide logic into `<module>.controller.ts`, `<module>.service.ts`, and `<module>.repository.ts`.
  - Blockchain (`contracts/octapoint_move/`): Sui Move (`@mysten/sui`), backend-sponsored gasless execution.
  - AI Layer (`packages/mcp-server/`): `@modelcontextprotocol/sdk` (TypeScript MCP Server).

## 3. Capstone Documentation Rules (FPT Standard)
When asked to write SRS Functional Requirements (Chapter III), strictly output in English using this exact template:
- **3.X.Y [Use Case Name]**
  - **Function Trigger**: [Step-by-step navigation: Actor logs in -> Navigates to "..." -> Clicks "..."]
  - **Function Description**:
    - **Actors**: [Actor Name]
    - **Purpose**: [Clear business purpose]
    - **Interface**: [Detailed UI components: input fields, filter dropdowns, table columns, action buttons]
    - **Data Processing**: [Exact tables and columns read/updated in `schema.prisma`, status transitions, Sui on-chain calls, notifications]
  - **Function Details**:
    - **Validation**: [Required fields, format checks, numeric ranges, HMAC/rate-limit checks]
    - **Business Rules**: [Cite exact `BR-XX` codes from `00-master-spec.md` and explain enforcement]
    - **Normal Case**: [Step-by-step happy path]
    - **Abnormal Case**: [At least 3 specific business/validation/system error scenarios and exact error messages]