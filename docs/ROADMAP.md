# MikAI ProdLab - Roadmap globale consolidee

Version consolidee le 14 juillet 2026, mise a jour apres reconciliation avec
le handoff Seedance accepte.

MikAI doit rester un outil de direction creative et de production pour film
d'animation, de la narration au montage et au film final, et non une simple
interface "prompt -> generation".

Pipeline cible:

```text
Pitch -> Story -> Outline -> Sequences -> Shots -> Assets
-> Direction artistique -> Prompts adaptes aux modeles
-> Generations -> Montage -> Film final
```

## Etat actuel

Tickets recemment termines:

- `OPENREEL.INSERT.1` - insertion de shots MikAI dans OpenReel.
- `FILM.RESULT.2` - polish de l'espace Film Result.
- `OPENREEL.TIMING.1` - push explicite de la duree cible de production.
- `OPENREEL.BRIDGE.1` - panneau MikAI Bridge collapsable.
- `FILM.RESULT.3` - polish MVP du Film Result.
- `BASIC.EDITORIAL.2` a `.5` - montage MVP et polish des trims.
- `STORAGE.CLEANUP.1` - audit et nettoyage controle du storage.
- `CREATIVE.1.A` et `PROMPTUX.1` - audit et polish du systeme de prompts.
- `UX.POLISH.2` a `.4` - edition, players et panneau droit.
- `THEME.MIKROS.1` a `.5` - mode Custom, palette, polices et logo.
- `REFROLE.MVP.1` - catalogue partage et harmonisation des roles de references.
- `AI.ASSET.BIBLE.1` - Enhance Asset Bible depuis Description + Notes, avec
  apercu editable et application explicite.
- `THEME.CUSTOM.IMPORT.1` - import JSON, collage JSON, edition des themes et
  textures decoratives optionnelles.
- `PLAYER.AUDIO.1` - audio dans `VideoFrameReviewPlayer`.

Ticket actif:

- `UX.AUDIT.1` - audit ergonomique et structurel read-only de l'application,
  avant tout nouveau redesign produit. Le brief valide est conserve dans
  `docs/audits/MIKAI_UX_AUDIT_BRIEF.md` et le point de rollback GitHub est
  `pre-ux-audit-20260714`.

Dernier ticket produit termine:

- `THEME.TOPBAR.MASK.1` - couleur TopBar dediee et texture rendue par masque
  alpha, avec le Canvas comme fond des zones transparentes.

## Sequence Seedance MVP (handoff de reference)

Cette sequence est la priorite acceptee pour le MVP Seedance et complete la
roadmap creative generale. `SEED.MVP.0` correspond a l'audit/handoff initial.

1. `SEED.MVP.0` - termine
2. `ASSET.BIBLE.1` - termine
3. `ASSET.BIBLE.2` - termine
4. `GEN.SEEDANCE.1` - termine
5. `PROMPT.COMPILER.1` - termine
6. `PROMPT.COMPILER.1-FIX` - termine
7. `PROMPT.COMPILER.2` - termine
8. `PROMPT.COMPILER.3` - termine
9. `GEN.SEEDANCE.2` - termine
10. `GEN.SEEDANCE.3` - termine ; aucun workflow First/Last Frame reel n'etait
    disponible, donc aucun profil actif n'a ete invente

Regle de priorite : ne pas intercaler `REFROLE.1`, `PROMPTPKG.1` ou `PROMPT.2`
entre ces tickets Seedance sans nouvel arbitrage produit explicite.

## Axe Editorial et OpenReel

Fondations deja disponibles:

- Editorial Workspace par sequence;
- preview de sequence;
- trims et selection par item editorial;
- gaps temporels et black hold;
- `sequence_editorial_items` separe des shots;
- trims par occurrence;
- resize non-ripple;
- `EditorialDocument` comme couche d'adaptation;
- bridge OpenReel import, timing start-only, snapshot anti-stale, insertion,
  publish Advanced et push de duree de production.

Separation architecturale:

```text
shots -> narration, production, prompts, casting, generation
sequence_editorial_items -> montage, occurrences, trims, timing, gaps
```

