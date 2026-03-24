# Timmy Shared Components

This folder contains all reusable UI components and utilities used across the Timmy application.

**IMPORTANT:** This is the single source of truth. DO NOT duplicate these components in other files.

---

## 📁 Files

- **shared-components.css** - All reusable CSS components
- **utils.js** - All reusable JavaScript utilities
- **README.md** - This documentation

---

## 🎨 CSS Components

### Window Header

**Classes:** `.window-header`, `.window-header-row`, `.window-header-title`, `.window-header-spacer`

**Usage:**
```html
<div class="window-header">
    <div class="window-header-row">
        <div class="window-header-title">WINDOW TITLE</div>
        <div class="window-header-spacer"></div>
        <div class="window-close-icon" id="close-btn">
            <img src="images/Close.svg" alt="Close">
        </div>
    </div>
</div>
```

**Used in:** audio-settings.html, index.html

---

### Close Icon

**Classes:** `.window-close-icon`

**Usage:**
```html
<div class="window-close-icon" id="close-btn">
    <img src="images/Close.svg" alt="Close">
</div>
```

**Features:**
- Hover effect with green icon tint
- 40px × 40px click target
- Border on left side

---

### Section Container

**Classes:** `.section`, `.section-header`

**Usage:**
```html
<div class="section">
    <div class="section-header">SECTION TITLE</div>
    <!-- Section content -->
</div>
```

**Used in:** audio-settings.html

---

### Setting Row

**Classes:** `.setting-row`

**Usage:**
```html
<div class="setting-row">
    <label for="setting-id">Setting Label</label>
    <input type="..." id="setting-id">
</div>
```

**Features:**
- Flexbox layout (space-between)
- Bottom border (except last-child)
- 12px vertical padding

**Used in:** audio-settings.html

---

### Toggle Switch

**Classes:** `.settings-toggle`, `.settings-slider`

**Usage:**
```html
<label class="settings-toggle">
    <input type="checkbox" id="my-toggle">
    <span class="settings-slider"></span>
</label>
```

**Features:**
- White background (always)
- OFF: Light purple button (#E6E5EE)
- ON: Gray button (#7D7D7D)
- Smooth transition

**Used in:** index.html, audio-settings.html

---

### Folder Button

**Classes:** `.folder-btn`

**Usage:**
```html
<button class="folder-btn">Open Folder</button>
```

**Features:**
- Secondary style (gray background)
- Hover effect
- 11px font size

**Used in:** index.html, audio-settings.html

---

### Primary Action Button

**Classes:** `.action-btn-primary`

**Usage:**
```html
<button class="action-btn-primary">Save</button>
```

**Features:**
- Accent color background (lime yellow)
- Hover effect
- 12px bold font

---

### Window Footer

**Classes:** `.window-footer`

**Usage:**
```html
<div class="window-footer">
    <button class="action-btn-primary">Save</button>
</div>
```

**Features:**
- Top border
- Right-aligned content
- 16px padding

**Used in:** audio-settings.html

---

### Form Components

**Select Input**

**Classes:** `.select-input`

```html
<select class="select-input">
    <option>Option 1</option>
</select>
```

**Range Input**

**Classes:** `.range-input`

```html
<input type="range" class="range-input" min="0" max="100">
```

---

## 🔧 JavaScript Utilities

All utilities are exported functions from `utils.js`. Import them using ES6 modules:

```javascript
import { formatTime, loadAppData, saveAppData } from './components/utils.js';
```

---

### formatTime(seconds)

Converts seconds to human-readable format.

**Parameters:**
- `seconds` (number) - Time in seconds

**Returns:** (string) Formatted time (e.g., "2h 30m", "45m", "30s")

**Example:**
```javascript
import { formatTime } from './components/utils.js';

const formatted = formatTime(3661); // "1h 1m"
const formatted2 = formatTime(45); // "45s"
const formatted3 = formatTime(7200); // "2h"
```

**Used in:** frontend.js, report.js

---

### formatDate(date)

Formats Date object to YYYY-MM-DD string.

**Parameters:**
- `date` (Date) - JavaScript Date object

**Returns:** (string) Formatted date (e.g., "2026-01-22")

**Example:**
```javascript
import { formatDate } from './components/utils.js';

const today = formatDate(new Date()); // "2026-01-22"
```

---

### loadAppData()

Loads data from main process via IPC.

**Returns:** (Promise<Object>) App data from projects.json

**Example:**
```javascript
import { loadAppData } from './components/utils.js';

const data = await loadAppData();
console.log(data.clients);
```

**Used in:** frontend.js, calendar.js, report.js

---

### saveAppData(data)

Saves data to main process via IPC.

**Parameters:**
- `data` (Object) - Complete app data to save

**Returns:** (Promise<void>)

**Example:**
```javascript
import { saveAppData } from './components/utils.js';

await saveAppData(appData);
```

**Used in:** frontend.js, calendar.js, report.js

---

### deepClone(obj)

Deep clones an object (for state management).

**Parameters:**
- `obj` (Object) - Object to clone

**Returns:** (Object) Cloned object

**Example:**
```javascript
import { deepClone } from './components/utils.js';

const original = { clients: [...] };
const copy = deepClone(original);
copy.clients[0].name = "New Name"; // original unchanged
```

---

### debounce(func, wait)

Debounces function calls.

**Parameters:**
- `func` (Function) - Function to debounce
- `wait` (number) - Wait time in milliseconds

**Returns:** (Function) Debounced function

**Example:**
```javascript
import { debounce } from './components/utils.js';

const saveNotes = debounce(() => {
    // Save logic
}, 500);

textarea.addEventListener('input', saveNotes);
```

**Used in:** frontend.js (notes auto-save)

---

### generateId()

Generates unique ID based on timestamp.

**Returns:** (number) Unique ID

**Example:**
```javascript
import { generateId } from './components/utils.js';

const newClient = {
    id: generateId(),
    name: "Client Name"
};
```

---

## 📋 Including in HTML

All HTML files should include components in this order:

```html
<head>
    <meta charset="UTF-8">
    <title>Timmy - Window Name</title>

    <!-- 1. Design Tokens -->
    <link rel="stylesheet" href="design-tokens.css">

    <!-- 2. Shared Components -->
    <link rel="stylesheet" href="components/shared-components.css">

    <!-- 3. Window-specific styles -->
    <link rel="stylesheet" href="window-specific.css">
</head>
```

---

## 📋 Importing in JavaScript

All JavaScript files should import from utils.js as ES6 modules:

```html
<script type="module">
    import { formatTime, loadAppData } from './components/utils.js';

    // Your code here
</script>
```

Or in external JS files:

```javascript
import { formatTime, loadAppData, saveAppData } from './components/utils.js';
```

---

## ⚠️ Rules

1. **DO NOT** duplicate components in other files
2. **DO NOT** modify components without updating this documentation
3. **DO** update this README when adding new components
4. **DO** test changes in all windows that use the component

---

## 🧪 Testing

When modifying components, test in all affected windows:

- [ ] Main window (index.html)
- [ ] Audio settings (audio-settings.html)
- [ ] Calendar (calendar.html)
- [ ] Report (report.html)

---

**Last Updated:** 2026-01-22
