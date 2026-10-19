# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately, through GitHub's private vulnerability
reporting:

**[Report a vulnerability](https://github.com/0xTropics/kraken-project-management/security/advisories/new)**

Do not open a public issue, pull request or discussion for a security problem,
and do not post exploit details anywhere public until a fix has shipped.

A useful report says what you did, what you expected, what happened instead, and
which part of Kraken it touches. A failing test in `test/security/` is the best
possible reproduction.

## What is in scope

Kraken is a billing tool, so the interesting failures are the ones that break a
boundary:

- **Authentication and the two auth contexts.** Reaching `/app` or an internal
  API route without an internal session, or using a portal cookie in its place
  (or the reverse).
- **Portal isolation.** A client seeing anything beyond their own project, or
  anything the operator has not made visible: another project's data, an
  unapproved note, a hidden work item, an unpublished invoice, a money figure
  the portal should not show. This includes the portal sign-in lockout and the
  request-upload checks.
- **Invoice immutability.** Changing, re-numbering, deleting or un-finalizing a
  finalized invoice, its lines, or a time entry locked to it.
- **The audit log.** Updating or deleting an audit row.
- **Secrets.** Any route or log that returns or records a portal password hash,
  a plaintext password, or a server-side key.

Out of scope: findings that need a compromised operator account or a
compromised Vercel or Supabase account; denial of service by volume against a
deployment you do not own; missing hardening headers with no demonstrated
impact; and anything that only affects `KRAKEN_AUTH_MODE=local`, which is a
development harness and not a way to run Kraken.

## Supported versions

Only the latest `main` is supported; releases receive no backports.

## What to expect

Kraken is maintained by one person, so a response is best-effort. I will
acknowledge a report as soon as I can, tell you whether I consider it in scope,
and credit you in the fix if you would like that.
