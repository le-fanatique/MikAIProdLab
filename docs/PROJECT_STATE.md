# MikAI Project State

Last updated: 2026-08-22

## Workflow template gallery — `WF.CATALOG.1` shipped (2026-08-22)

`cf5e5a8`, migration `0061` generated here and applied by the author. Six
additive columns on `comfy_workflows` (`category`, `tags`, `contexts`,
`thumbnail_path`, `thumbnail_source_filename`, `status`) and one new pure
module, `src/lib/comfy/workflowCatalog.ts`. Nothing is visible yet: no page,
component or action was touched.

Opened after the author asked for a study of `Comfy-Org/workflow_templates`.
**No workflow is imported from that project** — only its design principle:
presentation metadata lives beside the workflow, never inside its JSON.

What it cost to learn:

- **the six contexts are what the code proves, not what the domain suggests.**
  Camera Lab looks like a seventh, and is not: its page reads two defaults by
  id (`workflowDefaults.gaussianPlyId` / `gaussianToImageId`) and offers no
  choice. A context with no selection surface does not exist. Its workflows
  still need a category, which is why `gaussian-camera` is a category without
  being a context;
- **`contexts = NULL` means "offered everywhere the `kind` allows", never
  "nowhere".** That is the pre-migration behaviour, and it is the only reason a
  six-column migration changed nothing visible for 33 existing rows. Inverting
  that check silently empties every gallery;
- **the categories had to be read off the real library, not inferred.** The
  first list (`keyframe`/`video`/`storyboard`/`look`/`utility`) was derived from
  the context registry, and did not survive contact with the author's 33
  workflows: "Look" matched nothing, "Keyframe" would have swallowed twenty
  unrelated files. The eight shipped categories come from the real names;
- **a review caught the module's one real defect**: a `contexts` column holding
  only unknown ids returned `[]`, which `isWorkflowOfferedIn` reads as
  "offered nowhere" — the row would have vanished from all five galleries with
  no error. Corruption now degrades to `null` ("unspecified"), never to `[]`.

Tests: 1585 → 1626.

Known debt, deliberately left: `WORKFLOW_KINDS` now exists three times — the
new module, `src/actions/comfyWorkflows.ts:8`, and the schema enum. Closed in
`WF.CATALOG.2`, where that action file is in scope anyway.

## Chantier 1 and Chantier 2 — COMPLETE (2026-08-20)

**Everything the sections below describe as upcoming has shipped.** This
document was last accurate on 2026-08-18; read this section first, and treat
the queue descriptions further down as the record of what was *planned*, not of
what remains.

**Chantier 1 — the LLM Workspace, finished.**

| Ticket | Commits | What landed |
| --- | --- | --- |
| B16 | `c30b6a7`, `ef470fb`, `0231327` | the descriptor format can declare an **image input** (N ordered images, per-image keys, bytes re-validated at call time); lighting described from an image; the director's note adjusting an existing lighting |
| B13 | `739ad6f`, `f1ce136` | the **conformation stage**: stored reference roles become the engine's named modes, and the guide's output discipline reports findings that never gate |
| B14 | `0a4f27a`, `ae467e6` | the **storyboard prompt stops eating from one jar** — it composes from the pantry that was already resolved and discarded |
| B20 | `ae174d4`, `77d020d`, `9ba1bb5`, `ad38206` | all three of §5.9's format gaps closed, plus a mutation-proven net under the three properties the migration must not break. **B20e — the migration itself — is deferred past Chantier 2 by the author**, because its blockers turned out to be orchestration, not format |
| B17a | `2a0220d`, `19f63b3` | shot reference videos carry a **role**, migration `0055` applied by the author |

**Chantier 2 — the cleanup, finished except where it needs the author.**
C0 froze the descriptor oracle (`51ed7f9`) so the builders could die; C1/C2
became a **unification** — fifteen per-operation server actions collapsed into
one, thirteen of fourteen panels migrated; C3 deleted six builders nothing
called; C4 filed 31 components by domain and **deliberately left 100 flat**.

**Four nets exist where there were none**: theme, video split, storyboard
extraction, editorial. Each was written *before* the code it guards was
touched, and each was verified by breaking that code and watching tests fail.

**Tests: 968 → 1361.**

### What is left, and who owns it

- **B18** (negative constraints) — the author called it a real gap and
  explicitly not MVP;
- **B19** (camera redesign) — a design job on his own fields;
- **B20e** (the Reference Board migration) — a chantier to design with him;
- **B17b** (the audio family) — deliberately not built: §5.6 says the video
  table had never been exercised, and it only just gained its roles;
- **the 89 flat components** — their domains are a product judgement;
- **the token-efficiency audit** — referenced as "asked for" but never defined
  anywhere, so its scope needs stating before it can be done.

## B19 — the camera redesign, 2026-08-21

Opened because the author asked what "MS" meant in one of his own shots, and
nothing in the app could answer.

**What was wrong.** The vocabulary was copied by hand into three places that
disagreed — Generate Shots offered seven framings, Insert Shot nine, the form's
placeholder five, with `tracking` against `track` and `dolly` against
`dolly in`. The rule banning combinations existed only in Insert Shot and had
never been propagated. Nothing anywhere defined a single value. And the model
had been told to put "camera angle, lens, position" into one free-text field,
so three axes lived as prose in `camera_pitch` on 88 shots.

| | commit | what landed |
| --- | --- | --- |
| B19a | `5a89ef2` | the vocabulary, declared once — five axes, every value with a definition. A **palette, not an enum**: an unrecognized value is flagged and kept, never substituted |
| B19b | `17986f9` | `framing` → `shot_size`, plus `camera_position`, `movement_speed`, `camera_subject`. Six `OTS` rows moved to placement — deterministic, because the instruction had literally listed `OTS` as a framing value |
| B19c | `65261e2` | the form shows the values **and what they mean**, via `<datalist>` so an out-of-palette value stays typable |
| B19d | `8bc467b`, `ec711f6` | both instructions render from the declaration; nothing is hand-copied. Values are written the way the trade writes them — `MS`, but `Low Angle` |
| B19e | `2ba4ac8` | the camera line follows the Seedance 2.5 template, and the conformation counts **movements** instead of filled fields |
| B19g | `2b79abc` | a **lens axis**, opened because the conversion proved one was needed: 22 shots stated a focal length the other five axes could not hold |
| B19h | `4370260` | `camera_pitch` removed. `shot.retakeDirected` keeps its capability on `camera_subject`; the conversion operation is deleted with the column it read |
| B19f | `b5a8ce2` | the conversion pass — a list operation over the sequence, bench-only, every proposal shown beside the text it came from |

