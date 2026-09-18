# Accès distant à MikAI — installation en service, 2026-09-18/19

**Statut : en service.** Ce document décrit une installation qui tourne, pas un
projet. Il existe parce que trois jours de développement ont été décidés par
des contraintes réseau, et que rien de tout cela n'est déductible du code.

Le lanceur correspondant, `start-remote.bat`, est **volontairement non suivi
par git** : il code en dur des chemins propres à la machine de l'auteur. Ce
document est la partie qui se conserve.

---

## 1. Ce que l'installation résout

L'auteur accède à MikAI depuis **un poste Linux d'entreprise où il n'a aucun
droit d'installation**. Donc : navigateur uniquement, HTTPS sur 443, pas de
client VPN, pas de client RDP.

Les tunnels éphémères `*.trycloudflare.com` utilisés au début **ne conviennent
pas**, pour une raison mesurée et non supposée — voir `docs/PROJECT_STATE.md`,
section « Pourquoi les écrans se figent derrière un tunnel ». Résumé : le
serveur livre HTML et chunks correctement à travers le tunnel, mais le
navigateur refuse les ressources du domaine (`ERR_BLOCKED_BY_CLIENT`). React ne
s'hydrate jamais, donc **tout handler React est mort**, tandis que le rendu
serveur et les `<form action={serverAction}>` continuent de fonctionner.

## 2. L'installation

Domaine `creativeprodlab.org`, acheté chez Cloudflare Registrar. Extension
choisie pour sa réputation : les extensions bradées (`.bid`, `.download`,
`.win`, `.top`, …) sont filtrées **par catégorie entière** dans les
environnements d'entreprise, ce qui reproduirait le problème d'origine.

Un seul tunnel nommé, `mikai`, identifiant
`ce5cf827-37e5-47ba-a8e9-9ca1c2ff8819`, configuré dans
`C:\Users\HYPERWORKED\.cloudflared\config.yml` :

| Hôte | Service local | Protection |
| --- | --- | --- |
| `mikai.creativeprodlab.org` | `localhost:3000` | Cloudflare Access, code e-mail |
| `invoke.creativeprodlab.org` | `127.0.0.1:9090` | Cloudflare Access, code e-mail |
| `desk.creativeprodlab.org` | `localhost:8080` | Cloudflare Access, code e-mail |
| `jeu.creativeprodlab.org` | `localhost:7001` | mot de passe applicatif |

**Aucun port n'est ouvert sur la box.** Les services écoutent en local, le
tunnel sort en connexion sortante.

**Access n'est pas une option pour `invoke.`** : en mode mono-utilisateur,
l'API d'InvokeAI n'exige aucune authentification. Sans politique devant elle,
l'URL donne la galerie, la suppression d'images et le GPU à qui la connaît.
Vérification d'un accès anonyme : la bonne réponse est `302` vers
`…cloudflareaccess.com/cdn-cgi/access/login/…`, sur la racine **et** sur
`/api/v1/app/version`.

## 3. Trois pièges rencontrés, et ce qu'ils coûtent

### 3.1 Deux instances d'InvokeAI effacent les rendus l'une de l'autre

Symptôme :

```
RuntimeError: Parent directory F:\AI\Invoke\outputs\tensors\tmpXXXXXXXX does not exist.
```

Deux instances partagent `INVOKEAI_ROOT`, et chacune **nettoie les dossiers
temporaires qu'elle trouve** — y compris celui que l'autre est en train
d'écrire. Le rendu échoue au milieu.

La corrélation temporelle accusait le tunnel ; le coupable était un lanceur
sans garde. **Un lanceur doit tester le port avant de démarrer un service**,
pas son propre souvenir de l'avoir démarré.

**Et tuer le doublon ne suffit pas — il faut redémarrer Invoke.** Le détail qui
a coûté une heure, le 2026-09-19 : InvokeAI crée **un dossier de tenseurs par
démarrage du serveur, pas un par rendu**. Le serveur garde ce chemin pour toute
sa vie. Une fois le dossier supprimé par le nettoyage de démarrage d'une
seconde instance, le serveur survivant est condamné : **chaque rendu échoue,
avec toujours le même nom `tmpXXXXXXXX`**, y compris sur une génération
entièrement neuve.

C'est ce nom identique qui donne le diagnostic. Un nom qui se répète ne
désigne pas un rendu qui échoue — il désigne un serveur qui pointe dans le
vide. Le message d'erreur, lui, ne dit rien de tout cela, et les journaux non
plus.

Symptôme voisin, même origine : après un redémarrage propre, le dossier
présent dans `outputs\tensors` porte le nom du nouveau serveur, et les
orphelins ont disparu. C'est la vérification la plus rapide.

### 3.2 `tasklist | find` échoue en silence quand Git est dans le PATH

`find` résout alors vers la version Unix, qui ne comprend pas `/i` :

```
find: '/i': No such file or directory
```

La garde passe à côté, et un second `cloudflared` démarre sur le même tunnel —
ce qui produit des erreurs d'origine intermittentes, difficiles à rattacher à
leur cause. Tout test de présence de processus dans un `.bat` sur cette machine
passe donc par PowerShell (`Get-CimInstance Win32_Process`), jamais par
`tasklist | find`.

### 3.3 « Rien n'écoute » n'est pas une panne

`npm run prod:all` (`scripts/run-prod-lab.mjs`) compile MikAI, **puis** le
sidecar OpenReel, **puis seulement** démarre les deux serveurs. Pendant
plusieurs minutes, ni `3000` ni `5173` ne répondent, et OpenReel arrive en
dernier. C'est délibéré : une compilation ratée ne doit jamais laisser démarrer
un serveur sur une sortie périmée.

Deux `next build` simultanés se bloquent l'un l'autre
(`⨯ Another next build process is already running`) et **aucun serveur ne
démarre**. D'où la garde correspondante dans le lanceur.

## 4. Règles qui survivent à cette installation

- **MikAI se lance en production pour un usage distant**, jamais en `dev` : le
  mode dev ouvre `/_next/webpack-hmr`, une WebSocket que les proxys
  d'entreprise coupent, et sert des centaines de chunks non minifiés ;
- **tout mécanisme qui porte une donnée garde un chemin sans JavaScript.**
  Cette règle a été écrite après l'incident d'hydratation, et elle reste vraie
  quelle que soit la cause du filtrage — antivirus, proxy d'entreprise,
  bloqueur de publicités, ou simple chunk qui ne charge pas ;
- **un service exposé sans authentification propre passe derrière Access**, pas
  derrière l'obscurité d'une URL. Une adresse stable est plus devinable qu'une
  adresse jetable, donc la mise en service d'un domaine **augmente** le risque
  tant que la politique n'existe pas.

## 5. Ce qui reste ouvert

- **`desk.` répond 502** : le bureau distant n'est pas installé. Spécification
  complète et mise de côté dans `docs/REMOTE_DESKTOP_GUACAMOLE_SPEC.md` ;
- **NLA est désactivée** sur le serveur RDP de la workstation
  (`UserAuthentication = 0`). À réactiver avant toute exposition d'un bureau
  distant ;
- **aucun inventaire n'a été fait** des écrans dont l'interactivité dépend d'un
  handler React. Deux ont été traités parce que l'auteur les a nommés.
