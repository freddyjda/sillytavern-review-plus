# SillyTavern Review Plus

Review Plus is a third-party SillyTavern extension that adds a **Review last reply** workflow for roleplay continuity fixes.

Instead of doing a normal regenerate, Review Plus asks an isolated factual reviewer to inspect the last AI reply, identify evidence-backed continuity problems, and create a corrected replacement as a new active swipe.

## Features

- Adds a **Review last reply** button.
- Always opens a popup for optional critique.
- Blank critique triggers automatic review.
- Creates a corrected reply as a new active swipe instead of deleting the original.
- Supports configurable scene context:
  - Last X messages
  - Full history
- Includes character card and user persona context in the review prompt.
- Uses evidence-based issue categories, including:
  - invented facts
  - ignored user actions/dialogue
  - forgotten context
  - out-of-character behavior
  - unjustified escalation
  - relational/spatial logic errors
- Stores the reviewer analysis as visible reasoning metadata when SillyTavern displays it.

## Installation

Install it from inside SillyTavern as a third-party extension:

1. Open SillyTavern.
2. Go to **Extensions**.
3. Click **Install extension** / **Import extension**.
4. Paste this Git URL:

```text
https://github.com/freddyjda/sillytavern-review-plus
```

5. Confirm the install.
6. Restart SillyTavern or hard-refresh the browser.
7. Enable **Review Plus** if it is not already enabled.

SillyTavern will clone this repository into its third-party extensions folder automatically. You do **not** need to copy files into the SillyTavern repo by hand.

## Updating

Use SillyTavern's extension update button/menu. The manifest includes `auto_update: true`.

## Usage

1. Generate a normal AI reply.
2. If the reply contradicts the scene, adds random drama, or breaks character logic, click **Review last reply**.
3. Enter an optional critique, or leave it blank for automatic review.
4. Review Plus generates a corrected swipe and activates it.
5. The original reply remains available as an earlier swipe.

## Notes

Review Plus is not meant to replace a good model or preset. It is a focused repair tool for moments where the narrator drifts away from the actual scene.

The reviewer is intentionally instructed to prioritize concrete scene evidence over prose taste, trope criticism, or moral/aesthetic commentary.

## Development

Core files:

- `manifest.json`
- `index.js`
- `review-core.js`
- `style.css`

Focused tests live in the original SillyTavern development workspace under:

```text
tests/frontend/review-plus-core.test.js
```

## License

MIT
