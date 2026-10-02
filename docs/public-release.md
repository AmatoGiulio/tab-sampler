# Public release posture

## Naming

`Tab Sampler` is already used by an existing Chrome Web Store product. Treat it as a repository/development codename only and choose a distinct public product name before creating store assets or publishing.

The project is intentionally structured so the public product can be described as a **tab audio sampler**, not as a site-specific downloader.

## Single purpose

Recommended store description:

> Capture audio that is currently playing in the active tab, trim and loop the captured sample locally, then export it as WAV.

Keep the public description, screenshots, onboarding, and permission explanations aligned with that purpose.

## Permission justification

### `tabCapture`

Required only after the user clicks the toolbar action. It provides the active tab audio stream that the sampler records.

### `offscreen`

Required because the recorder must remain alive while the user returns to the page and the popup is closed. The offscreen document owns the Web Audio graph and local PCM persistence.

### `activeTab` + `scripting`

Required to draw the recorder island and the editor over the page the user clicked the action on. `scripting.executeScript` injects one self-contained function that builds that interface in a shadow root; it reads nothing from the page. `activeTab` scopes this to the tab the user invoked the extension on, so no host permissions are requested.

### Web-accessible `editor.html`

The editor is an extension page shown in an iframe inside the injected interface, which requires it to be web accessible. Consequences to state honestly in review: any page can detect that the extension is installed by probing that URL, and any page can embed the editor. An embedding page cannot read the sample (it is cross-origin extension storage), but this is the reason the editor never exposes data through `postMessage`.

"New capture" restarts recording from inside the editor. That is not a toolbar click, so it passes `targetTabId`; Chrome honours it only while the tab's `activeTab` grant from the original click still stands, and the extension falls back to requiring a new toolbar click when it does not.

No broad host permissions, declared content scripts, history access, cookies, downloads permission, or site-specific scraping are needed for V1.

## User-data disclosure

The extension handles website/tab audio, so the store listing should clearly disclose that audio is captured only after the explicit toolbar click, processed locally, temporarily stored in extension IndexedDB, and not transmitted to a backend in V1.

Use `PRIVACY.md` as the source of truth for the listing privacy text. If telemetry, cloud sync, crash upload, account features, or a persistent sample library are added later, revisit the disclosure before shipping them.

## Manifest V3 / remote code

Keep all executable application code in the extension bundle. Do not load JavaScript or WebAssembly from a CDN at runtime. External links used for documentation are fine; executable logic is not.

## Positioning

Prefer:

- tab audio sampler
- capture what is currently playing
- local trim / loop / WAV export

Avoid positioning such as:

- YouTube downloader
- SoundCloud downloader
- bypass / rip protected content

The capture layer is intentionally source-agnostic and uses normal browser capture APIs. The project should not add DRM bypasses or source-service extraction logic.

## Pre-release gates

Before a public store submission:

1. Run production build, typecheck, tests, and package generation from a clean checkout with a committed lockfile.
2. Perform real-browser QA on generic HTML5 audio, video, YouTube, and SoundCloud, including tab navigation and unexpected stream termination.
3. Test long captures until IndexedDB/quota behavior is understood and failure UX is graceful.
4. Verify the toolbar icon state after Chrome service-worker suspension/restart.
5. Verify the stop click opens the editor on the minimum supported Chrome version.
6. Test mono/stereo capture, 44.1 kHz and 48 kHz devices, empty/silent recordings, and very short selections.
7. Add accessible names, keyboard behavior, `prefers-reduced-motion`, and contrast QA to the release checklist.
8. Supply a public privacy-policy URL and complete Chrome Web Store data-use disclosures consistently with `PRIVACY.md`.
9. Choose repository licensing before making the source public.
10. Keep screenshots/copy focused on the single flow: click -> listen -> click -> trim -> loop -> export.
