# Publish Excel to Markdown Live

The configured publisher ID is `YaseenAlkhameri`. The extension is not on the Marketplace yet; publishing requires access to that registered Marketplace publisher. No publisher credentials are stored in this repository.

1. Sign in at https://marketplace.visualstudio.com/manage and confirm you have access to the publisher with ID `YaseenAlkhameri`. Create it first if it is not registered yet.
2. Confirm the `publisher` field in `package.json` matches that ID. The repository and issue URLs point to `alkhameri/ExceltoMD`. Choose the final extension name before the first release.
3. Run `npm ci`, `npm run check`, `npm run test:integration`, and `npm run package`. Install the VSIX in a clean VS Code profile and open the register example.
4. On your publisher's management page, select **New extension → Visual Studio Code**, upload the VSIX, and publish it. For later versions, increment `package.json`'s version and update `CHANGELOG.md` first.
5. Confirm the public listing, install it by searching the Extensions view, and update the README's installation instructions with its real Marketplace URL.

## Automated releases

`.github/workflows/publish.yml` runs when a tag beginning with `v` is pushed, or when started manually from GitHub Actions. It publishes with Marketplace Trusted Publishing (OIDC). The tag must equal `v` followed by the version in `package.json`.

In Marketplace, select publisher `YaseenAlkhameri`, then **Trusted Publishing → Create**:

| Field | Value |
| --- | --- |
| Policy name | `ExceltoMD releases` |
| Repository owner | `alkhameri` |
| Repository | `ExceltoMD` |
| Workflow | `publish.yml` |
| Environment | Leave blank |

For a private GitHub repository, run the workflow within 48 hours of creating the policy. Its first successful token exchange activates the policy permanently.

After the policy is configured, publish the first version (if `0.1.0` has not already been published):

```sh
git tag v0.1.0
git push origin v0.1.0
```

For later releases, commit the code and changelog changes, then run:

```sh
npm version patch -m "Release %s"
git push origin main --follow-tags
```

`npm version patch` increments the version in the package files and creates a version commit and tag. GitHub runs the tests and publishes the tagged version. Use the repository's **Actions** tab to follow the result. A failed publishing run can be retried after correcting the account setup; do not publish the same version twice.

The workflow validates and packages the extension before publishing. `npm run publish:marketplace -- --oidc` refuses the local publisher placeholder, then delegates to `vsce publish`.

Microsoft recommends federated identity rather than long-lived tokens. Its current guidance says global Azure DevOps personal access tokens retire on December 1, 2026. Manual VSIX upload is a simple option for the first release; do not paste tokens into chat or commit them.

Official instructions: https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## Release checks

- Run the unit/build and VS Code integration suites.
- Verify the example updates after an Excel save or AutoSave.
- Verify a missing workbook recovers when created, and a deleted workbook shows an error.
- Check dark/light preview themes and a wide register table.
- Confirm the VSIX includes both bundles, CSS, snippets, README, changelog, example, and third-party license, with no credentials or development dependencies.
- Confirm publisher identity, package version, and public listing after upload.
