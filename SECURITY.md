# Security Policy

## Reporting

Do not report vulnerabilities in public issues. Contact the repository owner privately through the GitHub profile with affected versions, impact, and safe reproduction steps. Do not attach customer records, images, provider keys, or production database exports.

## Secrets and environments

- Store production secrets only in a production secret store or root-owned runtime environment file.
- Keep `.env*` files out of Git; `.env.example` contains placeholders only.
- Use separate production, local, and CI databases and storage.
- Keep mock providers disabled in production.
- Rotate credentials that may have been exposed; removing them from a commit does not revoke them.

## Scope

This project processes customer and image data. Deploy behind HTTPS, restrict administrative access, preserve private storage boundaries, and maintain encrypted off-site backups with tested recovery procedures.
