---
name: Maintenance taxonomy provisioning
description: Database provisioning requirement for Maintenance competencies and intervention zones.
---

The Maintenance admin competency and intervention-zone tables are part of the application schema but may be absent from an imported Helium database until the schema is pushed. The taxonomy endpoint should fail explicitly rather than silently falling back to hard-coded data.

**Why:** An imported project can have the schema definitions and admin UI committed while the provisioned database still predates those tables; live taxonomy requests then return a server error.

**How to apply:** When Maintenance taxonomy requests fail with missing-relation errors, run the project’s normal schema-push command against the Replit-managed database, then verify the endpoint and realtime invalidation. Do not create a duplicate taxonomy store.