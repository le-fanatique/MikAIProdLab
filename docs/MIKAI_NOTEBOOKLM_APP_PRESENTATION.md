# MikAI Production Lab

## Document source pour une vidéo de présentation

### Consignes éditoriales pour NotebookLM

Créer une vidéo de présentation en français, d’environ 5 à 7 minutes, destinée
aux artistes, réalisateurs, animateurs et petites équipes qui souhaitent
produire un film ou une animation avec des outils d’intelligence artificielle.

Le ton doit être créatif, cinématographique, clair et crédible. La vidéo ne
doit pas présenter MikAI comme un simple générateur de contenus ou comme un
produit qui remplace l’artiste. Elle doit montrer MikAI comme un environnement
de direction créative et de production, conçu pour préserver l’intention,
l’organisation, la continuité et le contrôle humain.

Privilégier les représentations visuelles suivantes :

- un projet qui évolue du pitch jusqu’au film ;
- une arborescence Project → Sequence → Shot → Asset ;
- des fiches de personnages et de décors ;
- une grille de storyboard ;
- une planche storyboard transformée en vidéo de séquence ;
- la validation manuelle des découpes vidéo ;
- le cadrage d’une scène dans Camera Lab ;
- une timeline de montage ;
- plusieurs Sequence Results assemblés en un Film Result.

Les fonctionnalités décrites comme « disponibles aujourd’hui » peuvent être
présentées comme existantes. Les éléments de la section « Vision et prochaines
évolutions » doivent être clairement annoncés comme la direction future du
produit.

---

## La promesse de MikAI

**MikAI Production Lab est le cerveau narratif, visuel et productif d’un film
assisté par intelligence artificielle.**

Il permet de structurer une idée, développer une histoire, organiser ses
séquences et ses plans, définir les personnages et les décors, préparer une
direction artistique, générer des storyboards et des vidéos, puis assembler
les résultats jusqu’à obtenir un film visionnable.

MikAI n’est pas une interface dans laquelle on écrit un prompt avant d’attendre
un résultat aléatoire. L’application aide l’artiste à raisonner en termes de
mise en scène :

- sujet et action ;
- cadrage et mouvement de caméra ;
- lumière et ambiance ;
- personnages, environnements et accessoires ;
- rythme, durée et continuité ;
- références visuelles ;
- intention narrative et émotionnelle.

L’intelligence artificielle intervient comme un assistant de préparation,
d’enrichissement et de génération. L’artiste reste la personne qui choisit,
édite, valide, approuve ou rejette chaque proposition importante.

---

## Le problème auquel répond MikAI

Produire un film avec plusieurs modèles d’IA crée rapidement de la
fragmentation. L’histoire se trouve dans un document, les prompts dans des
notes, les références dans différents dossiers, les images dans une galerie,
les vidéos dans un autre outil et les décisions de montage ne sont plus reliées
aux intentions de départ.

Cette fragmentation entraîne plusieurs difficultés :

- les personnages et les décors perdent leur cohérence ;
- les prompts sont réécrits manuellement pour chaque modèle ;
- les références ne sont pas associées à un rôle précis ;
- les versions approuvées sont difficiles à distinguer des essais ;
- une modification de montage peut écraser une décision narrative ;
- il devient difficile de comprendre comment un résultat a été produit ;
- l’artiste passe davantage de temps à gérer des fichiers qu’à diriger son
  film.

MikAI rassemble ces informations dans une structure de production unique et
traçable. L’objectif est de conserver le lien entre l’intention créative, les
entrées utilisées, les générations obtenues, les choix éditoriaux et le
résultat final.

---

## À qui s’adresse l’application ?

MikAI s’adresse principalement :

- aux réalisateurs et réalisatrices indépendants ;
- aux artistes et animateurs qui explorent les workflows génératifs ;
- aux auteurs qui souhaitent transformer un récit en projet visuel ;
- aux petites équipes de production ;
- aux créateurs qui utilisent ComfyUI, Ollama ou des modèles distants, mais
  veulent une couche de production plus accessible ;
