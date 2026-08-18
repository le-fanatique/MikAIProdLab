# Ticket candidat — `LLMW.TEMPLATE.EDITOR.1`

**Statut : proposition de périmètre. Non approuvé, non planifié, non
implémenté.** Écrit à la demande de l'utilisateur le 2026-08-15 pour qu'il
puisse trancher l'ordre en connaissance de cause. Rien ici n'engage un ticket.

---

## 1. Le problème

Aujourd'hui, créer son propre workflow LLM est possible mais passe par un
éditeur de texte hors de l'application :

1. dupliquer un built-in depuis `/settings/llm-workflows` ;
2. exporter son JSON ;
3. l'éditer à la main ;
4. le réimporter (le validateur refuse ce qui est malformé) ;
5. le lancer et l'appliquer dans l'établi (B6c1).

La chaîne est complète et prouvée. Ce qui manque est l'écran.

**Aucun ticket du plan ne le comble.** Le §5 de
`docs/LLM_WORKSPACE_ARCHITECTURE.md` esquissait une page de création
(`new/page.tsx`) ; B6a a choisi duplication + import à la place et ne l'a jamais
construite. Le §8 exclut le canvas à nœuds de la V1 mais ne dit rien d'un
éditeur en formulaire : il n'est pas refusé, il est absent.

## 2. Ce que le dépôt offre déjà, et qu'il ne faut pas refaire

| Existant | Rôle pour l'éditeur |
| --- | --- |
| `llm_templates.templateJson` | Stocke le descripteur entier. **Aucune migration nécessaire.** |
| `validateLlmTemplateJson(raw)` | Valide tout : ids de variables, ids d'actions, types d'entité, **et chaque forme de rendu référencée**. C'est le portail de sauvegarde, pas à réécrire. |
| `updateLlmTemplateMetadata` | Déjà en place pour `name` / `description` / `projectId`. |
| `createLlmTemplateFromDescriptor`, `importLlmTemplate` | Les deux seuls chemins qui écrivent `templateJson` aujourd'hui. |
| L'établi (B6b + B6c1) | Aperçu du prompt effectif, exécution, Approve. L'éditeur écrit, l'établi vérifie. |
| B6c2, la bibliothèque de variables | Montre chaque variable résolue et son coût. C'est **la moitié découverte** de l'édition ; l'éditeur en est la moitié câblage. |

**Manque, à créer** : une Server Action qui met à jour `templateJson` d'une
ligne existante. Aucune n'existe.

## 3. Le mur structurel, à énoncer avant de découper

Un descripteur se compose de trois registres **fermés**, et cette fermeture est
délibérée :

- les **13 variables** (§3.1) — ce qu'on peut lire ;
- les **formes de rendu** — comment une variable devient du texte. Ce sont des
  fonctions TypeScript ; `runner.ts` *lève une exception* sur une forme
  inconnue ;
- les **7 actions d'écriture** (§3.2) — un `commit` invoque une Server Action
  nommée et relue, jamais un « écris cette ligne » générique. Sinon un template
  pourrait écrire n'importe où dans les 60 tables.

**Conséquence pour l'éditeur** : il ne compose que du vocabulaire existant.
Chaque contrôle est une liste déroulante sur une table fermée, jamais une
saisie libre. Étendre le vocabulaire — une variable, une forme de rendu, une
destination d'écriture — reste un ticket de code, par construction.

C'est ce qui rend l'éditeur **plus petit qu'il n'en a l'air** : il n'y a rien à
inventer, seulement à choisir.

## 4. Découpage proposé

### E1 — l'éditeur de ce qui fait la différence (recommandé)

Éditable : `name`, `expertise.role`, `expertise.system.blocks`,
`template.blocks`, `context.variables` (ajout / retrait / `userAdjustable`),
`intent.mode`, `intent.parameters` et **`intent.freeText`**.

**Correction du 2026-08-15.** La première version de ce cadrage omettait
`intent.freeText`. C'était une dérive, relevée par l'utilisateur : les trois cas
fondateurs (`docs/LLM_WORKSPACE_PRODUCT_VISION.md` §4) sont **tous** des
demandes qu'il formule en langage naturel, et `freeText` est la primitive qui
les porte. Un éditeur qui ne sait pas la déclarer produit des templates
incapables d'exprimer ce pour quoi l'atelier existe. Elle est donc éditable en
E1, sans discussion.