**B19 is complete.** B19d, B19e and B19f were finished in the main thread:
the executor hit its weekly limit mid-file on B19d.

**Converted in bulk, 2026-08-21, on the author's instruction.** All ten
sequences, 82 shots. Afterwards, on 91 shots: 63 carry a `camera_position` and
55 a `camera_subject`, both of which did not exist that morning. And **zero**
shots hold a `camera_pitch` whose content is not represented in at least one
axis — which is what makes removing it safe rather than hopeful.

Two things the bulk run found that no test did. A model copied a group label
into a field — `"Dutch / Canted (tilt)"` — because the instruction trailed each
label after its list; the label now leads, and the two rows are fixed. And 22
shots stated a focal length that none of the five axes could hold, which is why
`camera_lens` exists at all: deleting the legacy field without it would have
destroyed those focal lengths.

**Validated on real shots, 2026-08-21.** The author ran the conversion on
`The Awakening and The Trap` — six shots, every one carrying a compound
movement and a size mixing two axes, the hardest set in the database. It held:
`"OTS to MCU"` split into placement plus size, `"slow tracking arc"` into `Arc`
plus `Slow`, and `"tracking push with whip-pan and final dolly-in"` kept
`Tracking` as principal with the other two preserved in `camera_subject` and a
note saying so. `camera_position` and `movement_speed` were left **empty**
wherever the source said nothing — the discipline that is hardest to get from a
model, and the whole point of the operation.

One decision came out of it, and it is the author's: **`camera_subject`
restates the movement its own field already names, and that stays.** The
composed line reads "… — Tracking — Follow Azelle into the pocket …". The 2.5
formula asks for the movement inside that sentence, and the guide says
repeating a key instruction does not hurt. It is recorded in
`cameraInstruction.ts` so it is not mistaken for an oversight later.

A decision that also held end to end: `"tilt and lateral tracking"` became
`Tracking`, not `Truck Left`, because the source never says which side. That is
exactly why B19a refused to alias `tracking` onto a directional movement.

**Two silent losses the removal surfaced, neither by any check.** Generate
Shots read `framing` for the shot size after B19d had rewritten the instruction
to ask for `shot_size`, so it stored none — and it had no path at all for
`camera_position`, `movement_speed`, `camera_subject` or `camera_lens`. A
round-trip test had recorded that gap as *expected behaviour*; it now asserts
the opposite.

**Three reversals, all sourced.** Size intervals are allowed — the 2.5 guide
speaks of a starting and an ending shot size, and the ban came from 2.0. The
"one primary camera instruction" rule was counting fields, so it warned on
correct usage. And `camera_pitch` is kept rather than dropped: it is the only
angle 88 shots have, and the composition falls back to it while
`camera_position` is empty — precedence, never accumulation.

**Sources.** The BytePlus conference slide the author supplied (shot size,
camera angle, framing/placement, camera movement), the official `sd25-pe`
skill, and the Seedance 2.0 guide. Neither guide defines a closed vocabulary;
2.5 goes further and forbids a bare term detached from its subject, which is
why `camera_subject` exists at all.

**Two silent losses caught by mutation, not by review.** `updateShot` would
have wiped `camera_pitch` on the first edit once the form stopped submitting
it, and 358 tests still passed. And Insert Shot would have asked for the three
new axes while `normalizeProposedShot` dropped them.

## GEN.MULTIOUT.1 — a job may return many files, 2026-08-22

Found by the author using the product: a `Grid2Batch` workflow takes one image
and gives back four, and only one ever reached MikAI.

**What was wrong.** `ImageGridtoBatch → SaveImage` publishes a whole batch into
a single `images` array, and `extractFirstComfyOutput` took `images[0]`. Not a
bug — an assumption, "one job, one output", never reopened since. It was sealed
by the schema: `generation_jobs.output_path` is one TEXT column. Measured on job
544 (asset 51, Comfy Cloud): four images returned, one stored, and the other
three still served by `/api/view` two days later at four distinct sizes.

| Commit | What landed |
| --- | --- |
| `6cef0e4` | `extractComfyOutputs` returns every file with the kind ComfyUI filed it under; `generation_job_outputs` records one row per file; both poll paths download the batch |
| `7a35ac6` | the Content Generator gallery — all outputs ticked by default, `Unselect all`, and `Attach as Reference` storing each selected source |
| `cb6f032`, `97fb4b9` | the hover preview, uncropped, on the Asset gallery and the Shot outputs list |

**`output_path` was never replaced.** It still points at index 0, so the twenty
call sites that read it — video approval, reference attachment, storyboard,
sequence video, the PLY cache — are untouched. The table sits beside it.

**Two rules the design rests on.** A sibling that cannot be fetched never fails
the job, because the primary output is already published and valid; the missing
`output_index` is the durable trace, which is why indexes are never compacted.
And ordering has two different guarantees: inside a node it is ComfyUI's batch
order, between nodes it is ascending node id — a language rule about integer-like
keys, not a choice.

**Migration `0058`** applied by the author. **`G5`, back-filling the jobs that
predate this, was declined** — the old rows keep their single output.

**Caught by mutation, not by review.** Two tests passed for the wrong reasons:
removing the confinement check changed nothing, because both escape fixtures
pointed at files that do not exist and `fs.access` refused them first; and
sorting by filename passed the ordering test, because the fixtures happened to
be named in index order. Both were rewritten to isolate what they claim.

**Verified in a browser** with Playwright against a throwaway copy of the
database — no paid Cloud call — then confirmed by the author on a real
generation.

## `SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1` — Extract rattrape la plage, 2026-08-22