- aux utilisateurs qui souhaitent garder leurs données et leurs médias en
  local.

Il n’est pas nécessaire d’être expert en prompt engineering. MikAI cherche au
contraire à traduire un vocabulaire créatif et cinématographique vers les
instructions techniques attendues par les modèles et les workflows.

---

## Le pipeline de production

Le parcours général de MikAI suit la logique naturelle d’un film :

```text
Pitch
→ Story
→ Outline
→ Sequences
→ Shots
→ Assets
→ Project Style
→ Storyboards et références
→ Générations vidéo
→ Montage des séquences
→ Sequence Results
→ Film Result
```

Cette structure permet de passer progressivement de l’idée abstraite à un
résultat audiovisuel, sans perdre les décisions prises au cours de la
production.

---

## 1. Construire l’histoire et le projet

Le **Story Workspace** est le point de départ narratif. L’utilisateur y
développe le pitch, l’histoire et ses notes de travail.

L’**Outline Builder** peut l’aider à générer une structure narrative. Cette
proposition reste modifiable et n’est appliquée qu’après une action explicite.
L’histoire peut ensuite être organisée en séquences, puis chaque séquence en
shots.

MikAI permet notamment :

- de créer et organiser les séquences ;
- de générer des propositions de shots ;
- de définir l’intention narrative de chaque Shot ;
- de documenter la continuité ;
- de préciser le contexte caméra ;
- d’extraire les personnages, décors, objets et autres Assets présents dans
  le récit ;
- de suggérer le casting de ces Assets dans les shots.

L’organisation n’est donc pas une simple liste de fichiers. Elle représente la
logique réelle du projet et les relations entre l’histoire, les plans et les
éléments visuels.

---

## 2. Définir les Assets et les références

Les **Assets** représentent les éléments réutilisables du monde : personnages,
créatures, lieux, accessoires ou objets importants.

Chaque Asset peut contenir :

- une description ;
- des notes ;
- des images de référence ;
- une identité visuelle ;
- des règles d’utilisation ;
- des variations interdites.

L’assistance LLM peut enrichir l’Asset Bible à partir des informations déjà
présentes. MikAI affiche d’abord une proposition éditable. L’utilisateur peut
la corriger avant de l’appliquer, ce qui évite tout écrasement silencieux.

Les références possèdent des rôles explicites. Une image peut, par exemple,
servir de référence de personnage, d’environnement, de style, de caméra, de
storyboard ou de première frame. Cette distinction aide MikAI à transmettre
chaque référence au bon endroit et avec la bonne intention.

---

## 3. Construire une direction artistique avec Project Style

Le workspace **Project Style** pose les premières fondations d’un langage
visuel partagé par tout le projet.

Il permet actuellement de travailler sur deux grands ensembles :

- **World & Design Language**, pour définir les principes du monde et du
  design ;
- **Visual Treatment**, pour définir le rendu, la couleur, la lumière, les
  textures et le traitement pictural.

Le style fonctionne comme un document de travail progressif. Les champs
peuvent rester vides : MikAI ne force pas l’utilisateur à remplir une bible
complète avant de commencer.

Lorsqu’une direction est suffisamment mûre, elle peut être publiée sous forme
de version immuable. Les anciennes versions restent conservées, ce qui permet
de suivre l’évolution de la direction artistique sans réécrire l’historique du
projet.

Les fondations techniques des références de style et des dossiers
**Creative Influence** sont également présentes. Leur interface visuelle
complète, appelée **Reference Board**, constitue la prochaine étape en cours de
développement et ne doit pas encore être présentée comme livrée.

---

## 4. Transformer l’intention en prompts exploitables

MikAI sépare le texte écrit par l’artiste du prompt finalement compilé pour un
workflow.

L’utilisateur peut voir les différentes sources qui participent au prompt,
éditer son intention et utiliser des actions telles que **Fill**, **Replace**,
**Append** ou **LLM Assist**.

