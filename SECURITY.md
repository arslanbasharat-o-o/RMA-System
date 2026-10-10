# Security Policy

## Report a vulnerability

Please use [GitHub's private vulnerability reporting form](https://github.com/arslanbasharat-o-o/RMA-System/security/advisories/new) rather than opening a public issue. Include affected versions, impact, and safe reproduction steps. Do not attach customer records, display images, provider keys, or production database exports.

If private reporting is unavailable to you, contact the repository owner through the GitHub profile and ask for a secure reporting channel.

## Supported releases

No versioned GitHub Release has been published yet. Security fixes are made on the default branch; review the release page for published versions and advisories.

## Handling data and credentials

- Keep production secrets in a secret manager or a root-owned runtime environment file. Do not commit `.env` files or place secrets in `NEXT_PUBLIC_*` variables.
- Keep production, local development, and CI databases and image storage separate.
- Keep mock recognition providers disabled in production.
- Store uploaded images and private catalog workbooks outside the public source repository.
- Rotate credentials that may have been exposed. Removing a value from a later commit does not revoke it.
- Deploy behind HTTPS, restrict administrative access, and maintain encrypted off-site backups with tested recovery procedures.
