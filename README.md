# SillyTavern Review Plus

Review Plus is a SillyTavern extension that adds a **Review last reply** workflow for roleplay continuity fixes.

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

1. Download or clone this repository.
2. Copy the folder into your SillyTavern extensions directory:

```text
SillyTavern/public/scripts/extensions/review-plus
```

3. Restart SillyTavern or hard-refresh your browser.
4. Open the extensions panel and look for **Review Plus**.

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

This extension was developed against a local SillyTavern install. Core files:

- `manifest.json`
- `index.js`
- `review-core.js`
- `style.css`

Focused tests live in the original SillyTavern workspace under:

```text
tests/frontend/review-plus-core.test.js
```

## License

MIT
