# Privacy

Tab Sampler is designed for local audio processing.

## Data handled by the extension

When the user explicitly starts a capture, Tab Sampler handles the audio currently being played by the active browser tab. The V1 implementation does not store the page URL, page title, browsing history, account identifiers, or source-service metadata with the sample.

Captured audio is processed inside the browser extension. Float32 PCM chunks are temporarily stored in the extension's IndexedDB so recording can continue while no popup is open.

The V1 code does not upload captured audio to a server, send it to an analytics service, sell it, or share it with a third party.

## Retention

A completed sample is kept locally until it is exported or replaced by a new capture. After a successful export, the sample and its stored PCM chunks are deleted from the extension database.

A future persistent sample-library or sync feature would require an explicit product and privacy-policy change before release.

## Network behavior

The V1 extension contains no application backend, telemetry, analytics, advertising SDK, or remote-code loader. Application logic ships inside the extension package.

## Permissions

- `tabCapture`: capture audio from the current tab after the user explicitly clicks the extension action.
- `offscreen`: keep the audio capture graph alive without opening a visible recorder window.
- `activeTab` and `scripting`: after that same click, draw the recorder island and the editor on top of the current page. The injected code only creates that interface; it does not read the page's content, URL, or title.

The extension requests no host permissions and declares no content scripts: nothing runs on a page the user has not clicked the extension on. The editor page is listed as a web-accessible resource so that it can be shown inside the injected interface.

## Chrome Web Store Limited Use

The use of information received from Chrome extension APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements. Data handled by the extension is used only to provide the user-facing capture, trim, loop, and export functionality described by the product.

## User responsibility

Users are responsible for having the rights or permission required to capture, edit, and reuse audio from the source they are playing.
