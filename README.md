# Scout — demo front end

The real Scout app's front end (every screen, the same design) with **no backend
and no data**. Every screen opens in its empty state, ready to fill in with
whatever data a video needs. Nothing here connects to a phone line, a CRM, an AI
model or the internet: buttons "work" and change nothing.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. It reloads by itself as files change.

## Screens

| Screen | URL |
|---|---|
| Chat (home) | `/chat` |
| Campaigns | `/flows` |
| Campaign detail | `/flows/<id>` (says "No such flow" until `route.ts` returns that campaign) |
| Campaign report | `/flows/report` |
| Messaging (texts) | `/inbox` |
| Phone (calls) | `/calls` |
| Monthly report | `/report` |
| Money owed | `/accounts-receivable` |
| Speed to Lead | `/speed-to-lead` |

Settings open from the gear in the side bar. Light and dark mode: the moon/sun
button. For the phone layout, narrow the browser window or use your browser's
device toolbar (about 390 px wide).

## Putting data in

- **Shop name, trade and hours:** `shop.json`.
- **Everything else:** every screen asks the server for its data at `/api/...`,
  and ALL of those requests are answered by one file:
  `src/app/api/[...path]/route.ts`. Each entry in its `EMPTY` list matches a
  path (for example `calls`, `inbox`, `flows`, `report`) and returns that
  screen's data, in the shape the screen already expects. The comments next to
  each entry name the TypeScript type that describes the shape. Return rows
  there instead of empty lists and the screen shows them.
- **Chat:** the chat sends its message to `POST /api/chat`, which streams
  back events like `data: {"delta":"Hello"}` and ends with
  `data: {"done":true}`. Today it ends at once; stream text there to make
  Scout "reply".
- **Speed to Lead** has a built-in sample workspace with scripted leads and a
  "Run lead demo" button. Switch it on by making `speedToLeadDemoEnabled()`
  in `src/lib/speed-to-lead/demo-access.ts` return `true`.

Brand notes (wordmark, colors, mascot) are in `BRANDING.md`.
