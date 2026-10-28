# Event media guide

Attach your own video, image/GIF or audio to game events. When the event pops up, the clip plays in the popup, for every player (online games share one event log, so everyone sees the same clip). Events without media keep the normal text popup.

## How to add a clip
1. Copy the file into `public/media/events/` (file names: letters, digits, `.`, `_`, `-`).
2. Add an entry to `src/app/eventMedia.json` under `"events"`:

```json
{
  "events": {
    "space:income-tax": {
      "video": "/media/events/income-tax.mp4",
      "caption": "The taxman cometh.",
      "maxSeconds": 10
    },
    "type:tax": { "image": "/media/events/tax.gif" },
    "card": { "audio": "/media/events/card.mp3" }
  }
}
```
3. Rebuild/redeploy. No code changes are needed.

Each entry may have `video`, `image` (also a poster for a video), `audio`, `caption` (shown under the clip and read by screen readers; max 200 characters) and `maxSeconds` (longest the popup stays open; default 20 for video, 5 otherwise; hard cap 60). A video closes the popup when it ends. The player can always press DISMISS.

## Which key plays when
The most specific key wins: exact key, then the fallback.

| Key | When |
|---|---|
| `space:<id>` | A player lands on that space (ids below). Falls back to `type:<type>`. |
| `type:tax`, `type:chance`, `type:community`, `type:go-to-jail`, `type:jail`, `type:free-parking`, `type:property`, `type:railroad`, `type:utility`, `type:go` | Any space of that kind. |
| `card:<CARD-ID>` | A card is drawn (ids below). Falls back to `card` for any card. |
| `pass-go` | A player passes Shurur Line (Go). |
| `buy` | A player buys a property. |
| `build` | A player builds a house or hotel. |
| `bankrupt` | A player goes bankrupt. |
| `forfeit` | A player leaves or is timed out of an online game. |
| `game-over` | The game ends. |

Space ids: `go`, `income-tax`, `luxury-tax`, `jail`, `go-to-jail`, `free-parking`, `chance-1` to `chance-3`, `cc-1` to `cc-3`, `rail-1` to `rail-4`, `electric`, `water`, and the property ids (`old-dhaka`, `lalbagh`, `sadarghat`, `buriganga`, `shakhari`, `gazipur`, `munshiganj`, `tongi`, `rajshahi`, `bogura`, `pabna`, `khulna`, `jashore`, `kushtia`, `sylhet`, `moulvibazar`, `habiganj`, `chattogram`, `cumilla`, `cox-bazar`, `gaibandha`, `dhaka-heights`).

Card ids: `CC-01`..`CC-16` (Community) and `CH-01`..`CH-16` (Chance); titles are in `docs/CARD_CATALOG.md`.

## Format and size advice
- Video: MP4 (H.264 + AAC) or WebM, 480p–720p, under about 3 MB and 10 seconds. Videos play inline; sound follows the game's SOUND toggle.
- Image/GIF: PNG, JPEG, WebP or GIF, under 1 MB.
- Audio: MP3, M4A or OGG, under 500 KB. Audio only plays when sound is on.
- Everything is downloaded by players when the event first shows, so small files keep the game fast. Browsers may block sound until the player has clicked something; the clip then plays silently instead of not at all.
- A missing or broken file is skipped and the text popup is shown.
- Only use clips you own or are licensed to use. The game is fictional satire; avoid real people's likenesses and trademarked footage.

## Safety and accessibility
- Only paths starting with `/media/events/` are accepted; other sites and `..` are ignored.
- With "reduce motion" turned on in the system, videos do not autoplay and show controls instead.
- The caption is the accessible description; add one to every clip.

Code: lookup in `src/app/eventMedia.ts`, player in `src/app/EventMediaView.tsx`, event keys set in `src/game/engine.ts` (RD-134).
