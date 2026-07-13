# Synchronisation des nouveaux posts Instagram

La synchronisation est réservée au mode administrateur. Le site crée une session
limitée, puis l’extension Chrome utilise la session Instagram déjà ouverte dans le
navigateur. Les cookies Instagram ne quittent jamais l’extension.

## Flux

1. Cliquer sur **Actualiser les posts** à côté de **Importer JSON**.
2. La web app transmet les identifiants et codes de posts déjà présents dans la DB.
3. L’extension parcourt le flux sauvegardé du plus récent au premier post déjà connu.
4. Chaque image ou vidéo nouvelle est envoyée directement vers R2 avec une URL PUT présignée.
5. Le serveur vérifie les objets R2, puis crée ou met à jour le post dans PostgreSQL.
6. Un post déjà présent est mis à jour ; il n’est jamais dupliqué.

Les objets sont écrits sous `originals/<username>/CODE.ext` ou
`originals/<username>/CODE_X.ext` pour les carrousels. Les affiches vidéo utilisent
le suffixe `_thumb`.

## Variables Vercel

Ajouter en Production :

```dotenv
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET_NAME=insta-media
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Les quatre variables sont uniquement serveur. Ne jamais utiliser le préfixe
`NEXT_PUBLIC_` pour les identifiants R2.

Créer un jeton API Cloudflare limité au bucket `insta-media`, avec les droits de
lecture et écriture des objets. L’application a besoin de `PutObject` et
`HeadObject`, pas de droits d’administration du compte.

## Installation de l’extension

1. Décompresser `outputs/insta-saved-sync-v4.2.1.zip` dans un dossier permanent.
2. Ouvrir `chrome://extensions`.
3. Activer **Mode développeur**.
4. Cliquer **Charger l’extension non empaquetée**.
5. Sélectionner le dossier qui contient directement `manifest.json`.
6. Ouvrir Instagram et vérifier que le compte est connecté.
7. Recharger la page Insta Post Explorer après toute mise à jour de l’extension.

Dans l’onglet **Work from file**, les filtres par type, période et compte sont
appliqués avant le téléchargement. L’estimation affichée indique le nombre de
posts et de fichiers médias réellement sélectionnés.

Pour conserver l’archive IndexedDB et les réglages d’une version précédente,
remplacer les fichiers dans le même dossier d’extension puis cliquer sur
**Recharger** dans `chrome://extensions`. Ne pas installer une deuxième copie dans
un autre dossier.

La première synchronisation utilise les identifiants et les codes extraits des URL
déjà présents dans la DB pour amorcer l’index incrémental. Les anciens imports sans
`external_id` restent donc détectables. Les upserts par URL canonique constituent
une seconde protection contre les doublons.

## Limites opérationnelles

- Instagram peut imposer un `429`, un challenge ou une reconnexion. L’extension se
  met alors en pause au lieu de contourner la protection.
- Les URL CDN Instagram expirent : ne pas laisser une synchronisation en pause
  plusieurs jours avant l’upload.
- Les médias sont limités à 250 Mo par objet et 20 médias par post.
- La classification `main_theme` et les tags éditoriaux ne sont pas inventés par
  l’extension. Ils restent modifiables ensuite par l’administrateur.
