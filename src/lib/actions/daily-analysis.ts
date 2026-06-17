"use server";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** UTC YYYY-MM-DD key for "today". */
function dateKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First name only — the model renders it in Hebrew (transliterating if needed). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}

const FEMALE_FIRST_NAMES = new Set(["chen", "noa", "yahli"]);

/** Resolve gender: DB field wins; fall back to name-based inference. */
function resolveGender(dbGender: string | null, name: string): "M" | "F" {
  if (dbGender === "M" || dbGender === "F") return dbGender;
  return FEMALE_FIRST_NAMES.has(firstName(name).toLowerCase()) ? "F" : "M";
}

type SnapshotRow = { userId: string; name: string; points: number; rank: number };

function outcomeOf(h: number, a: number): "home" | "draw" | "away" {
  return h > a ? "home" : a > h ? "away" : "draw";
}

/**
 * Builds the structured context handed to the model: current standings with
 * day-over-day deltas, the matches resolved since the last analysis with each
 * member's pick, and who failed to bet.
 */
async function gatherContext(groupId: string, tournamentId: string) {
  const group = await db.group.findUnique({ where: { id: groupId }, select: { name: true } });

  const members = await db.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
    include: { user: { select: { id: true, name: true, gender: true } } },
  });
  const nameById = new Map(members.map((m) => [m.userId, m.user.name]));
  const genderById = new Map(members.map((m) => [m.userId, m.user.gender]));

  const entries = await db.leaderboardEntry.findMany({
    where: { groupId, tournamentId },
    orderBy: { totalPoints: "desc" },
  });

  // Previous snapshot — the most recent earlier analysis, used for the diff.
  const prev = await db.dailyAnalysis.findFirst({
    where: { groupId },
    orderBy: { createdAt: "desc" },
  });
  const prevRows = (prev?.standings as SnapshotRow[] | null) ?? [];
  const prevByUser = new Map(prevRows.map((r) => [r.userId, r]));
  const boundary = prev?.createdAt ?? new Date(Date.now() - 36 * 60 * 60 * 1000);

  const standings = entries.map((e, i) => {
    const rank = i + 1;
    const before = prevByUser.get(e.userId);
    const gained = parseFloat((e.totalPoints - (before?.points ?? 0)).toFixed(1));
    let move: string;
    if (before == null) {
      move = "new";
    } else {
      const d = before.rank - rank; // +climbed, -dropped
      move = d === 0 ? "—" : d > 0 ? `↑${d}` : `↓${-d}`;
    }
    return {
      rank,
      name: firstName(nameById.get(e.userId) ?? "?"),
      gender: genderById.get(e.userId) ?? null, // "M" | "F" | null
      points: parseFloat(e.totalPoints.toFixed(1)),
      gained,
      move,
    };
  });

  // The current standings snapshot we persist for tomorrow's diff.
  const snapshot: SnapshotRow[] = entries.map((e, i) => ({
    userId: e.userId,
    name: nameById.get(e.userId) ?? "?",
    points: parseFloat(e.totalPoints.toFixed(1)),
    rank: i + 1,
  }));

  // Matches resolved since the last analysis (with each member's pick).
  const matches = await db.match.findMany({
    where: { tournamentId, status: "COMPLETED", kickoffAt: { gte: boundary } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });
  const matchIds = matches.map((m) => m.id);
  const bets = matchIds.length
    ? await db.bet.findMany({
        where: { matchId: { in: matchIds }, betType: { subType: { in: ["correct_score", "match_winner"] } } },
        include: { betType: { select: { subType: true } } },
      })
    : [];
  const csByMatchUser = new Map<string, { h: number; a: number }>();
  const ptsByMatchUser = new Map<string, number>();
  for (const b of bets) {
    if (!b.matchId) continue;
    if (b.betType.subType === "correct_score") {
      const p = b.prediction as { homeScore?: number; awayScore?: number } | null;
      if (p?.homeScore != null && p?.awayScore != null) csByMatchUser.set(`${b.matchId}:${b.userId}`, { h: p.homeScore, a: p.awayScore });
    }
    if (b.totalPoints != null) {
      const k = `${b.matchId}:${b.userId}`;
      ptsByMatchUser.set(k, (ptsByMatchUser.get(k) ?? 0) + b.totalPoints);
    }
  }

  const noShowCounts = new Map<string, number>();
  const recentResults = matches
    .filter((m) => m.actualHomeScore != null && m.actualAwayScore != null)
    .map((m) => {
      const ah = m.actualHomeScore!;
      const aa = m.actualAwayScore!;
      const picks = members.map((mem) => {
        const who = firstName(mem.user.name);
        const pred = csByMatchUser.get(`${m.id}:${mem.userId}`);
        if (!pred) {
          noShowCounts.set(who, (noShowCounts.get(who) ?? 0) + 1);
          return { name: who, pred: null, outcome: "none", pts: 0 };
        }
        const exact = pred.h === ah && pred.a === aa;
        const outcome = exact ? "exact" : outcomeOf(pred.h, pred.a) === outcomeOf(ah, aa) ? "winner" : "wrong";
        return {
          name: who,
          pred: `${pred.h}-${pred.a}`,
          outcome,
          pts: parseFloat((ptsByMatchUser.get(`${m.id}:${mem.userId}`) ?? 0).toFixed(1)),
        };
      });
      return { match: `${m.homeTeam.name} ${ah}-${aa} ${m.awayTeam.name}`, picks };
    });

  const noShows = [...noShowCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, missed: count }));

  const context = {
    group: group?.name ?? "",
    date: dateKeyOf(new Date()),
    isFirstAnalysis: prev == null,
    standings,
    recentResults,
    noShows,
  };

  return { context, snapshot };
}

