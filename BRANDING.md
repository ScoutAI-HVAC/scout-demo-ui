# Scout app identity

The approved wordmark is lowercase `scout.` in the existing Fraunces display font.
Only the period is the fixed brand terracotta (#D97756). The sidebar uses the
same wordmark and theme-aware cream/ink surfaces rather than the former solid
orange panel. The collapsed rail and conversation header use the unboxed S and
hanging tool-belt buddy: charcoal S in light mode, cream S in dark mode. The
two transparent marks follow the document's theme without a separate toggle or
client-side theme subscription. The boxed icon is reserved for app installation
and browser identity. Functional
navigation icons and routes remain unchanged.

The layout initializes the selected theme before first paint. Responsive theme
controls follow that one document state, and browser theme colors stay aligned
with manual choices even when navigation replaces the viewport metadata.

Product artwork lives in `public/icons/scout-brand-v1/`:

- `favicon.ico` contains 16, 32 and 48 pixel frames with transparent, rounded corners.
- `favicon-32.png` is the explicit PNG browser alternative.
- `apple-touch-icon-180.png` is square, opaque artwork. iOS supplies its native mask;
  do not bake a second rounded border into it.
- The manifest uses square 192/512 icons and a separate safe-area maskable icon.
- `scout-mark-{ink,cream}-192.webp` are the transparent in-app marks, edited from
  the approved icon with the built-in image editor and downscaled for UI use.
- `scout-buddy-256.webp` is the approved transparent tool-belt mascot, reused by
  login, the new-chat welcome and Settings. It is decorative;
  controls provide their own accessible names.
- `scout-buddy-composer-v2-512.webp` is its dedicated waist-up resting pose, edited
  with the built-in image tool. Its transparent alpha is preserved on export.

Version the asset folder when replacing cached icons. Existing phone installations
may retain their old icon until the owner removes and adds the home-screen shortcut
again. This manifest does not add offline support or cache private CRM data.

## Optional buddy

Settings → Overview → **A little company** controls the companion on this browser.
The buddy starts on; unsolicited tips start off. Hiding it and opting into tips are
independent preferences in `scout-buddy-v1` local storage. Storage restrictions do
not prevent in-session controls. Preferences never update business/voice settings.

The new-chat greeting stays planted and uses an occasional independent arm wave.
The optional companion uses a dedicated waist-up pose: full face, shoulders,
tool belt and one hand resting on the chat composer's straight top edge, clear
of the Send button. Artwork is 64 by 62 pixels on desktop and 58 by 56 pixels on
mobile, inside a fixed 68 by 66 pixel click target; resting fingers
overlap the edge by approximately 4 pixels. No face or torso is cropped away.
It appears only in Chat, not as a floating character on every route. Its compact
help bubble sits above it without changing the composer's geometry.
Each raised arm is a clipped layer of its pose's artwork.
Neither buddy bobs, tilts or drifts. The arm rests while the companion's help card
is open. The button stays fixed and the compact help card does not move. Reduced-motion
users get a stationary pose. This is not a full walking rig. The companion steps aside
for text entry, composer notices, hidden pages, modal dialogs and the expanded mobile
priorities panel. Below 390px, the priorities chip and panel reserve 28px of extra
clearance while the buddy is enabled, so their touch targets never overlap. This
spacing stays fixed while typing temporarily hides the buddy. Its help card is scrollable on short
screens, supports Escape and returns focus to its trigger when explicitly closed.

Tips are a simple invitation to ask in Chat, at most once per visit after opting in. The buddy
does not read CRM data, monitor customers, make model calls, send messages or start
campaigns. **Open Chat** opens the existing Chat route; when already there it focuses
the composer without replacing the current draft or sending anything.
