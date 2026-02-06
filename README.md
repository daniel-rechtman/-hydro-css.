# Phone Dialer - Base44 Chrome Extension

A Chrome extension that detects phone numbers on any webpage and lets you dial them through your phone. Powered by [Base44](https://base44.com) backend.

## Features

- Automatic phone number detection on any webpage
- Click-to-call: click any detected number to dial it
- Right-click context menu: select a phone number and dial via right-click
- Quick dial from the extension popup
- Call history log
- Twilio bridge support for server-initiated calls
- Hebrew RTL interface
- Supports Israeli (+972) and international phone formats

## Project Structure

```
base44/                      # Base44 Backend
  config.jsonc               # Project configuration
  entities/
    PhoneConfig.jsonc         # User's phone configuration entity
    CallLog.jsonc             # Call history log entity
  functions/
    initiate-call/
      function.jsonc          # Function config
      index.ts                # Call initiation logic (Twilio bridge)

extension/                   # Chrome Extension
  manifest.json              # Extension manifest (MV3)
  popup.html                 # Extension popup UI
  popup.css                  # Popup styles
  popup.js                   # Popup logic
  content.js                 # Content script - phone number detection
  content.css                # Content script styles
  background.js              # Service worker - call handling
  base44-client.js           # Base44 API client for extensions
  icons/                     # Extension icons
```

## Setup

### 1. Base44 Backend

```bash
# Install Base44 CLI
npm install -g base44

# Login to Base44
base44 login

# Link or create project
base44 create
# OR link to existing project:
base44 link

# Deploy entities and functions
base44 deploy
```

### 2. Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder
5. The Phone Dialer icon will appear in your toolbar

### 3. Configuration

1. Click the extension icon
2. Log in with your Base44 credentials
3. Enter your phone number (E.164 format, e.g. `+972501234567`)
4. Save your configuration

### Optional: Twilio Bridge

For server-initiated calls (your phone rings, then connects to the target):

1. Create a [Twilio](https://twilio.com) account
2. Add these environment variables to your Base44 project:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
3. Enable the "Twilio dial" toggle in the extension settings

## How It Works

1. **Content Script** scans every webpage for phone number patterns
2. Detected numbers are highlighted with a green underline
3. Clicking a number sends a request to the **Base44 backend function**
4. The function logs the call and either:
   - Returns a `tel:` URI for direct dialing (default)
   - Initiates a Twilio bridge call (if configured)
5. All calls are saved to the **CallLog** entity for history

## License

MIT