Un commit, `868869f`. Aucune migration. Suite directe du ticket ci-dessous,
livrée le même jour : un storyboard peut désormais ne couvrir qu'une plage, et
Extract from Storyboard appariait encore la vignette *i* au Shot *i* en partant
du premier de la séquence.

Le décalage n'était pas le pire. `expectedShotCount` pilote la **détection** :
il cherchait 6 cases dans une image qui en avait 3, donc la grille elle-même
était fausse avant tout appariement, et corriger le mapping après n'aurait rien
rattrapé.

### La cascade, et la contrainte qui la cadre

Choix explicite sur la page Extract → sinon plage héritée du job de génération
→ sinon séquence entière.

Ce dernier cas est celui d'un **storyboard uploadé à la main** : pas de job,
donc pas de provenance. L'auteur l'a posé comme contrainte avant l'écriture du
ticket — « il ne faut pas que cette information soit mandatory » — et elle a
son propre test : aucun champ obligatoire, aucun blocage, aucun avertissement,
comportement identique à avant.

### Zéro migration, et pourquoi ce n'était pas évident

La plage voyage dans `GenerationSnapshot`, contrat JSON additif qui portait
déjà `sequenceStoryboardReferenceMappings` et `styleProvenance` — deux
précédents exacts. Elle se persiste ensuite dans le `paramsJson` de
l'extraction, le blob qui enregistre déjà « les params réellement utilisés ».

Elle y stocke **la liste ordonnée des ids couverts, pas deux bornes**. Un
réordonnancement ou une suppression de Shots entre la génération et
l'extraction réinterpréterait des bornes en silence sur une autre tranche ; une
liste explicite se dégrade proprement — les Shots disparus sont listés et
signalés, jamais remplacés par un voisin.

**`promptSnapshot` contient pourtant la plage en clair** depuis `0e9e121`, sous
la forme `Shot range: this Storyboard covers Shots …`. Le ticket l'a interdit
explicitement comme source : c'est de la prose écrite pour un modèle, pas un
format. La donnée passe par le JSON ou pas du tout.

### Deux défauts, aucun visible dans le diff

C'est ce que ce ticket a produit de plus utile.

**Un crash introduit par le ticket lui-même.** `assignAllExtractionRegions`
relisait `paramsJson.shotRange.shotIdsInOrder` **brut**, sans le confronter aux
Shots vivants. Un Shot supprimé après la détection y restait nommé,
`proposeShotMapping` l'attribuait à une région, et l'écriture de `targetShotId`
violait la clé étrangère : `FOREIGN KEY constraint failed`, jeté hors de toute
gestion d'erreur. Avant ce ticket le cas était impossible — Assign All
requêtait toujours les Shots vivants.

Reproduit sur le harnais DB réel **avant d'être signalé**, et corrigé en
faisant passer les trois branches par le même `resolveExtractionShotRange` — la
fonction écrite précisément pour filtrer les ids morts, et que sa propre
branche court-circuitait. Deux tests, vus rouges avant la correction.

**Un texte faux, trouvé en regardant la page.** La carte « Storyboard Shot
Range » d'Extract héritait verbatim du composant partagé, qui affirme que « les
références de casting restent calculées sur toute la séquence » — une notion
qui n'existe pas sur cette page. Corrigé par une prop `helpText` dont le défaut
est la phrase d'origine octet pour octet, donc la page de génération n'a pas
bougé.

La leçon vaut d'être gardée : **la relecture du diff n'a attrapé ni l'un ni
l'autre.** Le premier a demandé de rejouer un scénario que personne n'avait
écrit, le second de charger la page. `mikai-method` §2 et §5 disent exactement
cela, et les deux se sont vérifiés le même jour.

### Preuve

1561 → **1585 tests**, 24 ajoutés, aucune assertion existante modifiée.
Vérifié en navigateur sur l'extraction 78 (projet 18, séquence 54, 20 Shots) :
« Covers the full Sequence (20 Shots) » sans plage, « Shot range set here: 5 of
20 Shots » avec, et la grille suggérée qui passe de 20 à 5 — la preuve que
`expectedShotCount` suit, donc que la détection se recale.

Deux chemins **non prouvés à l'écran**, dit plutôt qu'arrondi : l'image
uploadée (il aurait fallu lancer le worker OpenCV) et l'héritage réel depuis un
job (une génération ComfyUI). Les deux ont un test dédié sur base réelle.

### Laissé de côté

Le `<select>` de réassignation d'une région liste toujours **tous** les Shots de
la séquence : la plage propose, elle n'enferme pas. Même principe que le casting
non restreint du ticket ci-dessous.

## `SEQGEN.STORYBOARD.SHOTRANGE.1` — le storyboard n'avale plus toute la séquence, 2026-08-22

Un commit, `0e9e121`. Aucune migration. Demandé par l'auteur le jour même : le
prompt Sequence Storyboard prenait systématiquement **tous** les Shots de la
séquence, sans moyen d'en cadrer un extrait.

Deux params d'URL optionnels, `shotFrom`/`shotTo`, portant des **ids de Shot**
et non des positions, posés par deux `<select>` dans une carte « Storyboard
Shot Range ». Absents — le défaut — le texte produit est inchangé **octet pour
octet**, et un test l'exige.

### La décision qui a cadré le ticket

`shotList` est chargé deux fois indépendamment, par la page Generate et par
`buildSequenceStoryboardGenerationContext`, et **c'est assumé** dans ce fichier
depuis `SEQGEN.STORYBOARD.3`. La plage est donc un helper pur appliqué aux deux
endroits — `selectStoryboardShotRange`, générique sur `{ id: number }` — pour
que preview et queue ne puissent pas diverger, la contrainte que ce fichier
porte déjà pour `includeWarnings`.

Elle ne filtre que `shotInputs`, `shotCount` et l'entrée de
`resolveStoryboardLighting`. **`shotIds` reste la séquence entière**, donc le
pool de références de casting aussi : décision de l'auteur, prise avant
l'écriture du ticket. Restreindre le casting aurait fait disparaître en
silence une référence qu'il avait explicitement sélectionnée hors plage, et
renuméroté les `@ImageN`.

