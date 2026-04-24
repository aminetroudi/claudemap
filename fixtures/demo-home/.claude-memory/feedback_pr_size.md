---
name: PR size preference
description: For refactors in one area, prefer one bundled PR over many small ones
type: feedback
---

For refactors in a single module, the user prefers one bundled PR over
many small ones.

**Why:** Confirmed after I proposed splitting a five-file rename into three
PRs — user said "splitting this one would've just been churn."

**How to apply:** When changes all live in one domain and are coupled by
intent (e.g. a single rename), bundle them. Cross-domain or cross-team
changes still split.
