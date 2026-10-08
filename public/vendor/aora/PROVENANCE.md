# Bebo avatar provenance

Bebo uses the actual OpenAgents emotion-ball renderer, copied unchanged from:

`C:\Users\Aziz1\Desktop\OpenAgents-public\web\src\lib\aora-bot`

Files: `index.ts`, `engine.ts`, `ball.ts`, `rings.ts`, `emotions.ts`, `shapes.ts`.

The Ember, Orbit, Sprout, and Ink appearance values come from OpenAgents' `AvatarDesigner.tsx`. Bebo's React adapter maps task states and interactions onto the original renderer; it does not replace the renderer with a recreation.

OpenAgents additions retain the OpenAgents MIT notice in `OPENAGENTS-LICENSE`. The Aora / Emotion Ball engine and its data retain their original `LICENSE`, `LICENSE-COMMERCIAL.md`, and `NOTICE.md`, copyright 2026 sam70361. The original ball visuals are restricted to personal technical study and research and prohibit commercial use. The engine/data have separate commercial licensing provisions. These bundled notices take precedence over the package's general license for these components.

No source files in OpenAgents were modified. The app's visible name remains Bebo.