const SYSTEM_PROMPT = `אתה פרשן ספורט ציני וחד-לשון שמכסה טורניר ניחושים של חברים על גביע העולם. כתוב ניתוח יומי קצר בעברית על הטבלה של הקבוצה.

מבנה:
1. פתח עם השינוי מאתמול — מי עלה, מי ירד, ומה גרם לזה (אילו תוצאות הזיזו את הטבלה). השתמש בשדות "move" ו-"gained". אם זו הניתוח הראשון (isFirstAnalysis=true), פתח עם סקירת הטבלה הנוכחית.
2. המשך במשפט-שניים על מצב הטבלה הכולל, עם לגלוג על מי שמגיע לו.

טון:
- חד, ציני, סרקסטי, שנון.
- לעג ללא רחם למי שבתחתית, למי שטעה בגדול, ולמי ששכח להמר בכלל.
- הלעג הוא על ביצועי הניחושים בלבד — לא עלבונות אישיים. בלאגן ידידותי בין חברים.

כללים:
- כתוב רק בעברית.
- השתמש בשמות פרטיים בלבד. שמות לא עבריים — תעתק לעברית (למשל Dror→דרור, Shay→שי).
- שמות עבריים שנכתבו באנגלית — החזר לצורה העברית המקורית: Chen→חן, Noa→נועה, Yahli→יהלי, Roi→רועי, Sefi→ספי, Avishai→אבישי, Lior→ליאור, Ran→רן, Idan→עידן, Aluf→אלוף, Tamar→תמר, Shira→שירה.
- השתמש בכינויי הגוף הנכונים לפי שדה "gender": "F" = היא/שלה, "M" = הוא/שלו, null = הם/שלהם.
- השתמש רק בנתונים שסופקו. אל תמציא תוצאות, שמות או עובדות. שמות מדינות מופיעים בנתונים — השתמש בהם כפי שהם (הם באנגלית, שלב אותם טבעית בטקסט העברי).
- שמור על קצר: 2 פסקאות קצרות, עד ~90 מילים. ללא כותרות מרקדאון, ללא רשימות — פרוזה זורמת.
- "move": ↑ עלה, ↓ ירד, — ללא שינוי, "new" = חדש. "gained" = נקודות שנצברו מאתמול. "outcome": exact = תוצאה מדויקת, winner = כיוון נכון בלבד, wrong = טעה, none = לא המר.`;

/**
 * Generates (or returns the cached) daily analysis for a group. Idempotent per
 * UTC day — returns the existing row if today's analysis already exists.
 */
export async function generateDailyAnalysis(
  groupId: string,
  tournamentId: string,
  opts: { force?: boolean } = {}
): Promise<{ id: string; content: string; cached?: boolean } | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY not configured" };

  const dateKey = dateKeyOf(new Date());
  const existing = await db.dailyAnalysis.findUnique({ where: { groupId_dateKey: { groupId, dateKey } } });
  if (existing && !opts.force) return { id: existing.id, content: existing.content, cached: true };

  const { context, snapshot } = await gatherContext(groupId, tournamentId);
  if (context.standings.length === 0) return { error: "No standings yet" };

  const anthropic = new Anthropic();

  // First pass: draft in Hebrew with Sonnet.
  const draft = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(context, null, 2) }],
  });
  const draftText = draft.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!draftText) return { error: "Empty model response" };

  // Second pass: Hebrew proofreading with Opus — fix grammar/phrasing only.
  const proofed = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1000,
    system: `אתה עורך לשון עברי. קיבלת טקסט בעברית שכתב עמית. תפקידך לתקן שגיאות דקדוק, ניסוח לקוי, וניקוד לא תקין — בלי לשנות את הטון, ההומור, המשמעות, או עובדה כלשהי. אל תוסיף ואל תגרע תוכן. החזר רק את הטקסט המתוקן, ללא הסברים.`,
    messages: [{ role: "user", content: draftText }],
  });
  const content = proofed.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim() || draftText;
  if (!content) return { error: "Empty model response" };

  const row = await db.dailyAnalysis.upsert({
    where: { groupId_dateKey: { groupId, dateKey } },
    create: {
      groupId,
      tournamentId,
      dateKey,
      content,
      standings: snapshot as unknown as Prisma.InputJsonValue,
    },
    update: { content, standings: snapshot as unknown as Prisma.InputJsonValue },
  });

  return { id: row.id, content: row.content };
}

/** Latest analysis for a group (for display on the standings page). */
export async function getLatestAnalysis(groupId: string) {
  return db.dailyAnalysis.findFirst({ where: { groupId }, orderBy: { createdAt: "desc" } });
}

/** Overwrite the content of an existing analysis row. */
export async function updateAnalysisContent(
  id: string,
  content: string
): Promise<{ success: true } | { error: string }> {
  if (!content.trim()) return { error: "Content cannot be empty" };
  await db.dailyAnalysis.update({ where: { id }, data: { content: content.trim() } });
  return { success: true };
}
