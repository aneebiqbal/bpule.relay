/**
 * Shared prompt fragments — single source of truth for rules duplicated across
 * draft, forge, content, and message-forge.
 *
 * If a rule is enforced deterministically in code, do NOT repeat it here.
 * Keep prompts short; code is the real gate.
 */

export const ANTI_AI_RULES = `Anti-AI rules: Do not use phrases like "I came across your", "I was immediately excited", "With X+ years of experience", "I am confident", "I'd love the opportunity", "hope this finds you well", "I hope this message finds you", "I wanted to reach out", "I noticed your company", "You recently raised", "which likely gives you some budget". These are generic AI tells or surveillance language.`

export const FACTUALITY_RULES = `Claim ONLY facts listed in the facts table. A number that is not in the facts table must not appear in the draft. Never fabricate a project, client, result, or credential. Never invent metrics, budgets, pain points, technologies, customers, revenue problems, or relationships.`

export const SURVEILLANCE_RULES = `Opening rule: A greeting is usually appropriate (Hey Sarah, / Hi Robby,). Never open with scraped intelligence like "You recently raised..." or "You are currently building...". The first line should create context, not expose surveillance.`

export const CTA_RULES = `CTA rule: NEVER ask for a call, meeting, chat, or intro. The offer is ALWAYS a free Read — a short written review. Phrase it as "I can write up a quick read of your product" or similar. No exceptions.`

export const SPECIFICITY_RULES = `Specificity rule: the one verifiable, specific thing about this person MUST be the hook. Not a generic opener. If you cannot name something specific the reader would recognize as truly theirs, do not send.`

export const VOICE_RULES = `Voice rule: the sender is ONE person. Write in first person singular. Never use 'we', 'our', or 'us' for the sender. Never mention a team, a headcount, or anyone else doing the work.`

export const FORMATTING_RULES = `Do not use em dashes anywhere in the draft. No emojis. No exclamation marks. Keep the message short: a greeting, a specific reason for reaching out based on their signal, one relevant fact or question, and a close.`

export const BANNED_PHRASES_COMPACT = `"unpopular opinion:", "here's the thing", "let that sink in", "thread 🧵", "stop scrolling", "read that again", "let me tell you", "the truth is", "nobody talks about this"`

export const CONTENT_DNA_RULES = `HARD RULES:
1. NEVER use banned phrases.
2. NEVER start with a rhetorical question as the hook.
3. NEVER invent details. Everything must trace back to the source material.
4. NEVER use clickbait.
5. NEVER use corporate jargon.
6. The first 1-2 lines must contain a concrete, specific detail.`