### Deux refus de deviner

- une borne nommant un Shot inexistant est **ignorée avec un warning nommant
  l'id**, jamais rabattue sur un voisin ;
- une plage inversée **replie sur la séquence entière avec un warning**, au
  lieu d'échanger les bornes. Échanger supposerait une intention que
  l'utilisateur ne verrait nulle part.

### Deux pièges que le ticket n'avait pas vus

- **`Number("") === 0`.** L'option vide des `<select>` soumet `shotFrom=`,
  chaîne vide, que `Number.isInteger` accepte comme `0` : « First Shot »
  aurait été lu comme « Shot id 0 ». Sans le garde `trim() === ""`, le
  contrôle spécifié ne fonctionnait pas.
- **La clé de remontage de `WorkflowRuntimeMappingPanel`** devait inclure la
  plage. Cette clé existe parce qu'un changement de `suggestedText` doit
  re-semer le « Suggested Text » que le panneau tient en `useState` ; la plage
  change `suggestedText` exactement comme l'ordre de casting le fait. Sans
  elle, le bug de staleness déjà corrigé pour le casting revenait pour la
  plage.

### Et une prémisse fausse dans le ticket lui-même

Le ticket demandait d'afficher les warnings « au même endroit que ceux du
prompt ». **Cet endroit n'existe pas** : `promptResult.warnings` n'est rendu
nulle part sur cette page, et ne l'a jamais été. L'exécutant l'a dit au lieu
de bricoler autour. Les warnings vivent donc dans la carte Shot Range, en
style informatif, jamais bloquant. La leçon est pour le superviseur : une
consigne de réutilisation doit être vérifiée avant d'être écrite, pas
supposée.

### Preuve

1549 → **1561 tests**, 12 ajoutés, aucune assertion existante modifiée ; le
diff du snapshot est en pure addition, ce qui est la garantie mécanique que le
défaut n'a pas bougé. Cinq mutations, dont la borne haute rendue exclusive —
**7 tests sur 10 en échec** — rejouée par le superviseur et non pas seulement
rapportée.

Vérifié en navigateur sur données réelles (projet 18, séquence 57, 6 Shots) :
6 vignettes sans plage, 3 avec `Sh_200`→`Sh_400`, la ligne `Shot range:`
présente, le casting inchangé, et la plage qui survit au « Update Preview » des
Image Inputs — le bug historique de `storyboardRefs`, non reproduit.

### Dette laissée, sciemment

- aux deux sites, un `?? { id: …! }` inatteignable : quand la plage est réelle,
  l'id vient forcément de `shotList`. Deux assertions non-nulles pour un cas
  impossible ;
- le warning de plage inversée nomme l'id brut (« Shot 999221 ») et non le
  `shotCode` (« Sh_400 »), parce que l'helper est générique et ignore les
  libellés. Conforme au ticket, désagréable à lire.

## `STYLE.2.REFERENCE_ANALYSIS.UI.HARDENING.1` — a debt closed by measuring, 2026-08-22

One commit, `e418865`. No migration. Open since 2026-08-02.

### The roadmap's own description of it was wrong

It said the ticket had to apply Look Development's `pending sync` pattern to
Reference Analysis, and that "the pattern already exists elsewhere, this ticket
applies it, it invents nothing".

Reading the file said otherwise: `ReferenceAnalysisWorkspace.tsx` already
carried the `pending-sync` phase on **six sites** and a read-only `Retry sync`,
shipped with `STYLE.1.B.ANALYSIS.UI`. Nothing was missing from the product.
**What was missing was the proof** — and the roadmap had been describing a
feature gap for twenty days when the real gap was a test gap.

Worth keeping: a roadmap line written at ticket-deferral time describes the
plan, not the code. It had never been re-read against the file.

### Why the proof had been impossible

The decision was written inline, in `async` callbacks that also call Server
Actions. Testing it meant intercepting a Server Action, and that had already
been tried on 2026-08-01: 15/42 proofs, because `tsx` resolves `@/` imports
before ESM `load` hooks can rewrite them. `mikai-method` §5 forbids installing a
DOM harness — the user's decision, reconfirmed.

The way out was not a better harness. It was to make the decision testable
**without a DOM and without a Server Action**.

### What shipped

`src/lib/projectStyle/referenceAnalysis/syncPhase.ts` — two pure functions, no
state, no React, on the shape `restoreLookTestSnapshotSelections.ts` had already
set:

- `resolvePendingSync(origin, outcome)` — the eight decisions as one total
  function;
- `retrySync(need, { readAnalysis, readDraft })` — replays reads only.

No hook and no handler body left the component. Every `handleXxx` still owns its
`setPhase`, `setReadModel` and `setPendingMutations`; only the branching and the
message literals moved. That line matters: §5 forbids moving **state**, and a
pure calculation is not state. The precedent was already in the repository, and
this is recorded so the next session does not re-litigate it.

**The property the 2026-08-02 spec asked to confirm is now true by
construction.** `retrySync` receives readers and nothing else — it *cannot*
replay a mutation, and a change that would make it possible has to add a
parameter, which is visible in review.

### Proven twice, and the browser half is the one that had never been done

**Unit** — 22 tests over the eight decisions, `syncNeed` *and* `message`
asserted. Seven mutations run: five by the executor, two more by the supervisor.
Every one broke at least one test. The supervisor's second mutation swapped two
messages, and it matters on its own: a net asserting only `syncNeed` would have
passed it silently and let any future reword through.

**Browser** — `next start`, real project, real data. `window.fetch` patched to
let the first POST through and fail the next: POST #1 is the commit, POST #2 is
the read, because `ObservationCard.handleStatusChange` calls the read **only
after** a known `result.ok`.

| Step | Network | Screen | DB |
| --- | --- | --- | --- |
| Reject, injection armed | `PASSED #1`, `FAILED #2` | `Observation saved but analysis state could not be refreshed.` + `Needs: analysis` | `revision` 2 → 3 |
| `Retry sync` ×3 | 3 read POSTs | `Sync still incomplete. Retry when ready.` | **unchanged** |
| injection lifted, `Retry sync` | `PASSED #6` | banner gone, card reconciled from a real read | unchanged |