Pour la génération au niveau d’une séquence, MikAI peut construire un package
Seedance déterministe et inspectable à partir des shots ordonnés. Le prompt
n’est donc pas une boîte noire : il reste possible de comprendre les éléments
qui seront envoyés au workflow avant de lancer la génération.

L’application prend en charge plusieurs fournisseurs LLM :

- Ollama en local ;
- OpenRouter ;
- les endpoints compatibles avec l’API OpenAI, notamment vLLM.

Un chat LLM est également disponible dans le panneau latéral pour accompagner
le travail créatif sans prendre toute la place dans l’interface.

---

## 5. Préparer visuellement la séquence dans Storyboard

Le **Storyboard Workspace** est un espace de production à part entière. Il
reste utile même lorsqu’aucun Shot ne possède encore d’image.

L’utilisateur sélectionne une Sequence et retrouve :

- tous ses shots dans une grille visuelle ;
- la liste dédupliquée des Assets présents dans la séquence ;
- les références disponibles pour chaque Asset ;
- les contrôles de génération et d’approbation.

Il peut générer une image storyboard pour chaque Shot, examiner les
compositions proposées et approuver uniquement celles qui correspondent à son
intention.

MikAI peut aussi produire une planche storyboard unique contenant tous les
shots dans leur ordre narratif. Cette planche devient un brouillon durable et
versionné après une sauvegarde explicite.

L’application sait ensuite détecter les différents panneaux de cette planche
et les transformer en brouillons storyboard associés aux shots. L’utilisateur
peut corriger les zones de découpe, appliquer des crops, retirer des titres ou
des légendes et consulter plusieurs diagnostics de détection.

Le storyboard devient ainsi un pont entre l’écriture et la génération vidéo :
il fixe le cadrage, la mise en scène, la lumière et la continuité avant de
produire du mouvement.

---

## 6. Générer une vidéo de séquence puis la redistribuer vers les shots

À partir d’une planche storyboard choisie, MikAI peut lancer un workflow vidéo
Seedance et enregistrer le résultat comme **Sequence Video Draft**.

Cette vidéo continue est conservée au niveau de la séquence. Elle ne remplace
pas automatiquement les vidéos des shots.

MikAI utilise ensuite FFmpeg pour proposer les points de séparation attendus.
Dans un workspace de review, l’utilisateur peut :

- prévisualiser les segments ;
- déplacer ou corriger les séparations ;
- vérifier l’association entre chaque segment et son Shot ;
- valider le plan de découpe.

Une fois ce plan validé, MikAI crée des clips physiques durables et les ajoute
comme vidéos candidates dans les shots correspondants.

Chaque candidat peut être examiné, approuvé ou supprimé. Une vidéo déjà
approuvée n’est jamais remplacée silencieusement. Cette étape illustre un
principe essentiel du produit : l’automatisation prépare les décisions, mais
l’utilisateur garde la maîtrise de leur application.

---

## 7. Explorer la caméra avec Camera Lab

**Camera Lab** permet d’explorer un cadrage à partir d’une image de référence.

Le workflow guidé suit trois étapes :

1. choisir une image autorisée du Shot et générer un Gaussian Splat au format
   PLY avec ComfyUI ;
2. charger cette scène dans le viewer 3D PlayCanvas, déplacer la caméra,
   ajuster le zoom et la profondeur, puis capturer un nouveau cadrage ;
3. utiliser le snapshot dans un workflow Gaussian-to-image.

La capture est effectuée à la résolution exacte de l’image source. Elle n’est
ajoutée au Shot qu’après confirmation et reçoit alors le rôle de référence
`camera`.

Camera Lab permet donc de rechercher un nouveau point de vue dans une
reconstruction spatiale, sans perdre la relation avec le Shot et son image
d’origine.

---

## 8. Générer et examiner les contenus

MikAI intègre la bibliothèque de workflows ComfyUI pour les générations
d’images, de keyframes et de vidéos.

L’application prend en charge :

