# Places mobile usability - Research

## Repository evidence

The existing page, server action, scoring module and focused tests already
provide the correct seams. CSS places search, filters and the segmented control
in one overflow-constrained row. `loadPlacePostsAction` called a configured-owner
service but rejected public users first. City-like scoring used one 25,000 metre
constant.

## Data evidence

The analyzed JSONL has 407 records and 646 candidate entries. Before release,
Neon Production had 29 `APPROXIMATE` places at 25,000 metres, 10 at 5,000 metres,
51 total places, 301 links, 254 linked posts, 1,203 evidence rows and 407 jobs.

## Decision

Reuse the current components, service and database. Split the toolbar into two
mobile rows, remove only the read-session prerequisite, change future scoring,
and perform the separately authorized existing-row correction transactionally.
