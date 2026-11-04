# ZHI Resident PWA · Mobile UI v1

## Product surface
- Existing resident conversation entry: `web/zhi-resident.html`
- Existing authenticated chat client remains `web/zhi-resident.js` + `web/zhi-universe-client.js`.
- The page remains a human-to-resident private chat surface. It is not an agent-to-agent chat UI or a public memory browser.

## Mobile-first interface
- Dark cosmic / neural-link visual language with glass panels, cyan-violet-gold accents, readable contrast and restrained animation.
- Small-screen single-column layout, touch-sized controls, safe-area padding, dynamic viewport sizing and soft-keyboard-friendly composer.
- Resident selector, sync action, private-channel status and message history remain connected to the existing API.
- Token storage remains in tab-scoped `sessionStorage`; no token is added to the manifest, service worker or cache.

## PWA
- Manifest: `web/zhi-resident.webmanifest`
- Service worker: `web/zhi-resident-sw.js`
- Icon: `web/zhi-resident-icon.svg`
- Standalone display, portrait orientation, relative start URL/scope for GitHub Pages project paths.
- Offline support is deliberately limited to the static app shell. The service worker never caches Supabase REST, Auth, Edge Function, or cross-origin requests. Private messages and tokens remain network-only.
- GitHub Pages workflow copies and validates the manifest, worker and icon.

## Acceptance
- [ ] GitHub Pages workflow passes and publishes all three PWA assets.
- [ ] HTTPS site exposes a valid manifest and service worker scope.
- [ ] Android Chrome offers install prompt; iOS Safari can use Share → Add to Home Screen.
- [ ] Installed app launches in standalone display.
- [ ] At common phone widths, chat remains single-column; composer and buttons remain reachable with the keyboard open.
- [ ] Existing token login, refresh, resident list, history and send-message behavior remain functional.
- [ ] Offline launch opens only cached shell; private chat/API data is not shown from cache.
- [ ] Lighthouse PWA/mobile checks and real-device smoke tests pass.

## Deployment boundary
Changes are staged on `feature/mia-02-aurora-event-perception` and PR #7. This does not deploy to GitHub Pages until the change is merged to `main` or the workflow is manually dispatched. No Supabase schema, private data or production token settings are changed by this UI/PWA work.