- la sélection d’un workflow ;
- les workflows par défaut ;
- la détection de leurs entrées dynamiques ;
- les prompts, images et paramètres configurables ;
- l’upload d’images ;
- la génération et la régénération ;
- les générations en batch ;
- le suivi des jobs ;
- l’examen et l’approbation des résultats.

Le lecteur vidéo est adapté à la review frame par frame. Il comporte des
contrôles audio et permet de capturer manuellement une frame pour la réutiliser
comme référence.

MikAI conserve la provenance nécessaire pour relier un résultat à son workflow
et à ses entrées, au lieu de traiter chaque média comme un fichier isolé.

---

## 9. Monter une séquence dans Basic Editorial

Le mode **Basic Editorial** est un outil de montage intégré, volontairement
léger.

Il permet :

- d’organiser les occurrences de shots ;
- d’ajuster les trims et les durées ;
- de créer des gaps, placeholders ou black holds ;
- de prévisualiser rapidement la séquence ;
- d’insérer un nouveau Shot à un emplacement précis ;
- de publier un résultat vidéo de la séquence.

Les données de montage restent séparées des données narratives du Shot. Un
trim dans la timeline ne modifie donc pas silencieusement l’intention de
production.

Basic Editorial ne cherche pas à remplacer Premiere Pro ou DaVinci Resolve.
Il répond aux besoins rapides de bout-à-bout, de rythme et de validation.

---

## 10. Passer au montage avancé avec OpenReel

Lorsque la séquence demande un travail plus riche, MikAI peut l’ouvrir dans
**OpenReel**, son sidecar de montage avancé.

Le bridge permet notamment :

- d’envoyer la structure éditoriale vers OpenReel ;
- d’insérer un nouveau Shot MikAI au playhead ;
- de valider et appliquer des corrections de timing ;
- de pousser volontairement une durée de production vers MikAI ;
- de publier un résultat avancé dans MikAI ;
- de recharger les données en cas de conflit.

Des snapshots et une protection anti-stale empêchent l’application
silencieuse de modifications construites sur une ancienne version.

OpenReel reste une surface de montage. MikAI demeure la source de vérité pour
la narration, les Assets, les intentions de production et les générations.

---

## 11. Publier des Sequence Results et assembler le Film Result

Le résultat d’un montage est publié sous forme de **Sequence Result**, qu’il
provienne de Basic Editorial ou d’OpenReel.

Les résultats sont versionnés. L’utilisateur peut conserver les anciennes
versions, publier un nouveau résultat et choisir celui qui est actif.

Les Sequence Results actifs du projet sont ensuite assemblés dans l’ordre pour
produire un **Film Result** visionnable.

```text
Basic Editorial ou OpenReel
→ Sequence Result

Sequence Results actifs
→ Film Result
```

Si un résultat de séquence change, MikAI signale que le Film Result existant
n’est plus à jour. Il ne réécrit pas automatiquement une ancienne sortie.

Cette architecture permet de progresser par séquence tout en conservant une
vision permanente du film complet.

---

## Local-first et maîtrise des données

MikAI est conçu comme une application local-first :

- les projets et réglages sont stockés dans une base SQLite locale ;
- les uploads et résultats restent dans les espaces de stockage contrôlés par
  l’utilisateur ;
- Ollama et ComfyUI peuvent fonctionner entièrement en local ;
- des fournisseurs distants peuvent être configurés lorsque l’utilisateur le
  souhaite ;
- FFmpeg est intégré pour les opérations vidéo ;
- MikAI et OpenReel peuvent être lancés ensemble.

Cette architecture permet d’adapter la production à une station personnelle,
un réseau local ou une machine GPU distante, sans imposer une plateforme cloud
unique.

---

## Personnalisation de l’environnement

L’interface propose des thèmes **Default** et **Custom**.

L’utilisateur peut personnaliser :

- la palette de couleurs ;
- les polices ;
- le logo ;
- la couleur de la TopBar ;
- des textures décoratives ;
- un thème importé ou collé au format JSON.

