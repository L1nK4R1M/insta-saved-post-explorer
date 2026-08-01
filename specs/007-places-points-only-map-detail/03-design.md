# Design

Filtering occurs at the renderer boundary so approximate results remain reviewable. The public `PlacePostSummaryDto` stays unchanged. A separate owner-scoped internal query enriches those summaries with captions for the Places Server Action. The detail sheet owns the selected linked-post state. Leaflet and Geoapify tiles remain unchanged; CSS supplies the visual treatment.

Rollback is a code revert. No data rollback is required.
