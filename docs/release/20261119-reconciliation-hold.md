# Source reconciliation release hold — 19 November 2026

Decision: reconcile the checked and tested FFPRO source without triggering a
production release. Continuous Delivery remains disabled for publication and
deployment; manual dispatch cannot start either job. Existing deployment code
and environment protections are preserved. This change does not certify any
production recovery checkpoint or authorize a cutover.

Before a later release, require independent recovery verification, exact-image
acceptance, explicit release review and a separately reviewed delivery workflow
change. Do not treat a successful source CI run as production authorization.
