# QA sécurité et authentification

Ce lot QA reste en lecture seule sur `src/**` et la configuration. Il couvre la configuration auth, les JWT, les cookies de session, les URL importées et prépare les parcours navigateur avec une authentification et une base PostgreSQL réelles.

## Tests sans secret réel

Les tests Vitest utilisent uniquement des valeurs synthétiques créées dans le processus de test. Aucun secret ni mot de passe exploitable n'est enregistré.

```powershell
npm test -- --run tests/unit/auth-config.test.ts tests/unit/auth-token.test.ts tests/unit/auth-session.test.ts tests/unit/url-security.test.ts
```

Deux comportements à risque sont documentés avec `it.fails` : l'acceptation initiale des URL Instagram en HTTP et l'absence d'allowlist pour les domaines média. Quand le code de production sera corrigé, retirer `fails` afin que ces cas deviennent des régressions ordinaires.

## Playwright avec authentification réelle

Le `playwright.config.ts` utilise `AUTH_DISABLED=true` par défaut pour les
parcours UI sans base. Une valeur explicite `AUTH_DISABLED=false` est désormais
respectée pour les parcours d'authentification réelle.

Terminal serveur :

```powershell
$env:AUTH_DISABLED="false"
$env:AUTH_SECRET="<secret fort de 32 caractères minimum>"
$env:ADMIN_EMAIL="<adresse administrateur>"
$env:ADMIN_PASSWORD_HASH="<hash bcrypt>"
$env:APP_OWNER_ID="qa-preview"
$env:DATABASE_URL="<URL PostgreSQL poolée de preview>"
$env:DATABASE_DIRECT_URL="<URL PostgreSQL directe de preview>"
npm run dev
```

Terminal QA :

```powershell
$env:E2E_ADMIN_EMAIL="<même adresse administrateur>"
$env:E2E_ADMIN_PASSWORD="<mot de passe en clair, uniquement dans ce processus>"
npx playwright test tests/e2e/auth-and-import.spec.ts --project=chromium
```

Le test vérifie un échec générique, le login, les attributs du cookie, la protection d'une page privée, le logout UI et la neutralisation d'une cible `next` externe.

## Import PostgreSQL idempotent

Ce scénario écrit une publication QA unique et deux `ImportJob` dans la base. Il doit être lancé uniquement sur une base de preview jetable :

```powershell
$env:E2E_RUN_DB_IMPORT="true"
npx playwright test tests/e2e/auth-and-import.spec.ts --project=chromium --grep "import PostgreSQL"
```

Le scénario vérifie :

- la répétition avec la même clé d'idempotence renvoie exactement le même rapport et le même job ;
- un nouvel import du même `postUrl` met à jour la publication au lieu de la dupliquer ;
- la recherche API ne retourne qu'une occurrence de cette URL.

## Défauts production constatés, non corrigés ici

1. `src/features/library/components/library-explorer.tsx:224` soumet le logout comme un formulaire de navigation, mais `src/app/api/auth/logout/route.ts:6` renvoie du JSON sans redirection. Le navigateur arrive donc probablement sur `{"ok":true}` au lieu de revenir à `/login`. Le test Playwright réel attend la redirection voulue et doit exposer ce défaut.
2. `src/lib/import/normalize.ts:317` autorise `http:` pour une publication Instagram avant de la réécrire en HTTPS. La validation devrait exiger HTTPS directement.
3. `src/lib/import/normalize.ts:266` accepte tout hôte public HTTPS comme média. Sans allowlist, une image importée peut servir au pistage par un domaine arbitraire.
4. `src/app/api/auth/login/route.ts:24` ne contient aucune limitation de débit distribuée. Avant exposition publique, les tentatives doivent être bornées par identité et adresse réseau avec un stockage partagé.
5. `playwright.config.ts:17` force le bypass auth pour le serveur géré par Playwright. La CI ne peut donc pas valider le vrai login sans démarrer une cible séparée ou ajouter ultérieurement un projet/config dédié.

Les scénarios d'auth réelle et de base sont volontairement ignorés si leurs variables opt-in ne sont pas présentes.
