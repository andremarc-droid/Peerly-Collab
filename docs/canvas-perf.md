# Learning Canvas Whiteboard Performance Report

## Overview
This document records the mobile and WebView performance investigations, profiling protocol, before-and-after benchmarks, and optimizations for the Learning Canvas (`@xyflow/react`) on Android devices (Capacitor WebView).

---

## Remote WebView Profiling Guide (`chrome://inspect`)

To capture real DevTools Performance profiles of the Android Capacitor app:

### 1. Prerequisites
- Android device running Developer Mode with **USB Debugging** enabled.
- Connect device to host PC via USB (`adb devices` confirms authorized device).
- Install debug APK (`./gradlew assembleDebug` or GitHub Actions debug artifact).

### 2. Connect Chrome DevTools to the WebView
1. On the Android device, launch **Peerly Collab** and navigate to any Learning Canvas board (or append `?seed=150`).
2. On host computer Chrome, navigate to `chrome://inspect/#devices`.
3. Locate **com.peerly.collab** (or target WebView page title) and click **inspect**.
4. A dedicated DevTools window will open targeting the live Android WebView.

### 3. Record Performance Profiles
1. Switch to the **Performance** tab.
2. In capture settings (gear icon):
   - Enable **Screenshots**.
   - Optional: Select **4x CPU slowdown** to simulate lower-end Android hardware.
3. Click **Record** (circle icon).
4. Perform continuous test gestures on the device screen for ~10 seconds per test:
   - **Test 1: Single Card Drag**: Select and continuously drag a card back and forth across the board.
   - **Test 2: One-Finger Pan**: Drag empty canvas space with one finger to pan around.
   - **Test 3: Pinch-to-Zoom**: Pinch in and out repeatedly across the canvas.
5. Click **Stop** and wait for trace processing.

### 4. Metrics to Record
- **FPS (Frame Rate)**: Main thread frame intervals and dropped frames (target: 55-60 FPS).
- **Long Tasks**: Count of tasks exceeding 50 ms (marked with red corners in Main timeline).
- **Time Breakdown**:
  - **Scripting** (JavaScript execution, React rendering, DOM reconciliation).
  - **Rendering** (Style recalculation, layout, reflow).
  - **Painting** (Rasterization, compositing, GPU upload).

---

## Synthetic Benchmark Boards (`dev/seedBoard.ts`)
To profile reproducibly without network or Firestore mutation variability, append `?seed=<count>` to the URL or use the Dev Benchmark banner:
- `?seed=50`: 50 cards (45 markdown text cards, 5 SVG diagrams), ~75 bezier edges.
- `?seed=150`: 150 cards (142 markdown text cards, 8 SVG diagrams), ~225 bezier edges.
- `?seed=400`: 400 cards (390 markdown text cards, 10 SVG diagrams), ~600 bezier edges.

*Note: In seeded mode, Firestore autosave and remote snapshots are bypassed to ensure zero impact on real data.*

---

## Benchmark Results (150-Card Board on Mid-Range Android) - NOT MEASURED - placeholder

> [!NOTE]
> **NOT MEASURED - placeholder (awaiting real device traces)**
> Real device traces via `chrome://inspect` have not been captured yet. Do not use estimated numbers. The table below outlines target acceptance thresholds for the 150-card seeded board on mid-range Android devices under WebView profiling.

| Gesture / Phase | Target FPS | Target Max Long Tasks (>50ms) | Target Scripting | Target Rendering | Target Painting |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Single Card Drag** | 50–60 FPS | <= 2 tasks | < 30% | < 15% | < 10% |
| **One-Finger Pan** | 55–60 FPS | 0 tasks | < 20% | < 10% | < 5% |
| **Pinch-to-Zoom** | 50–60 FPS | <= 3 tasks | < 25% | < 15% | < 10% |

---

## Detailed Optimizations & Contributions

