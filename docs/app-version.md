# App version

`release.json` is the source for the version displayed in the application sidebar,
profile, and health response. Keep its semantic version in sync with `package.json`
and the release tag (for example, `0.2.0` and `v0.2.0`). The release workflow checks
the tag and both files before creating a GitHub Release.

Changing version metadata in GitHub does not change a running installation. The
verified commit must be deployed through the separately reviewed deployment process
before its version appears in production. GitHub Releases do not deploy the VPS.