Backlog apres le bloc immediat:

- `OPENREEL.ROUNDTRIP.1` - verifier un vrai aller-retour MikAI <-> OpenReel;
- `FILM.EXPORT.1` - export final controle;
- `FILM.AUDIO.1` - piste audio, musique et mix de preview;
- `EDITORIAL.BACKPROP.1` - appliquer volontairement certaines decisions de
  montage aux shots narratifs.

## Axe Creative Direction et Prompts

Cet axe vient apres le bloc Film Result/OpenReel.

1. `CREATIVE.1.A` - audit du Creative Prompt System sur Story, Outline,
   Sequence, Shot, Casting, Assets, Style Bible, References, Prompt Packages,
   workflow selectionne et prompt compile.
2. `PROMPTUX.1` - edition claire du prompt, distinction prompt utilisateur /
   prompt compile, sources visibles, Fill/Replace/Append/LLM Assist et panneau
   Generate conserve ouvert.
3. `STYLE.1` - Project Style Bible, avec audits et implementation V1 puis
   references visuelles et injection dans les prompts.
4. `REFROLE.1` - roles precis pour images et videos: First Frame, Last Frame,
   Character, Environment, Style, Camera, Motion, Rhythm, Continuity Anchor,
   Keyframe et Storyboard Frame.
5. `PROMPTPKG.1` - bibliotheque de packages par workflow et modele:
   Seedance, GPT Image, animation, camera et continuite.
6. `PROMPT.2` - rework du compiler selon la tache: image, character design,
   environment, keyframe, image-to-video, first/last frame, reference-to-video,
   extension, negative prompt et timed segments.

## Axe Generation et Workflows ComfyUI

Deja largement disponible: Workflow Library, workflows image/keyframe/video,
detection des noeuds Input, prompts dynamiques, Generate Content, workflow par
defaut, selection/upload d'images, generation/regeneration, approbation,
approved video au niveau Shot, lecteur frame-aware, extraction de frame,
Dynamic Batch et panneaux Asset/Shot.

Backlog:

- `SEQGEN.1` / `SEQGEN.SPLIT.1` / `SEQGEN.PUSH.1` - workflow futur
  Seedance au niveau Sequence: compiler les prompts des shots, optionnellement
  generer un storyboard, produire une video sequence bout-a-bout, detecter les
  splits attendus, reviewer le mapping, puis pousser les clips comme candidats
  video vers les shots existants. Voir
  `docs/SEQUENCE_LEVEL_SEEDANCE_DRAFT.md`.
- `WFBUILD.1.B` - stabilisation finale du Dynamic Batch si necessaire;
- `GEN.VRAM.1` - option de purge Ollama avant ComfyUI;
- `LLM.VRAM.1` - option de purge ComfyUI avant Ollama;
- `ASSET.1.E` - dernier polish de generation d'Assets et references.

## Axe Story, Outline, Sequences, Shots et Assets

Deja disponible: Story Workspace, Pitch/Story/Notes, Outline Builder,
generation/application d'outline, Sequence Builder, generation de shots,
extraction d'assets, casting suggestions, Shot Detail narratif, continuite,
contexte camera, Prompt Composer et enrichment d'assets.

Backlog:

- `DIRECTOR.ASSIST.1` - MikAI Director Assist : analyse et accompagnement
  transversal de la narration, de la couverture, de la continuite, du casting
  et de la coherence du monde. Le perimetre sera precise dans une discussion
  produit dediee avant implementation;
- `ASSET.USAGE.1` - utilisation narrative et visuelle d'un asset.

### AI Assist pour les Assets

- `AI.ASSET.DESCRIPTION.1` - `Enhance Description`: ameliorer la description
  d'un asset avec l'assistance LLM, avec apercu et application explicite par
  l'utilisateur;
- `AI.ASSET.BIBLE.1` - `Enhance Asset Bible`: remplir ou ameliorer les champs
  textuels `Visual Identity`, `Usage Rules` et `Forbidden Variations` de la
  section Asset Bible a partir des informations presentes dans `Description`
  et `Notes`, avec apercu, edition et application explicite. Aucun champ ne
  doit etre ecrase silencieusement et aucune migration n'est necessaire.

