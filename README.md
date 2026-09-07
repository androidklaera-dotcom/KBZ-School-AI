# KBZ School Assistant — Vercel-ready

This package is ready to deploy as a simple Vercel project. It uses the uploaded KBZ Grade 5–12 structured class timetable data and a coordinate-based extraction of all 59 dedicated teacher timetable pages.

## What it answers

- Grade 5–12 class timetables (section, weekday, period)
- Teacher timetables, including Teaching, Cover, Meeting/HODM, Free, and other labels present in the teacher source
- Grade-specific period times
- General school contact, clinic, books, Alef, password/email/LMS contacts
- Official Grade 5–12 Telegram and WhatsApp links
- Current official KBZ website

The app does not browse the web and is instructed not to invent school facts.

## Deploy on Vercel (no coding)

1. Create an OpenAI API key in the OpenAI Platform dashboard and make sure API billing/credits are enabled.
2. Create/sign in to your Vercel account.
3. Upload this project folder/ZIP using Vercel's supported project import/deploy flow.
4. In the Vercel project, open **Settings → Environment Variables**.
5. Add:
   - `OPENAI_API_KEY` = your secret OpenAI API key
   - Optional: `OPENAI_MODEL` = `gpt-5-mini`
6. Save the variables and **Redeploy** the project.
7. Open the Vercel URL and test several class and teacher questions before sharing it publicly.

**Security:** Do not prefix the API key with `NEXT_PUBLIC_` or put it in browser code. This project only reads it in the server-side `/api/chat` function.

## Important source behavior

- Class questions use the structured Grade 5–12 class data derived from the supplied class timetable PDFs.
- Teacher questions use the teacher's dedicated timetable page, parsed by fixed visual grid coordinates rather than sequential PDF text.
- A known source conflict for `11/A1 Tuesday P1` and `11/A1 Wednesday P2` is detected because the class and teacher sources disagree on the subject. The assistant reports the conflict rather than reconciling it.
- Sohail Kasasbeh and Sohail Alshamsi are kept as separate teachers, including the approved Arabic alias rules.

## Updating timetables later

This version embeds the current timetable data. When the school publishes a new timetable, rebuild `data/classes.js` and `data/teachers.js` from the new source files before redeploying. Keep the old source files archived so changes can be audited.
