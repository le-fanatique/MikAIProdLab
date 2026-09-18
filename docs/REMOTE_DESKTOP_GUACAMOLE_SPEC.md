# Bureau distant dans le navigateur — cahier des charges

**Statut : en attente, mis de côté par l'auteur le 2026-09-18.** Spécification
seulement. Aucun ticket n'est préparé, aucun conteneur n'est lancé, aucun code
n'est écrit. Le développement aura lieu sur un go explicite de l'auteur.

Écrit le 2026-09-18, après la mise en service du tunnel Cloudflare nommé
`mikai` sur le domaine `creativeprodlab.org`. **L'hôte `desk.creativeprodlab.org`
existe déjà** : il est routé, il répond `502`, et il n'attend que le service
décrit ici.

---

## 1. Le besoin

L'auteur veut piloter cette workstation Windows 10 Pro depuis **un poste Linux
d'entreprise sur lequel il n'a aucun droit d'installation**. Le poste distant
ne dispose donc que d'un navigateur : pas de client VPN, pas de client RDP, pas
de paquet à installer, rien à exécuter.

Ce n'est pas un confort. C'est la seule façon d'atteindre l'environnement
complet — ComfyUI, InvokeAI, les fenêtres natives, le système de fichiers —
là où le tunnel ne publie que des applications web.

## 2. Ce qui est déjà en place, vérifié le 2026-09-18

Constats mesurés sur cette machine, pas supposés :

| Élément | État | Vérification |
| --- | --- | --- |
| Édition Windows | **Windows 10 Professionnel** | `Win32_OperatingSystem.Caption` |
| Serveur RDP | **actif** | `fDenyTSConnections = 0` |
| NLA (authentification avant session) | **désactivée** | `UserAuthentication = 0` |
| Docker | **installé** | `C:\Program Files\Docker\Docker\resources\bin\docker.exe` |
| `cloudflared` | **installé, tunnel nommé en service** | `tunnel run mikai` |
| Hôte `desk.creativeprodlab.org` | **routé, répond 502** | `cloudflared tunnel route dns` |

Le fichier `C:\Users\HYPERWORKED\.cloudflared\config.yml` contient déjà la
règle d'entrée :

```yaml
  - hostname: desk.creativeprodlab.org
    service: http://localhost:8080
```

Donc : **dès qu'un service écoute sur `localhost:8080`, l'hôte répond.** Rien
à changer côté tunnel.

## 3. Le montage retenu

**Apache Guacamole**, passerelle HTML5, en Docker sur cette machine.

```text
poste Linux (navigateur seul)
        |  HTTPS 443
   Cloudflare Access          ← authentification, obligatoire (§6)
        |
   Cloudflare Tunnel "mikai"
        |
   desk.creativeprodlab.org -> localhost:8080  (guacamole)
        |
        +-- guacd -> RDP  vers host.docker.internal:3389
        +-- guacd -> VNC  vers host.docker.internal:5900
```

Trois conteneurs : `guacd` (le démon qui parle RDP/VNC), `guacamole` (l'interface
web), et une base pour les comptes et les connexions — PostgreSQL ou MariaDB,
au choix, l'image Guacamole génère le script d'initialisation.

**Aucun port n'est publié hors de la machine.** Guacamole écoute sur
`localhost:8080`, le tunnel s'en charge. Les ports 3389 et 5900 restent en
écoute locale et ne sont jamais exposés.

## 4. RDP ou VNC — les deux, et voici pourquoi

C'est la décision structurante de ce chantier, et elle n'est pas tranchée par
la performance.

**RDP** ouvre une **session distincte** et **verrouille l'écran physique** de la
workstation. C'est le plus fluide, le plus confortable, avec presse-papiers et
transfert de fichiers. Mais l'affichage y est virtuel : une application
graphique lancée avant la connexion ne s'y retrouve pas, et certaines
applications accélérées se comportent différemment dans ce contexte.

**VNC** recopie la **console physique** — l'écran réel, tel qu'il est, avec
ComfyUI et InvokeAI déjà ouverts dessus. Rien ne se verrouille, rien ne change
de contexte graphique. En contrepartie, c'est moins fluide et plus pauvre en
fonctions.

**Décision : déclarer les deux connexions dans Guacamole**, et choisir selon
l'usage — RDP pour travailler, VNC pour surveiller ce qui tourne déjà. Le coût
est un serveur VNC à installer (TightVNC ou TigerVNC en service Windows) ; le
gain est de ne pas avoir à choisir une fois pour toutes.