### Theme Custom

- `THEME.CUSTOM.IMPORT.1` - importer une palette JSON contenant les huit
  tokens couleur, la previsualiser et l'ajuster avant `Save as custom`, sans
  persistance automatique.
- `THEME.TOPBAR.MASK.1` - texture TopBar alpha-maskee par une couleur dediee,
  sans teinte RGB imposee par l'image.

## Axe LLM Chat et assistance locale

Deja disponible: LLM Chat dans le panneau droit, choix Ollama, Markdown,
System Prompts, hauteur du chat et largeur du panneau redimensionnables.

Backlog:

- `LLMCHAT.CONTEXT.1` - contexte optionnel Project / Sequence / Shot;
- `LLMCHAT.TOOLS.1` - actions MikAI controlees depuis le chat;
- `TRANS.1.C.D` - traduction Shot Edit et Prompt Segments;

## Axe Outillage Codex / Claude

Deja disponible:

- `DEV.AGENTS.1` - structure `.agents/` et echange de tickets/rapports;
- `DEV.AGENTS.2` - review et gate Codex avec verdicts
  `APPROVED`, `REVISE`, `NEEDS_USER`.

Regles permanentes:

- jamais `git add .`;
- staging explicite;
- aucun commit sans `APPROVED` et `safeToCommit: true`;
- parcours utilisateur fourni pour chaque feature visuelle;
- pas d'extended thinking inutile pour les simples taches de commit/push.

## Vue condensee

## Reevaluation apres Seedance MVP

Le bloc Seedance a deja livre les presets, le Prompt Compiler, le handoff, les
profils generiques, les roles First/Last minimaux et les diagnostics. Les
prochaines taches doivent donc eviter de refaire ces fondations.

Ordre recommande a valider avant le prochain ticket:

1. `PROMPT.PACKAGE.MVP.1` - remplacer le scope trop large de `PROMPTPKG.1`
   par une registry legere de packages par workflow;
2. `OPENREEL.ROUNDTRIP.1` - valider le vrai aller-retour MikAI/OpenReel;
3. `OUTPUTS.POLISH.1` ou `GEN.RUNTIME.1` selon les problemes reels observes.

Decisions de backlog:

- `PROMPT.2` est a fusionner plus tard dans un ticket cible par usage;
- `WFBUILD.1.B` est largement couvert par `GEN.SEEDANCE.1`;
- `GEN.VRAM.1` et `LLM.VRAM.1` restent du confort operationnel;
- `GEN.3`, `G.4`, `EDITORIAL.VERSION.1`, `CASTING.CONTINUITY.1` et `WORLD.1`
  sont retires de la roadmap actuelle;
- `STORY.CONTINUITY.1` et `SHOT.COVERAGE.1` sont remplaces par
  `DIRECTOR.ASSIST.1`;
- `LLMCHAT.HISTORY.1` et `LLM.COMPAT.1` sont retires de la roadmap actuelle;
- `SEQGEN.*`, `FILM.EXPORT.1` et `FILM.AUDIO.1` restent des objectifs de
  moyen terme.

### Maintenant

1. Implementer `THEME.TOPBAR.MASK.1`.
2. Ne pas poursuivre First/Last Frame tant qu'un workflow reel et audite
   n'est pas disponible.

### Ensuite - Creative / Prompts (apres le bloc Seedance)

5. `REFROLE.1`
6. `PROMPTPKG.1`
7. `PROMPT.2`

### Ensuite - Generation

1. `GEN.VRAM.1`
2. `LLM.VRAM.1`
3. `ASSET.1.E`

### Plus tard

16. Editorial round-trip et versions;
17. Film export et audio;
18. Continuite narrative et visuelle;
19. LLM Chat contextuel;
20. Traduction et compatibilite petits modeles;
21. Sequence-level Seedance draft, split controle et push vers shots;
22. Evolutions de l'outillage Claude Code <-> Codex.