Cette personnalisation aide MikAI à devenir un véritable environnement de
studio plutôt qu’une interface générique.

---

## Ce qui différencie MikAI

### Une approche centrée sur le film

Le point de départ n’est pas le modèle d’IA, mais le projet, l’histoire, les
séquences et les shots.

### Une continuité entre les étapes

Les Assets, références, prompts, storyboards, générations et résultats restent
reliés aux mêmes objets de production.

### Un contrôle humain explicite

Les propositions importantes sont examinées avant application. Les résultats
approuvés ne sont pas remplacés automatiquement.

### Une séparation claire entre narration et montage

Les décisions éditoriales ne réécrivent pas silencieusement les intentions
narratives ou les objectifs de production.

### Une production versionnée et traçable

Les storyboards de séquence, vidéos de séquence, Sequence Results, Film
Results et versions de Project Style peuvent évoluer sans effacer leur
historique.

### Une passerelle entre langage artistique et contraintes techniques

L’utilisateur parle de personnages, de lumière, de caméra, de rythme et de
continuité. MikAI transforme progressivement cette intention en packages
adaptés aux workflows.

---

## Exemple de parcours utilisateur

Une réalisatrice souhaite produire un court métrage d’animation.

1. Elle écrit son pitch et développe son histoire dans Story Workspace.
2. Elle génère une proposition d’outline, la corrige puis la transforme en
   séquences.
3. Elle crée les shots et extrait les personnages, décors et accessoires sous
   forme d’Assets.
4. Elle enrichit les Asset Bibles et sélectionne les références visuelles.
5. Elle définit les principes du monde et du traitement visuel dans Project
   Style, puis publie une première version.
6. Dans Storyboard, elle génère et approuve les compositions des shots.
7. Elle produit une planche complète de la séquence et corrige l’extraction de
   ses panneaux.
8. Elle génère une vidéo continue de la séquence.
9. MikAI détecte les séparations ; elle les révise puis pousse les clips comme
   candidats vers les shots.
10. Pour un Shot difficile, elle utilise Camera Lab afin d’explorer un autre
    cadrage et de créer une référence caméra.
11. Elle assemble les meilleurs clips dans Basic Editorial ou OpenReel.
12. Elle publie un Sequence Result.
13. Les résultats actifs de toutes les séquences sont assemblés en un Film
    Result.

À tout moment, elle peut revenir à l’intention narrative, comprendre les
sources d’un résultat et produire une nouvelle version sans détruire la
précédente.

---

## Vision et prochaines évolutions

La vision à long terme est de faire de **Project Style** un langage visuel
complet et réutilisable dans toute la production.

Les évolutions prévues comprennent :

- un Reference Board visuel au niveau du projet ;
- des dossiers Creative Influence ;
- une recherche Web contrôlée et sourcée ;
- des propositions de règles de style toujours soumises à validation ;
- des variations complètes de Project Style par Sequence ;
- l’injection automatique de la version de style publiée dans les prompts ;
- l’alignement assisté des Assets avec la direction artistique ;
- un espace Look Development pour comparer des tests image et vidéo.

D’autres perspectives incluent l’assistance transversale à la réalisation,
l’amélioration du round-trip avec OpenReel, l’audio du film et des exports
finaux plus complets.

Ces éléments représentent la direction du produit. Ils ne doivent pas être
confondus avec les fonctionnalités déjà disponibles.

---

## Conclusion proposée pour la vidéo

MikAI Production Lab cherche à rendre la production générative plus cohérente,
plus lisible et plus cinématographique.

L’application ne demande pas à l’artiste de penser comme une API ou comme un
prompt engineer. Elle lui permet de penser comme un auteur, un directeur
artistique, un chef opérateur, un monteur et un réalisateur.

De l’histoire au storyboard, du Shot à la Sequence, de la génération au
montage, chaque étape reste reliée à une intention et soumise à un choix
humain.

**MikAI n’est pas seulement un endroit où générer des images et des vidéos.
C’est un laboratoire de production pour construire un film.**
