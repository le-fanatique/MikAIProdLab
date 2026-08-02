# Project Style - Original User Story

Captured: 2026-07-23

Source: original user-authored Project Style journey supplied as an attachment
before development handoff.

## Purpose

This document preserves the original product intent in the user's own words.
Spelling, grammar, terminology and examples are intentionally not normalized.

Later product decisions refine this source without replacing it:

- `docs/PROJECT_STYLE_MVP_DECISIONS.md`;
- `docs/PROJECT_STYLE_MVP_SPEC.md`.

If an implementation detail appears ambiguous, return first to this journey to
understand the user problem, then apply the accepted decisions and the detailed
specification.

## Original User Story

1. je viens de finir d'ecrire la narration de l'histoire, sequence shot grace au Story Workspace

2. toujour dans la story workspace, je vais generer les assets basé sur les shots et l histoire grace à "Extract Asset drafts", et je vais faire un "enhance selected Assets" pour pouvoir ameliorer la description des assets par rapport à l'histoire

3. je part dans la partie asset, et je vais commencé à vouloir m'interesser a developper l'asset bible des asset par rapport à la description et note

4. c est à ce moment là que je vais devoir commencer à penser project style. C est là que je m'aperçois du manque, si je lance ma generation je vais avoir quelque chose qui convient à la description, mais les resultat seront de style variable (par exemple cela va me sortir du photorealist, ou un style graphique pour enfant...) et de registre variable (quand je dit registre, je veux dire par exemple, que j ai la description d'un pirate injecté, ok cela va me proposer un resultat, mais rien ne precise, si c est un pirate medieval, steampunk, sci-fi). C est informations devrait etre defini à echelle du projet, car se repercuter sur tout les assets et les shots pour avoir une unité de style.

5. Je decide donc, avant de generer mes assets de passer dans un Workspace de style project

6. Comme à mon habitude je dois reflechir en premier lieu à mon univers, qu elle est l epoque visé, les codes qui en découle (par exemple je suis dans un univer sci-fi, plutot hard sf, ou plus cyber punk, j aimerai un univer à la blade runner....) , ca sera un truc plutot dramatique, comic.... Voila déjà ce que je me pose comme premiere question. C'est vrai que si je sait le verbalisé c est cool, mais de tout de façon pour me nourir , je vais aller mettre de la ref pour nourir ce cadre, c est à dire que je vais aller loader des ref visuel d'internet ou autre, pouvoir dire ce qui m'interesse dans chaque ref, c est les cadrages, l eclairage, les design des perso, peut etre que j'adore Roger deakins, et qu en fait ce que je veux  c est un traitement de la lumiere comme dans ses film, mais la richesse des cadrages et de la realisation, j aime plutot ce que faire Robert Rodrigez, alors du coup comment avoir quelque chose de factuelle à donner pour nourir le projet?! surement essayer de trouver des infos rationnalisant leurs approche, et les stocker dans ce workspace.....

7. Bon voila mon univer est buildé, c est cool, maintenant parlons du traitement graphique. peut etre que j'adore style de Arcane, fait par le studio Fortiche, peut etre que c est plus un style à la TMNT par Mikros Animation, pour ca j ai besoin de le verbalisé, et j ai besoin de droper des ref de traitement graphique, avec evidement une precision sur ce qu il m'interesse dans dans chaque image. Mais aussi je pourrait la faire brute force, par exemple, j'aime trop ce qui a été fait sur "spiderman into the spiderverse", donc en fait je vais mettre plein d'image, et je vais avoir envi de laisser l'ia analyser toute les images pour y voir les points commun de style visuelle. On en revient à ce que je disait dans mes documents avec des criteres du genre:Il doit décrire un langage visuel structuré : identité visuelle globale ;
   palette et color script ;
   ambiance, lumière et direction photographique ;
   style de rendu : réaliste, stylisé, pictural, graphique ;
   textures, hachures, niveaux de détail ;
   traitement des ombres, lumières et spéculaires ;
   règles de design des personnages ;
   règles de décors et de set dressing ;
   contraintes négatives : ce qui doit être évité ;
   références visuelles et directives d’analyse ;
   règles de caméra, composition et mouvement ;
   cohérence entre Assets, Shots et Storyboard.

8. Une fois que j'ai une espece de regle moyenne qui emmerge de tout ces criteres d'analyse. Peut  etre que j ai envi de switcher un truc, donc je viendrait editer ces termes, ou alors demandé à un assistant plus tard d'ajuster en consequence toutes la data,basé sur mon changement que je veux.

9. maintenant que cela est loquer, je pense qu il faut aussi un look of picture de test, on vas pouvoir avoir dans ce workspace, un bench de test de look of picture, ou on pourra mettre un prompt generé en prenant toutes ces informations composé corretement, le sujet et l'action sera random ou inspiré de l'histoire , et apres on verra ce qui sort, si les resultat de text2video nous parraisse une bonne base

10. maintenant que tt est locker sur le style j ai envi de revenir dans mes assets, en premier lieu, je veux generer un content , qui prendra les elements comme précedent, mais je m'attend à ce que le prompt compiler, inject toute les regles de project style locké dans le project style workspace. Je m'attend à ce que cela fonctionne pas mal.... mais, j ai le présentiment qu on va avoir un probleme de coherence parfois entre le project style et la visual identity utilisé pour le prompt. En effet, par exemple, quand j ai généré ma description et mon asset bible, c etait basé sur l'histoire, donc la descrition donne des informations plausible, mais ne prend pas en compte forcement le style. Un cas concret serai: mon histoire parle d'un facteur dans l'espace, l asset bible va surement decrire l'uniforme, et elements des vetements, mais n'aura pas enhancé la description en prenant en compte par exemple qu on est sur de la  science fiction cartoon steampunk. Donc on aura un prompte avec une description sobre , avec au bout le pompt de style ajouté à la fin, alors qu'il aurait été plus fun de ce dire que dès la description, le facteur à un sac à dos en forme de tortue bionique cuivré qui fait de la vapeur dans lequel il met ses lettres. Donc il faudrait quand meme avoir la capacité de faire les ajustement de coherence story et project style pr les description

11. Une fois que tout mes assets sont generé en  image, je dois faire de meme dans les shots, je dois donner le prompt du shot, et il doit prendre en compt le prompt de project style.

## Subsequent User Clarifications

The following clarifications were accepted after the original story:

- `World & Design Language` and `Visual Treatment` are two distinct pillars.
- Creative Influences need an Internet-assisted, source-grounded auto-feed.
- Every Style field is optional; empty fields must never be compiled.
- The product must remain useful with only a small fraction of the available
  fields populated.
- A Sequence inherits the active Project Style by default.
- A Sequence can replace that inherited Style once for all its Shots.
- Shots have no separate Style override in the MVP.
- The MVP has no semantic clash detector or style-conflict warning.