### A. Touch Gestures & Pan vs Selection
- **Problem**: Default ReactFlow `selectionOnDrag={!readOnly}` with `panOnDrag={[1,2]}` interpreted single-finger touch drag on empty space as drawing a selection marquee, triggering per-move collision detection against every node and blocking one-finger pan.
- **Fix**: Detected coarse pointer (`pointer: coarse`). On touch, set `panOnDrag={true}` and `selectionOnDrag={false}` by default, enabling natural one-finger panning. Added an accessible toolbar "Select" mode toggle so multi-select marquee can still be explicitly toggled on touch devices.

### B. Markdown Re-parsing on Drag Frames
- **Problem**: During card drag, ReactFlow updates node coordinate props on every frame. `TextCard` re-rendered every frame, causing `react-markdown` to re-parse the AST on every frame even when content was unchanged.
- **Fix**: Hoisted `ALLOWED_ELEMENTS` and `components` object to module scope in `SafeMarkdownChunk.tsx` and wrapped the default export in `React.memo`. When `content` does not change, AST parsing and component allocation are completely skipped.

### C. Per-Frame Derived State
- **Problem**: `currentDomain = flowToDomain(nodes, edges)` was recomputed on every drag frame, performing node clamping and edge sanitization over all items. Group dragging executed `nodes.map + containedNodes.find` per frame ($O(N \cdot M)$).
- **Fix**: Restricted `currentDomain` computation to only when `isOutlineOpen` or `isConnectDialogOpen` is active (using `EMPTY_SNAPSHOT` otherwise). Changed group drag lookup to `Map<string, { initialX, initialY }>` ($O(1)$ lookup per node, $O(N)$ total). Empty search queries bypass node filtering.

### D. Re-render Scope & Toolbar Memoization
- **Problem**: `LearningCanvasToolbar`, dialogs, and parent controls were unmemoized and received inline lambda props, re-rendering entirely during every node drag frame.
- **Fix**: Wrapped `LearningCanvasToolbar` in `React.memo`. Converted handlers to stable `useCallback` references. Short-circuited mounting of inactive dialogs.

