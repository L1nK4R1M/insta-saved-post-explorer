# Médias Cloudflare R2

Le bucket de médias est `insta-media`. Le site ne reçoit aucune clé secrète R2 :
il utilise uniquement le domaine public du bucket.

Configuration attendue :

```dotenv
MEDIA_PUBLIC_BASE_URL="https://pub-11ac111bad494fc2aa688c23c72d660a.r2.dev/"
MEDIA_PATH_PREFIX="originals"
```

À la lecture, l'application construit une URL publique à partir de
`MEDIA_PUBLIC_BASE_URL`, `MEDIA_PATH_PREFIX` et du `source_path` du média. Les
clés suivent les conventions `CODE.jpg` (photo ou affiche vidéo), `CODE.mp4`
(vidéo) et `CODE_X.jpg` ou `.mp4` (carrousel, index commençant à 1). Si
la configuration est absente, l'ancienne URL du JSON reste utilisée comme
secours.

L'adresse `<account>.r2.cloudflarestorage.com` est l'endpoint S3 authentifié et
ne convient pas à l'affichage direct dans un navigateur. Le sous-domaine
`r2.dev` convient aux tests. Pour la production, connecter un domaine
personnalisé au bucket permet d'utiliser le cache et les contrôles Cloudflare.

Pour une vidéo, l'application déduit l'affiche `.jpg` à côté du fichier `.mp4`.
