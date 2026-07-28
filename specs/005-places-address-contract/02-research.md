# Places address contract - Research

## Repository findings

1. `Place.address` and `ResolvedPlaceCandidate.address` already exist, so no
   database migration is needed.
2. The untrusted candidate schema is strict and text-only but omits `address`.
3. Geoapify currently receives structured `name`, `city`, `state`, and `country`.
4. The scorer uses candidate confidence and name/city/country/region agreement;
   it ignores the provider rank already normalized by the resolver.
5. The current default analysis version is `places-v1`; keeping it would reuse
   the old idempotency identity for unchanged captions.
6. `main` is a direct descendant of `develop` and contains the approved 10 km
   city-radius fix. Basing the corrective branch there prevents a 25 km
   regression when it returns to `develop`.

## Provider evidence

Geoapify's official Forward Geocoding documentation states:

- free-form `text` and structured address parameters are alternatives;
- `formatted`, `address_line1`, `result_type`, `rank.confidence`, and
  `rank.match_type` are returned for verification;
- `rank.confidence` evaluates the complete address match;
- `rank.match_type` identifies the address level and does not alone prove that
  all components are correct.

Decision: address candidates use free-form `text`; scoring combines textual
agreement, house-number agreement, provider confidence, match type, result type,
and existing contradiction checks.

Source: <https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/>
