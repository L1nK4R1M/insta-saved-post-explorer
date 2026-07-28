# Places address contract - Real develop dry-run follow-up

Date: 28 July 2026
Target: Neon `develop` (`br-sparkling-glade-as9gow4m`)
Post: `cmrfhnykb000hjs04ndgb3avh`

## Authorization and data boundary

The repository owner explicitly authorized transmitting the exact
caption-derived address of this single post to Geoapify. The evidence below
records only bounded classification metadata and counts, not the address,
coordinates, API key, request URL, or raw provider payload.

## Real provider result

```text
resultCount=3
providerResultType=amenity
providerRank=1
providerMatchType=inner_part
precision=EXACT
confidence=1
approximationRadiusMeters=null
reasons=city_match,country_match,address_match,address_provider_verified,exact_specific_match
```

Geoapify documents `rank.confidence` as the complete-address correctness signal
and `rank.match_type` as the matched address level. The follow-up accepts
`inner_part` only at rank 0.95 or higher with matching textual address and house
number, a specific result, and no city/country/address contradiction.

## Importer lifecycle

Before the lifecycle correction, the importer printed a successful dry-run
report but then triggered a Windows libuv assertion and returned non-zero. The
follow-up disconnects Prisma in `finally` and replaces forced success/failure
process exits with natural shutdown plus `process.exitCode` on failure.

After correction:

```text
exit=0
committed=false
totalLines=1
validRecords=1
postsProcessed=1
postsSucceeded=1
postsNeedingReview=0
postsFailed=0
placesPersisted=1
linksPersisted=1
unknownCandidates=0
errors=[]
```

## Duplicate-link audit

Before and after the dry-run, Neon develop contains exactly one link for this
post: an unconfirmed automatic `APPROXIMATE` primary with a 10 km radius. There
are zero exact links. This proves dry-run rollback and also proves that a later
committed exact link would otherwise coexist with the stale approximate link.

The follow-up therefore deletes only the previous unconfirmed automatic
approximate primary when a new exact result is persisted and the old place was
not produced by the current analysis. It preserves canonical places, evidence,
jobs, secondary links, and all user-confirmed links. No develop or Production
data write occurred during this validation.