## 5. Ce qu'il reste à faire, quand le chantier reprendra

1. **Réactiver NLA** — `UserAuthentication = 1` dans
   `HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp`,
   puis redémarrer le service `TermService`. À faire **avant** d'exposer quoi
   que ce soit. Guacamole sait s'authentifier avec NLA, à condition que la
   connexion porte les identifiants et le domaine.
2. **Installer un serveur VNC** en service Windows, en écoute sur `127.0.0.1`
   uniquement, avec mot de passe.
3. **Écrire le `docker-compose.yml`** : `guacd`, `guacamole`, la base. Utiliser
   `host.docker.internal` pour atteindre l'hôte depuis les conteneurs — sous
   Docker Desktop Windows, c'est le nom qui résout vers la machine.
4. **Créer les deux connexions** dans l'interface Guacamole, et **changer le
   mot de passe du compte `guacadmin` par défaut** — c'est la première chose
   qu'un scanner essaie.
5. **Créer la politique Access** devant `desk.creativeprodlab.org` (§6).
6. **Vérifier depuis le poste d'entreprise**, pas seulement en local : c'est le
   seul test qui compte (§7).

## 6. Sécurité — non négociable

- **Cloudflare Access devant `desk.`**, avec la même politique que les autres
  hôtes. Sans elle, l'URL expose un bureau Windows complet à qui la devine.
  Une interface de bureau distant publique est une porte d'entrée, pas un
  confort ;
- **jamais de redirection de port** sur la box vers 3389 ou 5900. Ces ports
  sont scannés en permanence. Le tunnel est le seul chemin ;
- **NLA activée** avant toute exposition ;
- **compte `guacadmin` par défaut changé** dès la première connexion ;
- les identifiants RDP/VNC stockés dans Guacamole sont en base : cette base
  reste locale et ne quitte jamais la machine.

## 7. Le risque qui décidera de la réussite

**Guacamole dépend des WebSockets.** Le tunnel Cloudflare les transporte, mais
**les proxys d'entreprise les coupent fréquemment**. Symptôme attendu : la page
de connexion s'affiche, l'authentification passe, et l'écran du bureau reste
noir.

C'est le même genre de mur que celui documenté dans `docs/PROJECT_STATE.md`
(section « Pourquoi les écrans se figent derrière un tunnel ») : le serveur
livre, le réseau intermédiaire filtre. **Il faut donc tester depuis le poste
d'entreprise avant d'investir dans la configuration fine** — une demi-heure de
mise en place suffit pour savoir si le chemin est praticable.

Si les WebSockets sont coupées, les replis sont, dans l'ordre :

- **Chrome Remote Desktop** — installation sur cette machine uniquement, accès
  par `remotedesktop.google.com`. Souvent autorisé là où un domaine personnel
  ne l'est pas, parce que le domaine Google est classé ;
- **un VPS avec Guacamole** hébergé dessus, la workstation s'y connectant par
  WireGuard. Ça déplace le problème sans le résoudre si le filtrage porte sur
  les WebSockets elles-mêmes ;
- **renoncer au bureau distant** et s'en tenir aux applications web publiées
  par le tunnel, qui, elles, fonctionnent déjà.

## 8. Ce que ce chantier n'est pas

- **Ce n'est pas une dépendance de MikAI.** Aucune ligne du dépôt ne change.
  C'est de l'outillage d'accès, au même titre que le tunnel ;
- **ce n'est pas un ticket au sens du protocole Opus** tant que l'auteur ne le
  rouvre pas : pas de `supervised_task.md`, pas d'exécuteur, pas de preuve par
  mutation. C'est de la configuration d'infrastructure, vérifiée par l'usage ;
- **ce n'est pas urgent.** Les trois applications web sont accessibles et
  authentifiées ; le bureau distant est un supplément.

## Sources et état

- Tunnel : `C:\Users\HYPERWORKED\.cloudflared\config.yml`, tunnel `mikai`,
  identifiant `ce5cf827-37e5-47ba-a8e9-9ca1c2ff8819`.
- Contexte du filtrage réseau et de ses conséquences sur l'application :
  `docs/PROJECT_STATE.md`, section « Pourquoi les écrans se figent derrière un
  tunnel — cause mesurée le 2026-09-18 ».
