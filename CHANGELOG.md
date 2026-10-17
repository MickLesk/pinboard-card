# Changelog

All notable changes to Pinboard are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.2.0] - 2026-10-17

### Added

- Enlarged view: pages that do not fit the card get an enlarge button in the
  footer, a long press opens the same popup unless a hold action is set, and
  `action: expand` is available for any gesture. The popup shows the card at
  full size on the current page, with ticking, editing and paging.

## [1.1.0] - 2026-10-06

### Added

- Editor templates for a shared shopping list, an editable family note and
  a maintenance note. Templates select existing entities and preserve
  existing pages and card settings.
- Localized setup tips for missing or unavailable entities, read-only notes,
  missing note attributes, YAML checklists and entity text length limits.
- An interactive demo editor with simulated form controls and a separate
  live preview instead of JSON-only form dumps.
- README release and validation badges, direct demo and HACS links, and
  practical examples for shared shopping lists, editable notes and a family
  pinboard.
- Installation troubleshooting for resources, writable checklists, note
  editing and microphone access.

### Changed

- The public demo is a responsive showcase with six everyday examples.
  Technical regression fixtures are collapsed and loaded only when opened.
- Repository About now describes the card's main features and links to the
  live demo.
- Manual installation points to the built JavaScript asset in the latest
  GitHub release.

### Fixed

- Demo form styling now lives inside each simulated form's shadow root, so
  labels, full-width controls and help text are properly spaced in the
  editor, including on mobile and in dark mode.
- Picture upload feedback now targets its own status field rather than
  other messages above the picture section.

## [1.0.0] - 2026-10-06

First release from the public GitHub repository. Everything up to 0.2.1 was
developed as "ImageNote" and released through Forgejo. The card type
(`custom:pinboard-card`) and the resource file (`pinboard-card.js`) are
unchanged, so cards that already exist keep working.

### Changed

- The demo page shows three CC0 photographs instead of the generated
  placeholder gradients, and `npm run screenshots` redraws the README
  pictures from it.
- Build and test toolchain: TypeScript 7, Playwright 1.63, Node 24 and
  current actions in CI.

### Fixed

- The README published on GitHub was a two-line stub, which also failed the
  HACS images check. The full one is back.

## [0.2.1] - 2026-09-19

### Fixed

- In the editor's "Display" section the date-and-time picker for "Valid
  until" overlapped the colour fields. It is a date picker on its own row
  now; a time of day can still be set in YAML.

## [0.2.0] - 2026-09-19

### Added

- Conditional pages: `visible` on a page shows it only while an entity has
  (or does not have) a state.
- Per-page `tap_action`, `hold_action` and `double_tap_action`.
- History on notes from entities: the last changes with time and person from
  the logbook, behind a button in the footer.
- To-do items show their details; the pencil next to an item edits title and
  details or deletes it, so lists can hold longer notes.
- Formatting buttons (bold, italic, heading, list, checklist, link) on the
  note box in the editor and on the card, with a live preview in the editor.
- `text_color` per note page, with automatic contrast as the default.
- Dutch, French and Spanish translations.
- The demo page is published to GitHub Pages on every push to `main`.
- The editor's own blocks (picture, markers, note text, audio, import,
  preview) are collapsible sections too, and remember whether you opened them.
- The editor groups page and card settings into sections: picture, note,
  audio, display, visibility, actions; appearance, navigation, notes and
  to-do lists, uploads, actions.

### Changed

- Cards skip all work on state changes that do not touch one of their
  entities, which keeps dashboards with many cards responsive.

## [0.1.1] - 2026-09-18

### Added

- To-do lists as pages: `todo_entity` shows a `todo.*` list as a checklist,
  ticks and new items go to the list through Home Assistant's to-do services.

### Changed

- Checklists in notes from the card configuration are read-only. Ticks used
  to be remembered per browser, which was easy to lose and never shared;
  use a to-do list or an `input_text` note instead.

### Fixed

- Swiping over a card with several pages turned the dashboard view instead of
  the page when a swipe-navigation plugin was installed. Touches on such a
  card now stay inside it; `swipe: false` restores the old behaviour.

## [0.1.0] - 2026-09-18

First release. Pinboard started as "ImageNote"; the card type is
`custom:pinboard-card` and the resource is `pinboard-card.js`.

### Added

- `custom:pinboard-card` — a picture with a note on its back, and up to ten
  pictures, notes and recordings in any order.
- Transitions: 3D flip, crossfade, slide, cube, none; horizontal or vertical.
- Picture from an upload (stored by Home Assistant), a URL, a `/local/` path,
  a `media-source://` id or an `image`, `camera` or `person` entity.
- Notes in Markdown from the card config, or read from an `input_text` / `text`
  entity and edited directly on the card.
- Visual editor with picture upload, live preview and all options.
- Auto flip, hover flip, keyboard support, reduced-motion fallback,
  English and German UI.
- `tap_action`, `hold_action` and `double_tap_action` with the standard
  Home Assistant actions (more-info, toggle, navigate, url, perform-action)
  plus `flip`.
- "Updated … ago" line on the note side when the note comes from an entity.
- Up to ten pictures and notes per card in any order through `slides`
  (`images` still works). Every tap, swipe, arrow, dot or key turns to the
  next one with the chosen animation, in the direction of travel; `auto_flip`
  runs a slideshow. The editor manages them as entries with "+ Picture" and
  "+ Note".
- `layout: grid` shows the entries side by side as tiles inside one card,
  each turning on its own; `columns` fixes the tiles per row.
- Checklists in notes: `- [ ]` lines become checkboxes, written back to
  `input_text` / `text` entities or remembered in the browser.
- Templates in notes are rendered by Home Assistant and update live.
- `expires` per entry with "Until …" in the footer; expired pages are dimmed
  and tagged or hidden (`expired_slides`).
- `color` per note page and a `sticky` note style.
- Audio pages with a player: record in the editor, upload a file, or record
  on the card into an `input_text` (`audio_entity`).
- Markers: numbered or icon pins on a picture with a label, optionally an
  entity state and more-info. Placed by clicking in the editor.
- Camera button on pictures from an `input_text` / `text` entity: takes or
  picks a photo, uploads it and writes the address into the entity.
- `ken_burns` slow zoom on pictures.
- Uploaded and captured pictures are scaled down to `upload_max_size`
  (1920 px by default) before upload.
- Editor: drag-and-drop ordering of entries, import of all pictures in a
  media folder, a live preview with a "Play animation" button, and
  `upload_crop` to crop uploads to the card's aspect ratio.
- Upload target per card: Home Assistant's image store or a folder in
  `/media`.
- Pictures can be reordered in the editor.
- Browser smoke tests with Playwright, run in CI.

### Fixed

- The card overflowed its rows in sections view because it kept its aspect
  ratio instead of filling the height Home Assistant assigned.
- The "Photo" badge and the dots no longer overlap a long note: the note side
  now has a footer, the text scrolls above it behind a fade.
- Small cards (layout editor preview, 4 columns) tighten paddings and shrink
  the badges to icons instead of truncating everything.
