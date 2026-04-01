# Deploy Button for operaxon.com

## HTML to add to operaxon.com hero section:

```html
<!-- Deploy Button -->
<div style="margin: 40px 0; text-align: center;">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fofficialbrandonsandoval-source%2Foperaxon-os&env=ANTHROPIC_API_KEY,TELEGRAM_BOT_TOKEN&envDescription=Optional%20API%20keys%20for%20integrations&envLink=https%3A%2F%2Fdocs.operaxon.com%2Fdeployment&project-name=operaxon-os&repository-name=operaxon-os">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>
</div>
```

Or as a styled button:

```html
<div style="margin: 40px 0; text-align: center;">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fofficialbrandonsandoval-source%2Foperaxon-os&env=ANTHROPIC_API_KEY,TELEGRAM_BOT_TOKEN&envDescription=Optional%20API%20keys%20for%20integrations&envLink=https%3A%2F%2Fdocs.operaxon.com%2Fdeployment&project-name=operaxon-os&repository-name=operaxon-os"
     style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; border-radius: 4px; text-decoration: none; font-weight: bold;">
    Deploy to Vercel →
  </a>
</div>
```

## How it works:

1. User clicks button
2. Redirected to Vercel
3. Asked to sign up / log in
4. Vercel clones the repo
5. Environment variables optional (Anthropic key, bot tokens, etc.)
6. Deploy happens automatically
7. User gets live URL + dashboard

## Environment variables offered:
- `ANTHROPIC_API_KEY` (optional)
- `TELEGRAM_BOT_TOKEN` (optional)
- `DISCORD_BOT_TOKEN` (optional)
- `OPENAI_API_KEY` (optional)

User can leave blank and add later via Vercel dashboard.

## Copy for operaxon.com:

```
START FREE

Deploy Operaxon OS to your own Vercel account in 2 minutes.
No credit card required. Scale when you're ready.

[Deploy to Vercel button]

Questions? Check the docs or email hello@operaxon.com
```

---

## What happens after deploy:

User gets:
- Live instance at `operaxon-<randomname>.vercel.app`
- Full source code
- Dashboard access
- Ability to customize agents
- Docs and support links

Next steps for user:
1. Deploy to Vercel ✓
2. (Optional) Add Telegram/Discord/OpenAI keys via Vercel dashboard
3. (Optional) Connect to your own domain
4. (Optional) Upgrade to managed Operaxon ($997/mo for white-glove support + hosting)