À noter : déclarer `freeText` dans un descripteur ne suffit pas — il faut aussi
que le contrôle de saisie existe côté exécution.

**Périmé, corrigé le 2026-08-18.** La phrase qui suivait disait que ce contrôle
n'était construit nulle part et qu'il fallait un ticket à part. C'était vrai le
2026-08-15 ; ça ne l'est plus. `LLMW.INTENT.FREETEXT.1` (B9a) l'a livré, puis
B9b et B11 l'ont exercé : l'établi rend le champ dès qu'un descripteur déclare
`intent.freeText` (`src/app/settings/llm-workflows/[templateId]/page.tsx`), et
quatre descripteurs le déclarent aujourd'hui — `shotPrompt.assist`,
`shotRetake.directed`, `assetRetake.directed`, `shot.insertDirected`. E1 n'a
donc qu'à rendre `freeText` **déclarable dans l'éditeur** ; l'exécution suit
toute seule. E1 est plus petit que ce cadrage ne le laissait croire.

Hérité de la duplication, **non éditable en E1** : `anchor`, `output`,
`commit`, `messages`, `preconditions`.

L'argument. Ces quatre-là forment un triangle couplé — B6c1 l'a rencontré de
front : `updateAssetDescriptionFieldInline` n'accepte un `commit` que si le
premier champ de sortie s'appelle `description` ou `notes`, et
`updateAssetDetailsInline` remplace cinq colonnes quand le descripteur n'en
déclare que trois. Y toucher demande des règles de cohérence explicites qui
n'existent nulle part encore. Les laisser hérités du built-in dupliqué rend E1
**structurellement sûr** : le template reste exécutable et applicable quoi que
l'utilisateur fasse dans l'éditeur.

Ce que ça donne concrètement : vous dupliquez `shotPrompt.assist`, vous gardez
son ancre (shot), sa sortie (`shotPrompt`) et son écriture — et vous réécrivez
entièrement **ce qu'on demande au modèle** et **quel contexte il reçoit**. C'est
l'essentiel de la valeur d'auteur.

Livrables :

- un module pur pour manipuler et valider une liste de blocs (ajout, retrait,
  réordonnancement, choix de forme de rendu filtrée par type de bloc), testé —
  c'est là que vivent toutes les décisions ;
- une Server Action de sauvegarde passant par `validateLlmTemplateJson` ;
- un écran d'édition ; l'ordre des blocs compte, donc monter/descendre au
  minimum ;
- un lien direct vers l'établi pour vérifier le prompt effectif après
  sauvegarde.

Ni schéma, ni migration, ni dépendance.

### E2 — ancre, sortie, commit, messages

Ajoute l'édition du triangle couplé, ce qui exige d'abord d'**écrire les règles
de cohérence** entre `anchor.entity`, `output.fields`, `output.target` et
`commit`, et de les refuser à la sauvegarde plutôt qu'au Run. Plus gros, plus
risqué. À ne pas mélanger avec E1.

### E3 — créer depuis zéro

La page `new/` du §5, avec des valeurs par défaut saines. Exige E2. Sans E2,
« depuis zéro » produit un template non applicable.

## 5. Coût, honnêtement

E1 est du même ordre que B6c1 — quatre modules, une action, un écran, un
fichier de tests purs — peut-être un peu plus, l'écran étant plus fourni que
tout ce que l'atelier a livré jusqu'ici. Aucune migration, ce qui retire le
poste le plus lourd de B6a.

Le vrai risque n'est pas technique, il est ergonomique : c'est la première
surface d'auteur du produit, et l'ordre des blocs est signifiant. Une passe
navigateur avec chaque chemin énuméré est obligatoire, comme pour B6c1.

## 6. Où le placer dans l'ordre

Après **B6c2**, dont il est la suite naturelle : §5.2 décrit la bibliothèque
comme « voir ce qu'un bloc produit avant de le câbler » — B6c2 livre le voir,
E1 livre le câbler.

Avant la **Phase C**, à mon avis de superviseur. La Phase C est du nettoyage :
elle rend le code plus propre et n'apporte rien de neuf à l'utilisateur. E1
fait passer l'atelier de « un endroit qui exécute les huit built-ins » à « un
endroit où l'utilisateur fabrique les siens ».

**Décision utilisateur. Rien n'est engagé par ce document.**
