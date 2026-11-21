# Fluent emoji pictures (public/emoji)

Made 21 Nov 2026 from Microsoft's open-source Fluent Emoji (MIT): https://github.com/microsoft/fluentui-emoji, style "Color" (what Windows shows).

1. Sparse-clone the repo with `assets/*/metadata.json` and `assets/*/Color/*.svg` (+ `assets/*/Default/Color/*.svg`).
2. Pick emoji: every emoji used in `src` and `members.emoji`, plus the groups Smileys & Emotion, Food & Drink,
   Travel & Places, Animals & Nature, some hands, and the 🇯🇵 🇿🇦 flags (763 in total).
3. Render each SVG to 96×96 px with resvg (`pip install resvg-py`), save as WebP (quality 82) named by codepoints
   without FE0F joined by `_` (e.g. `1f35c.webp`, `1f469_200d_1f373.webp`).
4. Regenerate `src/emoji/available.ts` from the file names.

Emoji not in the set fall back to the phone's own emoji automatically.
