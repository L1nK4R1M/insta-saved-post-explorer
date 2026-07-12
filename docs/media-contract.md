# Contrat média provisoire

Ce contrat prépare l’application au prochain export sans imposer encore son
format définitif. Les anciens exports restent valides.

## Forme recommandée

```json
{
  "post_url": "https://www.instagram.com/p/CODE",
  "username": "auteur",
  "content_type": "carousel",
  "media": [
    {
      "type": "image",
      "url": "https://cdn.example/media-01.jpg",
      "source_path": "auteur/CODE/media-01.jpg",
      "thumbnail_url": "https://cdn.example/media-01-thumb.jpg"
    }
  ]
}
```

## Principes

- `media` est une liste ordonnée.
- Un média est `image` ou `video`.
- `url` est l’adresse HTTPS lisible par le navigateur.
- `source_path` conserve le chemin relatif sous `Auteur/CodeDuLien` mais ne
  constitue pas à lui seul une URL lisible sur Vercel.
- `thumbnail_url` est optionnel et particulièrement utile pour les vidéos.
- `media_items`, `mediaItems` et `children` sont acceptés comme alias
  transitoires.
- Les anciens champs `thumbnail_url` et `media_url` produisent automatiquement
  un média unique afin de préserver les imports existants.

## Comportement attendu

- Photo : un média image, rendu identique à l’application actuelle.
- Carrousel : plusieurs médias image ordonnés, navigation dans le détail.
- Vidéo : média vidéo HTTPS avec lecteur natif, lecture/pause au clic.
- Chemin sans URL : métadonnée conservée et état explicite « média non encore
  disponible » jusqu’au choix du futur stockage ou résolveur.

## Décision à prendre plus tard

Lorsque le format d’export sera stabilisé, choisir comment transformer
`Auteur/CodeDuLien/fichier` en URL : stockage objet, CDN, Vercel Blob ou route
serveur adossée à un volume réellement accessible au déploiement.
