# Places mobile usability - Technical Design

## Selected design

- Render a normal Next.js link in the Places page header, targeting `/`, so a
  direct `/places` visit always has a deterministic exit independent of browser
  history.
- On small screens, turn the top bar into two rows: search spans the first row;
  filters and the 2D/3D control share the second. Move dependent popovers below
  the taller bar.
- Keep `loadPlacePostsAction` as the existing thin owner-scoped server action,
  but remove the session prerequisite for this read-only public UI seam. Do not
  touch the admin guard used by review mutations.
- Change only the city-level scoring radius constant to 10,000 metres. Existing
  persisted radii remain truthful and are not visually clamped.

## Alternatives rejected

- `history.back()` alone: fails for direct entry and can leave the application.
- Preloading every post on the page: increases the initial payload and bypasses
  the existing bounded on-demand seam.
- Clamping every displayed radius to 10 km: misrepresents persisted data.
- Updating production rows in the code change: crosses the explicit production
  data boundary and needs separate authorization and evidence.

## Rollback

Revert the component, CSS, server-action and scoring constant changes. No data
or schema rollback is required.
