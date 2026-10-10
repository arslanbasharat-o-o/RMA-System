# App version

`release.json` is the single source for the version displayed in the sidebar,
profile, and health response. Update its `version` in GitHub through a pull request.
The production build automatically includes the number from the deployed commit;
there is no browser override or separate production environment value to update.

Release tags must match this file (for example, `v0.02`). The GitHub Release workflow
checks the match before publishing release notes. Deploy the verified commit using
the existing backup and application rollout procedure to make that version live.
GitHub releases alone do not deploy the VPS.