### E. Level of Detail (LOD) & Handle Measurement Lifecycle
- **Problem**: When zooming out to inspect the whole board, cards rendered full Markdown, handles, floating toolbars, and shadows. However, unmounting `<CardHandles />` in `TextCard` at `zoom < 0.5` broke edge rendering when combined with `onlyRenderVisibleElements`.
- **Root Cause in `@xyflow/system` & `@xyflow/react`**:
  - `getHandleBounds` (`@xyflow/system` line 939) queries `.source` / `.target` handle elements on the node DOM element and stores their bounding boxes in `node.internals.handleBounds` only when `updateNodeInternals` (line 1866) runs via `ResizeObserver` (`useNodeObserver` in `@xyflow/react` line 2180).
  - If a culled `TextCard` remounted while `zoom < 0.5` and `<CardHandles />` was unmounted, `getHandleBounds` returned `null` (`handleBounds = { source: null, target: null }`). When zooming back in, mounting absolute-positioned `.canvas-handle` elements did not change the card's `offsetWidth`/`offsetHeight`, so `ResizeObserver` did not fire, `getEdgePosition` (line 1434) failed with error `008` (`Couldn't create edge for source/target handle`), and edges connected to `TextCard` vanished.
  - Furthermore, in `adoptUserNodes` / `parseHandles` (`@xyflow/system` lines 1639–1705), replacing `userNode` objects with freshly constructed `domainToFlowNode` objects (which have `userNode.measured === undefined`) resets `internalNode.measured` to `{ width: undefined, height: undefined }` and `internalNode.internals.handleBounds` to `undefined`.
- **Fix**:
  1. `TextCard` always mounts `<CardHandles />` in the DOM and applies `.learning-card--lod` when `zoom < 0.5` and unselected, hiding handles with `visibility: hidden; opacity: 0` (never `display: none`) so `getBoundingClientRect()` remains non-zero.
  2. `LearningCanvas` invokes `useUpdateNodeInternals()` inside `requestAnimationFrame` for all affected node IDs after `applySnapshot` (remote merge, undo/redo, import, reload) and whenever crossing the `0.5` LOD zoom threshold.
- **Manual Regression Checklist (LOD + Culling + Edges)**:
  1. Open a Learning Canvas board containing an **Image card** connected to a **Text card** via an edge.
  2. Deselect all cards and zoom out below **50%** (zoom < 0.5) so the Text card enters low-detail mode (.learning-card--lod).
  3. Pan the board until both cards are completely off-screen (onlyRenderVisibleElements culls their DOM nodes), then pan back so they remount while still at < 50% zoom.
  4. Zoom back to **100%** (zoom = 1.0).
  5. **Expected**: All edge paths, arrowheads, and labels connecting Image cards and Text cards remain visible and attached to the card handles, with zero [ReactFlow 008] warnings in the console.

### F. Cursor Publishing & Remote Cursors Layer
- **Problem**: `onPointerMove` without throttling and touch event handlers called `screenToFlowPosition`, which invokes `getBoundingClientRect()` (triggering forced synchronous layout). In addition, remote cursor ticks re-rendered the board.
- **Fix**: Removed touch move cursor publishing. Sampled pointer moves with minimum 100ms interval before measuring layout. Isolated remote cursor rendering into a memoized `RemoteCursorsLayer` inside `ViewportPortal`.

### G. Handle Visibility on Coarse Pointers
- **Problem**: `@media (pointer: coarse)` in `canvas.css` forced all `.canvas-handle` elements to `opacity: 0.75` with 28px box-shadowed circles, forcing the GPU to composite 600+ pseudo-elements on a 150-card board.
- **Fix**: On coarse pointers, handles remain hidden until a card is selected (`.react-flow__node.selected .canvas-handle`), while retaining 44px accessible touch targets.

### H. Edge Label Renderer Portal Optimization
- **Problem**: `LearningCanvasEdge` mounted an `<EdgeLabelRenderer>` portal div (`nodrag nopan z-30`) for every edge, even edges without labels or selection.
- **Fix**: Render `<EdgeLabelRenderer>` conditionally only when an edge has a label, is selected and editable, or is currently being edited.

### I. Node Culling (`onlyRenderVisibleElements`) & Accessibility
- **Problem**: Cards and edges off-screen were kept in the DOM. Disabling `onlyRenderVisibleElements` while editing a card on a 150-card seeded board caused an immediate mount burst of ~144 off-screen cards (~576 handle nodes + Markdown chunks) on double-click and a matching unmount burst on Save/Cancel.
- **Fix**:
  1. Enabled `onlyRenderVisibleElements` in `<ReactFlow>`, gated by `cullElements = import.meta.env.MODE !== 'test'` (overridable via `cullElements` prop). Culling stays enabled even during inline editing so starting an edit on a 150-card board mounts 0 additional off-screen cards; if an actively edited `TextCard` is panned off-screen and back, `unsavedTextDrafts` restores its draft and re-fires `onEditingChange(id, true)` on remount.
  2. Declared explicit `width` and `height` on each React Flow `Node` in `domainToFlowNode` (in addition to `style.width` / `style.height`) and passed `includeHiddenNodes: true` to `fitView` (`handleJumpToNode`, search `focusMatch`, and keyboard `F`) so React Flow's `getFitViewNodes` can compute bounds and scroll to off-screen or unmeasured cards even while culled from the DOM.
  3. **Accessibility with Culling Enabled**:
     - **Text Outline (`CanvasOutlineView`)**: Reads directly from React state (`currentDomain.nodes` and `currentDomain.edges`), so every card (including `text`, `link`, `reference`, `image`, and `group` cards) and connection is always listed, searchable, connectable, and deletable even when panned off-screen and unmounted from the canvas DOM. Clicking **Jump to card** pans/zooms the viewport to bring the culled card into the DOM and selects it.
     - **Keyboard Shortcuts**: Board-level shortcuts (`Ctrl+A` / `Cmd+A` select all, `ArrowUp`/`Down`/`Left`/`Right` nudge selected cards, `Delete`/`Backspace` delete selected cards, `F` fit view, `/` search, `Ctrl+Z` / `Ctrl+Y` undo/redo) operate on `nodes` state rather than DOM nodes, so they reach off-screen cards seamlessly.
     - **Known DOM Focus Limitation**: Native browser `Tab` focus order only traverses currently mounted DOM nodes inside the viewport. Keyboard and screen-reader users can reach any off-screen card at any time via the **Outline** view or **Search** (`/`).

### J. CSS Rendering Costs & Fixed Menu Positioning
- **Problem**: `.learning-card` had transitions on `box-shadow` and `border-color` that fired during drag frame coordinate updates. Additionally, setting `contain: paint` on `.learning-canvas-wrapper` created a containing block for `position: fixed` descendants, offsetting and clipping `QuickAddMenu`.
- **Fix**: Disabled `.learning-card` transitions during active drag via `.react-flow__node.dragging .learning-card` and `.react-flow--dragging .learning-card`. Removed `contain: paint` from `.learning-canvas-wrapper` (relying on `overflow: hidden` for board clipping) while keeping `QuickAddMenu` rendered inline inside `.learning-canvas-wrapper` / `ExpandableCanvasContainer` so `position: fixed` uses viewport coordinates and remains visible inside the browser Fullscreen API top layer.

---

## Heavy / Design-Level Work (Items K, L, M)

### K. Image Storage & Board Comparison
- **Current Architecture & Bottlenecks**:
  - Image cards store base64 `dataUrl` strings directly in the Firestore board document (`classes/{classId}/learningCanvases/{canvasId}/content/main`).
  - This avoided Storage bucket setup initially, but has two major performance drawbacks on phones:
    1. Firestore document 1MB limit limits boards with multiple photos.
    2. Deep string comparisons during autosave and merge (`sameBoard` / `stable()`) serialize and compare multi-megabyte strings on the main thread.
- **Implemented Optimization (Phase 1)**:
  - Replaced recursive `stable(JSON.stringify)` inside `sameBoard` and `mergeById` with `sameNode` and `sameEdge` fast-path equality.
  - Compares node IDs, coordinates, dimensions, types, text, and fast length + string checks for images without recursive object traversal.
  - Eliminates megabytes of JSON string allocations per autosave tick.
- **Proposed Storage Architecture (Phase 2 & Migration Plan)**:
  1. **Dual-Read Schema**:
     - `LearningCanvasImageNode`: `{ dataUrl?: string; storagePath?: string; downloadUrl?: string; thumbnailDataUrl?: string; alt?: string; caption?: string }`.
     - When `downloadUrl` is present, render via standard `<img>` with `loading="lazy"` and `decoding="async"`.
     - When only `dataUrl` is present (legacy boards), continue rendering base64 seamlessly.
  2. **Storage Paths & Security Rules**:
     - Path: `classes/{classId}/learningCanvases/{canvasId}/images/{nodeId}.jpg`.
     - Storage rule: Read allowed for active class members; write allowed for class owner or canvas editors.
  3. **JSON Canvas Compatibility**:
     - `toJsonCanvas` maps `downloadUrl` to JSON Canvas file/image nodes.
     - `fromJsonCanvas` supports importing local/remote image URLs or embedding them.

### L. Autosave Main-Thread Offloading
- **Observation**:
  - Debounced autosave (2s) runs serialization and diffing. On low-power mobile CPUs, serializing hundreds of nodes can cause frame jank.
- **Implemented Optimizations**:
  1. Guarded autosave run with `requestIdleCallback` (with 1000ms deadline timeout and fallback for test/unsupported environments) so that saves yield to ongoing touch animations.
  2. In `LearningCanvas`, `useAutosave` save handler checks `sameBoard(content, remoteBaseRef.current)` and immediately exits if no persistable changes occurred since the last server commit, skipping network overhead and merge runs entirely.

### M. Release Profile APK Build & Web Remote Debugging
- **Configuration**:
  - Added optional workflow_dispatch input `build_type: [debug, release]` to `.github/workflows/build-apk.yml`.
  - Configured Gradle signing in CI to sign both `debug` and `release` APKs with the identical registered keystore (`$HOME/.android/debug.keystore`), guaranteeing identical SHA-1 certificate fingerprints (preventing Google Sign-In error 10).
  - In `capacitor.config.ts`, set `webContentsDebuggingEnabled: !isRelease` (disabled in release, enabled in debug).
  - Confirmed no hot-path `console.log` statements in canvas source.

