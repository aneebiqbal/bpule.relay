# 06 — MESSAGE QUALITY REPORT

## Overall Quality Distribution

| Quality | Count | Percentage |
|---------|-------|------------|
| GOOD (send as-is) | 194 | 31.5% |
| SEND_WITH_MINOR_EDIT | 202 | 32.8% |
| NEEDS_REWRITE | 0 | 0% |
| SHOULD_NOT_HAVE_BEEN_GENERATED | 220 | 35.7% |

**Sendable rate: 64.3%** (GOOD + MINOR_EDIT)
**Unacceptable rate: 35.7%** (SHOULD_NOT_HAVE_BEEN_GENERATED)

This falls below the target of 80% sendable.

## Failure Analysis

### Failure Tag Distribution

| Tag | Count | Description |
|-----|-------|-------------|
| WRONG_COMPANY | 220 | Message targets a competitor/dev company |
| BAD_CTA | 204 | No clear call-to-action or inappropriate CTA |
| TEMPLATE | 72 | Seed/prospect-check template messages |
| IRRELEVANT_PERSONALIZATION | 41 | "I noticed..." / "I see that..." patterns |
| TOO_SHORT | 21 | Under 50 characters |
| TOO_LONG | 2 | Connection note over 300 chars |
| WRONG_CHANNEL | 0 | (none flagged by automated check) |

## By Message Type

### Connection Notes (408 total)
- Many are generic "congrats on X" templates
- Average quality varies significantly by model

### DMs (184 total)
- Model quality: openai > groq > opencode > seed
- Seed/template messages are entirely generic

### Follow-ups (4 total)
- Very small sample
- All appear to be variations of the initial pitch

### Replies (20 total)
- Mix of human-sent and AI-generated
- AI replies appear appropriate

## By Model

| Model | Count | Notes |
|-------|-------|-------|
| null (legacy) | 190 | Mostly seed/template or human-written |
| opencode (tier1) | 174 | Variable quality, some good some generic |
| tier4:openai | 61 | Generally best quality |
| tier1:groq | 40 | Mixed, sometimes awkward |
| prospect-check | 70 | Template/seed messages |
| seed | 2 | Completely generic |

## Send Disposition

| Disposition | Count |
|-------------|-------|
| null (never reviewed/sent) | 460 |
| SENT_UNCHANGED | 132 |
| HEAVY_EDIT | 12 |
| LIGHT_EDIT | 12 |
| REJECTED | 0 |

**74.7% of messages (460/616) have no send disposition** — they were
generated but never reviewed or sent.

## Recurring Message Problems

1. **Generic template messages**: "Hey! Saw your company is growing.
   We help teams like yours ship faster. Worth a quick chat?" — appears
   verbatim for multiple unrelated leads.

2. **Premature pitching**: Connection notes contain sales pitches
   ("I help founders reduce delivery risk...").

3. **No real personalization**: Messages reference "your company" or
   "your hiring" without specific detail.

4. **Wrong company targeting**: 220 messages target software development
   companies as if they were buyers.

5. **CTA issues**: 204 messages have no clear CTA or inappropriate CTA
   for the channel.

## Sample Good Messages


[dm] Hey Hala,

I see you’re adding an Application Security Engineer in Amsterdam and that the team is scaling fast. With 8 years of shipping 40+ AI‑enabled products without a full rewrite, I often help fi

[dm] Hey Luis,

I saw your post about hiring a Geospatial Data Engineer in Japan. Scaling that kind of talent pipeline while keeping product delivery on track can be tricky. I’ve spent 8 years shipping AI 

[connection] Hi Akshay S., noticed Hiring: Mid Full Stack Engineer (Angular, Node, TS) & other at 3Pillar Global. Open to connecting?


## Sample Bad Messages


[dm] Lead: c3f17ace | BAD_CTA; WRONG_COMPANY
  Hey Sema,

I saw you’re dealing with legacy integrations in the Leo satellite software stack. I’ve spent 8 years shipping AI‑driven products-over 40 launches-while helping teams replace aging componen

[dm] Lead: c3f17ace | BAD_CTA; WRONG_COMPANY
  Hey Sema,

I saw you’re dealing with legacy integrations in the Leo satellite software stack. I’ve spent 8 years shipping AI‑driven products-over 40 launches-while helping teams replace aging componen

[connection] Lead: f99a0b19 | WRONG_COMPANY
  Hey Philip, congrats on co‑founding Purple Angels Tech in Sherbrooke. I help founders reduce delivery risk on product roadmaps. May I write up a quick read on your current backlog?

[connection] Lead: f99a0b19 | WRONG_COMPANY
  Hey Philip, congrats on co‑founding Purple Angels Tech in Sherbrooke. I help founders reduce delivery risk on product roadmaps. May I write up a quick read on your current backlog?

[connection] Lead: 37164e41 | WRONG_COMPANY
  Hey Richard, I saw CINC is adding several senior LLM ops engineers. With that hiring surge, do you ever worry about keeping delivery on the roadmap? I can write up a quick read on how a delivery partn
