# SION Link Desktop Companion App

Provide a native, lightweight Electron companion app for SION Link. It acts as a dedicated wrapper for SION Link's local network roles (Presenter, Operator, Live Viewer, Stage Display), ensuring users don't need to use a standard web browser or keep track of bookmarks.

## User Review Required

> [!IMPORTANT]
> The app is designed to run on the local network (WiFi) of the venue. The user must ensure that the desktop running SION Link Companion is connected to the same network as the main SION Media operator laptop.

> [!TIP]
> We will implement a global shortcut (e.g., `Esc` or `Ctrl+Shift+D`) to allow the user to easily exit the remote viewer/stage display screen and return to the connection manager screen.

## Open Questions

> [!NOTE]
> None at this stage. The architecture strictly follows the [SION Link Native Companion Spec](file:///d:/my_dev/SION-Media/sion-media-desktop/docs/superpowers/specs/2026-07-10-sion-link-native-companion.md).

---

## Proposed Changes

We will build the project inside the directory `d:/my_dev/SION-Media/sion-link-desktop`. The stack will consist of:
- **Electron**: Wrapper and window manager.
- **TypeScript**: Main process typing and structure.
- **Vanilla CSS & JS**: Renderer process connection manager screen (PWA connection UI), providing lightweight, fast startup and responsive glassmorphism aesthetic.
- **esbuild/typescript**: Simple compiler/transpiler for main process files.

---

### [Component: Project Configuration]

#### [NEW] [package.json](file:///d:/my_dev/SION-Media/sion-link-desktop/package.json)
Initialize the project, declare electron dependencies, and scripts for running and building using `electron-builder`.

#### [NEW] [tsconfig.json](file:///d:/my_dev/SION-Media/sion-link-desktop/tsconfig.json)
TypeScript compiler configuration for the main process code.

---

### [Component: Electron Main Process]

#### [NEW] [main.ts](file:///d:/my_dev/SION-Media/sion-link-desktop/src/main.ts)
Core Electron main process:
- Creates the window.
- Exposes IPC handlers for:
  - Validating connection inputs via `fetch` to `http://<ip>:<port>/api/session?code=<code>`.
  - Storing connection settings in a local `config.json` inside the user data directory.
  - Loading the remote SION Link web interface URL upon successful validation.
- Implements a keyboard shortcut listener (`Esc` or `Ctrl+Shift+D`) to revert back to the connection setup page.

#### [NEW] [preload.ts](file:///d:/my_dev/SION-Media/sion-link-desktop/src/preload.ts)
Preload script to safely bridge connection management APIs from the main process to the renderer process.

---

### [Component: Connection Manager UI]

#### [NEW] [index.html](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/index.html)
The HTML layout for the connection screen, using modern semantic elements.

#### [NEW] [style.css](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/style.css)
Premium CSS styling for the connection interface:
- Sleek dark theme matching SION Media aesthetics.
- Glassmorphism design elements (blurred backgrounds, subtle borders).
- Interactive animations and clear typography (using Google Fonts Poppins/Inter).
- Fully responsive layout for different monitor sizes.

#### [NEW] [renderer.js](file:///d:/my_dev/SION-Media/sion-link-desktop/src/renderer/renderer.js)
The JS logic for the connection form:
- Validates inputs locally before sending.
- Triggers IPC validation commands.
- Handles UI states (connecting, showing error messages, auto-connecting from saved configurations).

---

## Verification Plan

### Automated Tests
- Since it is a wrapper app, we will verify by compiling and checking TypeScript type correctness:
  ```powershell
  npm run build
  ```

### Manual Verification
1. Run the companion app in development mode:
   ```powershell
   npm run dev
   ```
2. Verify the visual design of the connection manager:
   - Check input validations (empty fields, invalid IP format).
   - Check "Remember this device" behavior.
3. Simulate connecting to SION Link:
   - Run the main SION Media app to start the SION Link local server.
   - Enter the server's IP, port, and code.
   - Verify it successfully transitions to the web remote interface.
   - Press the escape key/shortcut and verify it successfully returns to the connection manager screen.
