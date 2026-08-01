# Places v5 release plan

1. Obtain OpenAI API key, caption-egress consent, and owner-approved spend cap.
2. Implement and validate on `develop`.
3. Run a bounded Develop dry-run; inspect false positives, exact/approximate
   outcomes, cost, and failed requests.
4. Obtain explicit approval for any Develop data replacement/legacy cleanup.
5. Deploy Preview and obtain explicit Production promotion approval separately.

Rollback: disable v5 analysis, preserve confirmed data, and restore only from a
verified backup/transaction plan if a later approved data operation requires it.
