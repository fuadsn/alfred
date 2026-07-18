# Alfred — Design System: Minimalist Monochrome

## Core principle
Reduction to essence: black, white, typography. No accent colors, no gradients, no shadows, no border radius. Editorial luxury (fashion magazine / gallery catalog), not tech startup. Depth via inversion, border weight, scale contrast, negative space — never elevation.

## Tokens
Colors (absolute, no others ever):
- background #FFFFFF, foreground #000000
- muted #F5F5F5 (subtle bg), mutedForeground #525252 (secondary text)
- accent = #000000, accentForeground #FFFFFF (inversion IS the accent)
- border #000000, borderLight #E5E5E5 (subtle dividers)

Fonts:
- Display/headlines: "Playfair Display", Georgia, serif (tracking-tight/tighter, leading-none)
- Body: "Source Serif 4", Georgia, serif (leading-relaxed)
- Labels/metadata/technical: "JetBrains Mono", monospace (uppercase, tracking-widest)

Type scale: dramatic — hero words at 8xl/9xl desktop (5xl mobile), section titles 4xl-5xl, body lg.

Radius: 0px everywhere, non-negotiable. Shadows: none.

Borders/lines: hairline 1px #E5E5E5 · thin 1px #000 · medium 2px #000 · thick 4px #000 · ultra 8px #000. Thick 4px black rules between major sections.

## Textures (required — prevents flatness; apply as low-opacity overlays)
- Global horizontal lines: repeating-linear-gradient(0deg, transparent, transparent 1px, #000 1px, #000 2px); background-size 100% 4px; opacity 0.015
- Noise (paper feel): SVG feTurbulence data-URI, opacity 0.02
- Inverted (black) sections: vertical white lines repeating-linear-gradient(90deg,...#fff...) opacity 0.03

## Components
Buttons: rectangular. Primary = black bg, white text, px-8 py-4, uppercase JetBrains Mono tracking-widest text-sm, hover inverts (white bg, black text, black 2px border), transition none/100ms max. Secondary = transparent, 2px black border, hover fills black. Consider trailing arrow → on CTAs.
Cards: white bg, 1px black border, p-6/p-8. Inverted card (black bg white text) for emphasis, sparingly. Hover: full inversion, 100ms.
Inputs/textarea: white bg, black border (2px bottom-only or full), no radius, placeholder #525252 italic, focus = border thickens to 4px, no ring.
Icons: outlined, strokeWidth 1.5, black, 20px.

## Interaction
Instant or ≤100ms transitions. Binary states. No bounce, parallax, slow easing. Focus-visible: 3px solid black outline, offset 2-3px (buttons/links); inputs thicken border instead.

## Accessibility
Black-on-white 21:1. All interactive elements get focus-visible treatment. 44px touch targets.

## Non-negotiables for Alfred's UI
1. Oversized serif hero: the word "Alfred" (or the headline) at 8xl/9xl desktop
2. Thick rule + small bordered square as decorative punctuation near hero
3. At least one inverted (black) section/element with subtle white-line texture — e.g. the recording state or results header band
4. 4px black rules separating major sections (input / transcript / results / draft)
5. Labels ("Step 1", counts, language, "live…") in JetBrains Mono uppercase tracking-widest
6. Draft block in JetBrains Mono on muted or inverted ground
7. Hover inversions on cards/buttons; image-free, line-based everything