`updated_at` stayed frozen at the instant of the commit across four retries.
That is a measurement, not an observation, and it is what Playwright alone could
never have given — Playwright shows that no mutation happened *in one run*; the
signature shows it cannot happen at all.

### What it cost, and what it left

A backup was taken and verified before touching anything
(`mikai-backup-2026-08-22T00-51-18-448Z`). The observation was restored to
`accepted` through the product's own path, but **its `revision` is 4 where it was
2**, and `updated_at` moved. A revision counter does not walk backwards through
the UI, and writing it by hand was not worth the risk. Injecting a failure into
real data always leaves a counter behind — take the backup first and say what
moved.

Two paths were **not** exercised in the browser: `analysisLaunched` and
`analysisConfirmed`, each of which needs a real provider call. A cost decision,
not a technical limit; both are covered by the unit net.

### Left alone on purpose

The same `pending sync` pattern is hand-written in **five other components** —
`SequenceStylePanel.tsx`, `LookDevelopmentBench.tsx`,
`LookDevelopmentReviewControls.tsx`, `LookDevelopmentRecentTests.tsx`,
`InfluenceResearchWorkspace.tsx`. Unifying them was ruled opportunistic and
excluded from the ticket. `syncPhase.ts` is written so a later generalisation
needs no rewrite. This is a real observation awaiting the author, not a defect.

One behaviour frozen as-is and worth knowing: `resolvePendingSync` tests
`outcome.analysis === false`, not `!outcome.analysis`, so an omitted field reads
as success. Every call site passes a real boolean today.

**Tests: 1 527 → 1 549.**

---

## What the `camera_pitch` drop cost, measured 2026-08-22

Migration `0060` (`ALTER TABLE shots DROP COLUMN camera_pitch`) is **applied**;
the column is gone. This section exists because the measurement was taken while
it still stood, and the answer is worth keeping.

**Six shots lost their camera angle, and it is six out of six.** Of the 88 rows
still carrying a `camera_pitch`, six spelled out an angle after a dash, and none
of those values appears in any of the new axes:

| Shots | Value lost |
| --- | --- |
| 36, 41 | `2/3 angle` |
| 37, 39 | `3/4 angle` |
| 38, 40 | `Eye Level` |

The first count taken said "six out of 88", which was comforting and wrong: rows
with no dash were skipped and silently counted as safe. Every shot that recorded
an angle lost it. `Eye Level` is the neutral case and costs little; `2/3` and
`3/4` are an orientation that `Over-the-Shoulder` and `Establishing Shot` only
partly cover.

**They are recoverable, and nothing needs restoring to get them.** The column
survives in the pre-`0060` backups — `mikailab-DBHEALTHREPAIR1-pre-live-2026-08-10`
holds all six verbatim. Reading six values out of a backup file is a query, not
a restore, so the decision to reinstate them can be taken calmly, later, and
without touching the live database. The 2026-08-21 backups are already past the
conversion and do **not** carry it.

**Two `shot_size` values are still a truncated sentence, not a code.** Shots 37
and 39 hold `"ELS - Eyes on Max, emphasizing his confident demea"` and its twin,
cut at 50 characters: the conversion wrote the model's justification into the
field. Unrelated to `0060`, still true today, repairable by hand.

## Three bugs from real use, 2026-08-20 — and the pattern two of them shared

All three came from the author using the product, not from auditing code. Worth
recording because the second and third were the same defect wearing different
clothes.

**1. Multi-image generation silently used two images** (`4c34ead`).
`ImageBatchMulti` reads only its first `inputcount` slots, and the expander
wired `image_1..image_N` without ever writing that widget — so it kept its
serialized default of 2. Every job queued with three or more references had the
extras present in the JSON and ignored by ComfyUI. **Nothing errored.** Found by
comparing two exported workflows side by side.

**2. The sequence cast reached no Shot** (`cd0601c`).
`sequence_assets` and `shot_assets` are independent tables with no propagation
either way; the Storyboard reads what the *Shots* carry, which is correct.
Running Casting Suggestions is the bridge, and it works. The page carried a note
saying assets "are not automatically added to individual shots" — describing
what does not happen without naming the remedy or which assets were affected.

**3. A validated split plan cut nothing** (`41e9b5f`).
Validating maps segments to Shots; *pushing* cuts the clips and sets each Shot's
thumbnail. The page showed a green "Validated" badge over segments all reading
"Mapped", with the remaining step a button further down that nothing pointed at.

### The pattern, and its sweep

Two and three are one defect: **the mechanism was right, and the interface
claimed a completion it had not reached.** Both are now fixed by making the
incomplete state say so — an amber badge and a named next action, not a change
of mechanics.

The schema has exactly **three** status enums with intermediate states, and all
three were examined:

- `sequence_video_split_runs` — `validated` is set by an action that does *not*
  do the work, and the enum has no `pushed` state. This was bug 3. The page now
  derives the pushed state by counting candidates, which is **stronger than a
  status column would be**: a column can be set and then contradicted by
  deleted candidates, while the count is always true. No migration needed.
- `sequence_video_split_segments` — `pending | mapped | skipped`, per segment,
  and consistent with the run above.
- `sequence_storyboard_extractions` — `confirmed` is set **by the action that
  writes the reference images**. Sound by construction; no equivalent gap.

So the pattern was real, occurred twice, both are fixed, and the sweep is
complete rather than sampled.

## Repository Heads

## LLM Workspace Phase A — COMPLETE (2026-08-13)

Phase A of `docs/LLM_WORKSPACE_ARCHITECTURE.md` §9 is delivered, committed and
pushed. It was the "work that will not be redone" gate before the workspace.

| Item | Commit | Result |
| --- | --- | --- |
| A1 — schema split | `0074f2e` | `src/db/schema.ts` → 13 domain modules + barrel; `db:generate` reports no schema change |
| A4 — LLM operations inventory | `6a730b6`, `f31416a` | `docs/LLM_OPERATIONS_INVENTORY.md`, 26 rows |
| A3 — orphan deletions | `6a730b6`, `ba41bb3` | `sequences-from-story.ts`, `generateAssetDescriptionDraft` |
| A2 — snapshot tests | `cfc8745` | **first test suite in the repository**: 22 builders, 99 tests, 86 snapshots |

