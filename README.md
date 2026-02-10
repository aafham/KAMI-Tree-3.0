# KAMI Tree 3.0

## Family Generation View (Refactor)

This prototype introduces a dual-mode architecture:

- Focus Mode (default): centered person with parents, spouses, and children. Only 1-2 levels are shown by default with expansion controls.
- Full Tree Mode: vertical descendant layout with lazy branch expansion and generation controls.

Key components:

- `app.js`: View state, data layer, focus rendering, full tree rendering, pan/zoom, search jump + highlight.
- `styles.css`: Compact toolbar, responsive focus layout, drawer/bottom sheet styles, and legend.
- `data.json`: Sample dataset. Replace with your real family data structure.

Performance notes:

- Full tree only renders expanded branches.
- Focus mode limits children to 4 with a "+X more" action.
- Pan/zoom is throttled.

Usage:

Open `index.html` in a browser.
