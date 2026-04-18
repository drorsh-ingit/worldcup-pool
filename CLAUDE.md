# CLAUDE.md — World Cup Prediction Pool

## Project Overview
A World Cup prediction pool app where groups of friends bet on tournament outcomes.
Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Prisma, Neon Postgres.

## Design Rules

### DO
- Light, minimal, clean, modern design — shadcn aesthetic
- Neutral palette (whites, grays, one subtle amber accent color)
- Good typography hierarchy, plenty of whitespace
- Font: Use Inter from Google Fonts
- Mobile responsive (mobile-first approach)
- Light motion: scroll animations via IntersectionObserver, smooth transitions, subtle hover
- Use Lucide icons exclusively
- Use shadcn/ui components as the base for all UI elements
- Consistent spacing: use Tailwind's spacing scale (p-4, gap-3, etc.)
- Cards with subtle borders (border-neutral-200), no heavy shadows

### DON'T
- No bright saturated gradients
- No emoji icons (use Lucide icons)
- No "revolutionary", "game-changing" marketing copy
- No heavy shadows or busy patterns
- No dark mode
- No border-radius > rounded-2xl
- No cramped spacing or tiny fonts (< 14px)
- No purple gradients, no neon colors
- No generic AI aesthetics

### Color Palette
- Background: white (#ffffff), neutral-50 (#fafafa) for surfaces
- Text: neutral-900 for headings, neutral-600 for body, neutral-400 for muted
- Accent: amber-500 (#f59e0b) for primary actions, amber-50 for accent backgrounds
- Success: emerald-500
- Danger: red-500
- Borders: neutral-200

### Typography
- Font: Inter (Google Fonts)
- Headings: font-semibold, tracking-tight
- Body: text-base (16px), leading-relaxed
- Small text: text-sm (14px) minimum — never smaller

## Architecture

### Stack
- Next.js 14 App Router with TypeScript
- Tailwind CSS + shadcn/ui
- Prisma ORM + Neon Postgres
- NextAuth.js v5 (beta) for auth
- Zod for validation
- bcryptjs for password hashing
- Deployed: Vercel (frontend+API) + Neon (database)

### Directory Structure
```
src/
  app/
    (auth)/           # Login, signup pages (no nav)
    (app)/            # Authenticated pages (with nav)
      dashboard/      # User's groups overview
      group/[groupId]/ # Group view: leaderboard, bets, matches
      admin/          # Group admin panel
    api/              # API routes
      auth/           # NextAuth handler
  components/
    ui/               # shadcn/ui components
  lib/
    db.ts             # Prisma client singleton
    auth.ts           # NextAuth config
    scoring.ts        # Scoring engine (base+bonus+outlier clamping)
    odds.ts           # Odds/probability utilities
    validators.ts     # Zod schemas
  types/              # TypeScript type definitions
prisma/
  schema.prisma       # Database schema
```

### Security Rules
- All passwords hashed with bcrypt (12 rounds)
- All API routes verify session + group membership
- Bets from other users hidden until bet is locked AND event is decided
- Group data scoped — no cross-group data leakage
- Input validation with Zod on every mutation
- Rate limiting on auth endpoints
- CSRF protection via NextAuth

### Scoring System
- 4 tiers: Pre-tournament (25%), Per-game (40%), Milestones (20%), Curated (15%)
- Sub-weights within each tier (configurable per group)
- Base + Bonus model: guaranteed floor for correct picks + odds-scaled bonus
- Outlier clamping: extreme longshots capped to prevent compression
- Knockout multipliers: 1.0x group → 1.2x R32 → 1.3x R16 → 1.5x QF → 1.7x SF → 2.0x final
- All parameters configurable by group admin