Also pushed in the same window: `82428bd` (ignore local `.agents/` material),
`22208b8` (ComfyUI `PrimitiveString` write fix), `0949d48` (pnpm 11.7.0 in the
OpenReel start command), `6bf2abd` (project tab order, Editorial Actions above
the timeline). The last three were authored directly by Codex outside the
supervision loop and validated manually by the user before commit.

**New durable capability:** `npm test`. The repository had no tests before
`cfc8745`. Any change to a prompt builder now fails a snapshot instead of
passing silently.

**The two frozen defects are now fixed (2026-08-13)**, together with the third
independent item, in the follow-up pass on
`docs/LLM_WORKSPACE_ARCHITECTURE.md` §9 "Independent": `composeShotPrompt` no
longer emits double punctuation (its frozen snapshot was updated deliberately,
the other two are untouched), the `getPromptCompilerPreset` orphan is deleted,
and `translationPrompt.ts` stays in `src/lib/llm/` by decision — prompt builder
location carries no contract. The suite is 100 tests.

## LLM Workspace Phase B — COMPLETE (2026-08-16)

B0 to B9b delivered. The ticket-by-ticket log — 32 sections, one per ticket,
each recording what it cost to learn — was **moved to
`docs/archive/LLM_WORKSPACE_PHASE_B_LOG.md` on 2026-08-21**, where nothing is
asked to read it.

It was 1 734 lines here, roughly 35 000 tokens, for a phase that is finished
and whose outcome is summarised at the top of this document. Reading it was
never the intent; paying for it on every visit was the accident.

Open the archive deliberately when you need to recover *why* a Phase B
decision was taken. For what is true now, the top of this file is the answer.

## DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1 - Implemented, awaiting Codex review (2026-08-10)

