# Print forms (2026-09-29.2)

- Contract date comes from the employee's hire date, not editable print settings.
- `contractCity` is stored in the company card. Existing companies need this field
  completed once; the application does not guess a city from a postal address.
- The templates target individual entrepreneurs signing in their own name.
- Work/rest schedule, monthly accounting and statutory guarantees are fixed in
  the template. The contract has no editable per-generation settings.
- The contract no longer selects or identifies an individual retail point.
  `employmentDetails.workLocality` in the employee card supplies the required
  work locality. It is not inferred from the employer's registration address or
  `contractCity` (the place of signing). Other site-specific forms (job, hire,
  handover, liability) still require their point; the selector is hidden otherwise.
- Working conditions are no longer requested by the print form. No SOUT class,
  absence of hazards or workplace characteristics are invented. The contract
  refers to a written integral annex for actual conditions and exact pay dates.
  This annex is NOT automatically generated. The visible legal warning explains
  that the generic clauses alone do not satisfy articles 57 and 136: complete
  the required conditions before signing. Removed legacy settings cannot override
  the current template; previously generated snapshots remain unchanged.
- Contract references to internal work rules, the consecutive-shift prohibition
  and the explicit 42-hour rest clause are removed. Statutory obligations still
  apply. Omitting references does not itself exempt an employer from local acts.
- Employer identity-document information is omitted at the user's request.
  Article 57 of the Labor Code requires it for an individual employer. The UI
  therefore warns that these templates need legal review and completion, and
  does not represent them as unconditionally compliant ready-to-sign contracts.

## Registry

`print_register_<sha256(companyId)>.json` uses the existing `app_kv` table. No SQL
migration or additional public database permissions are required. Each company
has an independent, non-resetting positive integer counter. A record is keyed by
employee within the company. Generating a contract or liability agreement assigns
a number; generating other forms does not consume one. Repeat generation and
corrections keep the number. A new employment episode for the same employee and
company is not a separate contract workflow in this version.

The registry stores the latest rendered snapshot of each generated form. Opening
or printing a saved snapshot does not regenerate or renumber it. Card changes
affect only an explicit new generation. Corrections replace the selected forms;
other saved forms remain unchanged. This is not an archive of signed originals
or an amendment-signing workflow. Keep signed originals separately.

Supabase uses an `updated_at` compare-and-swap and conflict-safe initial insertion
to commit the counter and snapshots together across separate server instances.
An individual record revision also prevents overwriting another editor's work.
An uncertain database write returns an error and directs the user to refresh the
registry; it is not silently retried as a new document. Local mode serializes
writes inside its single Node server process.

Legacy saved drafts with manual contract numbers reserve and retain those numbers.
Duplicate legacy numbers stop numbering explicitly. Old previews that were never
saved as drafts contained no persistent document snapshot; their text/numbers
cannot be reconstructed from the audit log. The new registry is not a claim that
all historical signed contracts have been imported.

Authorization uses the existing `printForms` section permission on every route.
Logs contain identifiers, document types, contract number and template version,
not passport data, banking details or document text.

## Verification

`tests/print-forms.test.js` checks card-sourced fields, minimal contract settings,
all ten templates, escaping, company city persistence, authorization, independent
sequences, stale-editor rejection, immutable saved output until regeneration,
legacy-number preservation, restart persistence, concurrent cloud writes and
explicit storage failure. Run `npm test` and `npm run smoke` before deployment.

Legal references: Labor Code articles 57, 104, 108, 109, 115 and 136. Source pages:

- https://www.consultant.ru/document/cons_doc_LAW_34683/2debf15d9e8f632d1a9626d60877f94e84c1cb7c/
- https://www.consultant.ru/document/cons_doc_LAW_34683/c766865a1d47b422da9cbd77354b410b3d7f4a86/
- https://www.consultant.ru/document/cons_doc_LAW_34683/b25591b628cf4c13d185a767e6c1d04842257a16/
- https://www.consultant.ru/document/cons_doc_LAW_34683/a0a891ee650687026ef53d5d1194983419be6793/
