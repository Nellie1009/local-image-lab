# tait-crt-interface-skill compact generation prompt

Generate exactly one finished image in a retro early-computer CRT interface style.

Use the user's uploaded image or text theme as the subject source. Re-author the subject as an adult 1980s bitmap editorial caricature inside a CRT computer-interface composition. Preserve only a few high-information identity anchors from each important subject; do not trace, mask, auto-pixelate, posterize, or imitate photographic details.

Core visual requirements:

- One complete wallpaper-like subject composition behind the interface windows.
- Subject coverage should feel dominant, roughly 50%-80% of the canvas.
- Keep each important person, creature, object, or group member distinct; do not omit, merge, duplicate, or swap identities.
- Redesign subjects with exaggerated flat geometric masses, angular silhouettes, blunt polygonal forms, low-facet anatomy, asymmetry, and a slightly strange editorial personality.
- Use one shared square pixel lattice for subject, windows, icons, borders, cursor, and bitmap text. Avoid mixed pixel sizes, antialiasing, smooth curves, gradients, or soft vector edges.
- Use 3-6 foreground windows with square borders, title bars, close boxes, scroll tracks, primitive tables/charts/settings panels, one menu/drop-down, and exactly one cursor.
- Include 1-3 small feature-extraction windows showing partial distinctive details only, never a whole duplicate subject.
- Apply dense CRT scanlines, restrained noise, palette-bound bloom, slight color misregistration, persistence, one subtle sync disturbance, and obvious barrel-curved CRT edge distortion.
- The outer 10% of the frame should visibly bend/compress like a CRT screen; keep the center stable.
- Reserve the upper-right title-bar zone for the exact lowercase signature `tait-crt-interface-skill`. It must be readable, not translated, hidden, cropped, or altered.

Palette and ratio adaptation for this local image generator:

- Do not ask follow-up questions.
- If the user gives a palette name or colors, use them.
- If no palette is given, derive a coherent 2-5 color palette from the uploaded image or prompt theme.
- If the user gives one of these palette names, honor it: 经典, 粉黛, 极客01, 极客02, 复古01, 复古02, 游戏01, 游戏02, 如图.
- If no aspect ratio is described in text, follow the current image-generation request size/aspect ratio.
- If the user mentions 街头怪诞, 巨像符号, or 冷面几何, treat it as an explicit style preset; otherwise do not mention presets.

Hard avoids:

- No realistic portrait rendering, clean vector illustration, modern glass UI, game HUD, cute mascot, anime/chibi, children's-book style, generic clip art, or polished game sprite.
- No copied clothing construction, tiny jewelry inventory, fabric folds, skin pores, facial modeling, or local photographic contours unless they are essential identity anchors.
- No checkerboard texture on faces, necks, ears, hands, arms, legs, or exposed skin.
- No extra text, prompt explanation, recipe list, checklist, variants, or commentary.

Return only one final image.