`install.bat`/`.sh`, `start.bat`/`.sh`, `update.bat`/`.sh` added at repo root
as thin wrappers around one new Node ESM orchestrator,
`scripts/mikai-deploy.mjs`. It reads `config/openreel-sidecar-release.json`
through a closed, runtime-validated schema (unknown keys, wrong types, a
non-40-hex commit/upstreamCommit, an out-of-range port, or any repository
other than the exact pinned GitHub identity are all refused before any
side effect); resolves the sidecar directory from `MIKAI_OPENREEL_DIR` or
the default sibling path with symlink-safety checks; preserves an existing
`.env.local` byte-for-byte; creates only the known runtime directories when
absent; requires a real `npm run backup:create` success before migrating an
existing DB (a fresh/missing DB needs none, and a `DB_PATH` outside the
supported `<repo>/data/` contract refuses outright rather than claiming
protection it can't provide); clones/moves the sidecar to exactly the
pinned commit (never a branch tip), refusing on tracked changes or an
origin mismatch on an existing checkout; and, for `update`, fast-forwards
MikAI's own `main` only (refuses on a diverged history) before re-reading
the possibly-new pin. `start` validates the sidecar `HEAD` against the pin
and delegates to the existing `npm run prod:all` launcher — no second
process manager. Every side-effecting command runs through one injectable
runner, used by the required command-order proof.

All five required proofs were run for real against disposable fixtures
(temporary git repos/clones/worktrees, isolated ports, cleaned up
afterward) and passed: pin validation matrix (33/33), command-order safety
with a fake runner (26/26), a genuine end-to-end fresh install against a
local git remote fixture pinned at an exact tag/commit (15/15, real `npm
ci`, real `pnpm install`, real `next build`, real migration), a genuine
end-to-end update including fast-forward, backup-before-migration, the
sidecar moving to a new pin, and dirty/mismatched-pin refusals with zero
mutation (19/19), and an isolated `start` on non-default ports with a CORS
check confirming MikAI's editorial-export route grants
`Access-Control-Allow-Origin` only to the explicitly configured sidecar
origin, never an unlisted one (8/8). Two real bugs were found and fixed by
these proofs, not just theorized: Windows `shell:true` was silently
stripping `^` from git revision arguments like `<tag>^{}` (cmd.exe's own
escape character), and `next build` was running BEFORE migrations, which
fails outright on a schema-less fresh DB because some routes prerender
against it — migration now runs first. See `.agents/claude_report.md` for
full evidence.

## OPENREEL.SIDECAR.PROMOTION.1 - Audited and prepared, awaiting Codex review (2026-08-10, retake)

Upstream-based sidecar candidate `mikai/upstream-8459024`
(`f80853ce3de432751847eb1bab3d03a669267c37`) was audited against legacy
sidecar `main` (`33f917a253bef632f65da7ef5175aa4130785fc0`): no supported
MikAI integration contract was lost, and the legacy native-playback patches
(`bace876`, `492dd01`, `33f917a`) are confirmed absent from the candidate's
history and source tree. Candidate typecheck, full test suite, lint, and
production build pass in an isolated worktree (2 pre-existing flaky tests in
`video-engine-export-effects.test.ts`, unrelated to MikAI, reproduced
independently unchanged). Two isolated browser smoke sessions (own ports,
mock export server, local disposable fixture media, no live `5173` use)
confirmed import, continuous multi-clip playback across two clip boundaries,
pause/seek/reload, and full MikAI Bridge visibility with no new console
errors — one against a normal export, one against an explicit
`videoSourceMode`/`timingBasis: "compact-real-duration"` export, which
correctly disabled Validate/Apply, Insert Shot, and Push Duration (each with
an explicit reason) while leaving Publish Advanced available. Grouped-drag +
undo/redo was reattempted with a properly frame-timed synthetic pointer
sequence (delays between `mousedown`/`mousemove` so React's listener-attach
effects flush) and conclusively demonstrated: two selected clips moved by an
identical delta, a single Undo reverted both, a single Redo reapplied both,
no console errors. `MIKAI_SIDECAR.md` now carries an explicit maintenance
contract (upstream base, deterministic release-pin sequencing, retired-patch
note, update/rollback procedure). The MikAIProdLab release pin
(`config/openreel-sidecar-release.json`) is deliberately **not created yet**
— its `commit` value must be the actual sidecar-doc commit once
`MIKAI_SIDECAR.md` is committed on `mikai/upstream-8459024`, which has not
happened; creating it now with the pre-documentation candidate SHA would be
stale the moment that commit lands. It is created in the closing sub-pass,
right after that commit, per the deterministic sequence documented in
`MIKAI_SIDECAR.md`. No git remote state (tags, branches, `main`) was changed
in this pass — promotion (`--force-with-lease` after verifying `origin/main`
is still `33f917a`) is deferred to a Codex-approved follow-up. See
`.agents/claude_report.md` for full evidence.

## DB.HEALTH.REPAIR.1 - Completed Live Maintenance (2026-08-10)

The live SQLite database was repaired during an explicit maintenance window.
Four corrupt Project Style indexes were rebuilt, and the user-authorized,
fully detached Project Style Research rows plus one orphan Working Draft were
removed only after a coherent SQLite backup and a successful disposable-copy
proof. The live database now reports `PRAGMA integrity_check = ok` and zero
rows from `PRAGMA foreign_key_check`; Project 18 and the remaining valid
Projects were verified unchanged. Two timestamped pre-repair SQLite-aware
backups exist under `data/backups/`. The next operational priority is
`OPS.DATA.BACKUP.RESTORE.1`, including media as well as SQLite.

- MikAI: `72f9d89 - feat(style): add Reference Board analysis UI`
- OpenReel sidecar: `4078de7 - Shot video library bridge support`

## STYLE.1.ACCEPTANCE.1 — ACCEPTED, epic STYLE.1 RESOLVED

`STYLE.1.ACCEPTANCE.1` (transversal acceptance gate for the `STYLE.1`
epic, A through G) is `ACCEPTED`: technical evidence complete, two bounded
Codex retakes closed (`REVISE` -> `REVISE` -> accepted), and manual user
confirmation received on 2026-08-02 (`c est ok`). Full matrix, DB/migration
audit, dead-code audit, cross-Project refusal proofs and sign-off are
recorded in `docs/audits/PROJECT_STYLE_V1_ACCEPTANCE.md`. The `STYLE.1`
epic (A through G) is `RESOLVED` — see `docs/ROADMAP.md` for the delivered
ticket registry and the next active ticket.

Verification on 2026-07-13:

- MikAI committed HEAD is `c37e603`; its working tree has persistent
  `AGENTS.md` workflow change plus unrelated `.agents/skills/` and `.vscode/`.
- OpenReel sidecar remains at committed HEAD `e1c36d1`.

Current supervised work:

- `CAMLAB.POLISH.2` est termine et valide par l'utilisateur (`41d7004`) : la
  colonne Gaussian-to-image mappe le snapshot vers
  `Load Image Gaussian (Input)`, la source vers `Load Image (Input)`,
  independamment de l'ordre JSON, et expose ses autres nodes `(Input)`.

- `CAMLAB.POLISH.1`, `CAMLAB.VIEWER.CONTROLS.1` et `CAMLAB.POLISH.2` sont
  termines, pousses et valides par l'utilisateur. Camera Lab guide maintenant
  la generation PLY, le cadrage/capture avec profondeur et zoom ajustes, puis
  la generation Gaussian-to-image avec mapping nominal strict.
- L'epic `STYLE.1` (A a G) est `RESOLVED` : Working Draft et versions
  immuables, Reference Board et Creative Influences, Influence Research et
  Reference Analysis, heritage/override Sequence, injection dans les six
  consumers de generation, Asset Alignment et Look Development sont tous en
  place et pousses (dernier ticket applicatif livre :
  `feat(style): add Reference Board analysis UI`, HEAD `72f9d89`). Le gate
  transversal `STYLE.1.ACCEPTANCE.1` est `ACCEPTED` (voir section
  ci-dessus) — confirme manuellement par l'utilisateur le 2026-08-02. Le
  registre complet des tickets livres est dans `docs/ROADMAP.md`.
- `SEQGEN.VIDEO.CUT.1` reste le prochain candidat hors epic Project Style :
  retirer une plage frame-exacte d'un Sequence Video Draft, concatener les
  parties conservees et publier une nouvelle version sans ecraser la source.
- `SEQGEN.VIDEO.1`, `SEQGEN.SPLIT.1`, the unified Split Workspace, the EOF
  compatibility fix, `SEQGEN.PUSH.1`, `SEQGEN.PUSH.2`, the first-frame PNG
  fix, short frame-native segments and `SHOT.VIDEO.LIBRARY.1` are complete
  and pushed.
- Validated Split Plans now create durable Shot video candidates. Candidate
  review, explicit approval, result invalidation and safe deletion are live.
- `SEQGEN.KEYFRAMES.1` was removed because Shot-level `Capture Frame` already
  covers manual frame extraction.
- `SEQGEN.SPLIT.CLEANUP.1` and its native player-anchor retakes are complete.
- `CAMLAB.SPIKE.1`, `CAMLAB.PLY.1`, `CAMLAB.VIEWER.1` and `CAMLAB.SHOTREF.1`
  are complete and pushed at MikAI HEAD `c9d2982`. A validated Gaussian PLY is
  a secure job/cache artifact with Range serving; the Shot Camera Lab provides
  a PlayCanvas viewer, exact local offscreen PNG capture, and explicit atomic
  confirmation as a durable Shot Reference Image with role `camera`.
- The supplied
  `Gaussian.json` and real ComfyUI history prove a `SharpPredict`
  image-to-PLY workflow whose `GeomPackPreviewGaussian` output exposes a PLY
  downloadable through `/view` with Range support.

Project Style reference documents:

- `STYLE.1` (A through G) is functionally delivered — see the current
  supervised work note above and `docs/ROADMAP.md` for the full delivered
  ticket registry. The original user journey, accepted MVP/deferred
  decisions, detailed specification and development-supervisor handoff are
  preserved in `docs/PROJECT_STYLE_ORIGINAL_USER_STORY.md`,
  `docs/PROJECT_STYLE_MVP_DECISIONS.md`,
  `docs/PROJECT_STYLE_MVP_SPEC.md` and
  `docs/PROJECT_STYLE_SUPERVISOR_HANDOFF.md`.
- Next work in this area is bounded `STYLE.2` follow-ups (Look Development
  corrections, Reference Analysis UI hardening) tracked in
  `docs/ROADMAP.md`, gated behind `STYLE.1.ACCEPTANCE.1` closure.

## Product Shape

MikAI is the production and narrative brain.

OpenReel is the advanced editorial sidecar.

Main output model:

```text
Shots
→ Sequence Results
→ Film Results
```

Two editorial paths produce the same type of sequence output:

```text
Basic Editorial
→ Sequence Result sourceMode = basic

OpenReel Advanced
→ Sequence Result sourceMode = advanced
```

Active Sequence Results are assembled into Film Results.

## Completed Capabilities

### Sequence Results

- Multi-version `sequence_results` model.
- One active result per sequence by application logic.
- Statuses: `draft`, `published`, `active`, `archived`, `outdated`.
- Sequence Detail viewer.
- Previous Results collapsed by default.
- Basic FFmpeg publish.
- OpenReel WebCodecs publish.
- Snapshot and staleness safety.

### Basic Editorial

- Sequence Detail is the main entry.
- Publish Basic Sequence Result.
- Insert Shot Here.
- Real Shot creation.
- Default duration: 5 seconds.
- Mirror write into `sequence_editorial_items`.
- Generate Shot Brief from Neighbors through Ollama.
- Sequence Result and Film Result invalidation.

The `/editorial` route remains useful for trims and fallback controls.

The `/nle-prototype` route is secondary/debug.

### OpenReel

- Open in Advanced Editor from Sequence Detail.
- Export Editorial JSON.
- Validate Patch.
- Apply Patch start-only.
- Publish Sequence Result to MikAI.
- Insert New Shot at Playhead.
- Push production target duration to MikAI without invalidating existing
  Sequence/Film Results.
- Collapsible MikAI Bridge panel.
- Stale HTTP 409.
- Reload from MikAI.

### Film Results

- Film Result model.
- Project Detail viewer.
- MP4 render through bundled FFmpeg.
- Multi-sequence render validated.
- Automatic invalidation when a Sequence Result changes.

### Infrastructure

- Combined launcher:
  - `npm run dev:all`
  - `npm run prod:all`
- Bundled FFmpeg via `ffmpeg-ffprobe-static@6.1.1`.
- File-based supervision loop:
  - `npm run ai:init`
  - `npm run ai:review`

## Current Seedance State

- Historical note: `31441d3` was the latest committed MikAI HEAD as of the
  Seedance handoff session below. It predates the `STYLE.1` epic and is no
  longer the current head — see `Repository Heads` at the top of this
  document (`72f9d89`) for the actual current state.
- The Seedance MVP block is complete through `GEN.SEEDANCE.3`.
- `GEN.SEEDANCE.3` found no real First/Last Frame workflow in the current
  library, so no active profile was invented.
- `THEME.TOPBAR.MASK.1` is complete: dedicated TopBar color with alpha-mask
  texture rendering.

## Known Limits

- The supervision loop is file-based. Codex review is manual in the connected
  Codex session; no untested Codex CLI automation is assumed.
- Live `.agents/*` files are per-ticket scratch state and gitignored.
- `sequence_results` active uniqueness is enforced by application transaction,
  not a DB partial unique index.
- OpenReel V1 timing patches are start-only. Duration changes are not pushed
  as general timeline edits.
- OpenReel split does not automatically create a MikAI Shot.
- Some legacy OpenReel patches without snapshots can still be accepted with
  warnings for backward compatibility.
- Runtime media/storage cleanup remains future work.
- Recent completed polish includes `THEME.MIKROS.1` through `.5` (Custom
  palette, fonts and logo) and `PLAYER.AUDIO.1` (audio controls in the
  frame-aware player).
- `EDITORIAL.NAV.1`, `SEQGEN.1`, the Sequence Storyboard generation/extraction
  chain and `SEQGEN.VIDEO.1` are complete. The dedicated Storyboard workspace
  now owns contact-sheet generation, panel extraction, durable Sequence Video
  drafts and their provenance. Split detection/review and `SEQGEN.PUSH.1` are
  complete: an explicitly validated plan now creates durable, reviewable Shot
  video candidates without automatic approval.

## Storyboard Direction

The Storyboard is not only a gallery of media that already exists. It is the
first visual production workspace for a Sequence, even when no Shot has an
image yet. It must provide a Sequence selector like Editorial, a persistent
Project navigation shortcut, a visual Shot grid, and a compact unique list of
the Assets cast anywhere in the Sequence.

The workspace will let the user select Asset reference images per Asset,
open the Asset Detail page, compile the Sequence package with explicit
options to ignore prompt segments and unapproved references, generate draft
storyboard images, and approve useful compositions before the later
Sequence-level Seedance video workflow.

The intended chain is:

```text
Story -> Storyboard images per Shot -> approved visual structure
-> Sequence-level Seedance video -> Split -> Push candidates to Shots
```

The accepted `SEQGEN.STORYBOARD.3` extension adds a first sequence-level
storyboard contact sheet before sequence video generation. It uses selected
casting references and the full inspectable Sequence Generation Package, and
stores explicit versioned drafts at Sequence level without mutating Shots.

## Last Validated Baseline

Latest reported validation before this handoff:

- `npx tsc --noEmit`: clean.
- `npm run build`: clean.
- `npm run ai:review`: validates Git failure handling and staged diff surface.
- `PLAYER.AUDIO.1`: `npx tsc --noEmit`, `npm run build`, and
  `git diff --check` clean; audio controls validated on Film Result, Sequence
  Result, and Shot Detail surfaces.

For this handoff ticket itself, validation is documentation-only:

- HEADs checked for both repos.
- Working trees checked for both repos.
- Existing docs audited.
- No app runtime, schema, migration, or package file changed.
