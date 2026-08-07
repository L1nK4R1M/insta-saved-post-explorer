# Places v5 international address extraction - Intake

**Mode:** critical  
**Status:** draft  
**Owner:** repository owner

## Request

Use OpenAI to extract broad international postal-address evidence from eligible
post captions, then use Geoapify as the sole coordinate authority.

## Observed defect

The v4 mechanical extractor emitted no candidate for valid Belgian addresses
whose house number follows the street name, such as `Rue de Trèves 74, 1040
Bruxelles` and `Chaussée de Wavre 64`. Existing automatic Brussels zones remain
visible because a v4 import with no candidate does not replace old links.

## Gate

This contract authorizes no implementation, model call, data write, worker
activation, Preview deployment, or Production operation. Phase H worker
activation, an OpenAI API key, owner-approved spend cap, and an explicit caption
egress authorization are prerequisites for implementation.
