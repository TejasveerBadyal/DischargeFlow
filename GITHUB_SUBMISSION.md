# Submit DischargeFlow through GitHub

## Recommended: publish the extracted project with Git

1. Download and extract the source ZIP. Open the extracted **DischargeFlow** folder, containing `README.md`, `package.json`, `app`, `public`, `db` and `drizzle`. Upload the actual source tree, not just the ZIP.
2. Sign in to GitHub. Create an **empty** repository named `dischargeflow`. Choose visibility required by the OC; if private, invite their GitHub account. Do not initialise another README, licence or gitignore.
3. Open a terminal in the extracted folder. Install Git if necessary and use your GitHub sign-in method when prompted. Run:

```sh
git init -b main
git add .
git commit -m "Submit DischargeFlow hackathon prototype"
git remote add origin https://github.com/YOUR-USERNAME/dischargeflow.git
git push -u origin main
```

Replace YOUR-USERNAME with your GitHub username. If Git asks for your author name/email, set your own details and retry the commit. GitHub authentication uses its supported sign-in/token/SSH mechanism, not your normal account password in a terminal password prompt. The ZIP intentionally contains no existing `.git` history or remote.

4. Open the repository online. Confirm the README and folders are visible. Add the live website URL in the repository About field, then invite the other three teammates as collaborators if desired.
5. Give the OC the repository URL **and** the live website URL. If a final submission revision is required, copy the final commit link as well. Share prototype login credentials through the OC's private submission channel.

These steps follow [GitHub's official existing-source instructions](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

## Without terminal commands

GitHub Desktop can create a repository in the extracted folder, commit the files and publish it to your GitHub account. Check that the repository root contains `package.json` rather than an extra nested project folder. See [GitHub's supported upload options](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

## Include / exclude

Include all supplied source/configuration files, hidden `.gitignore`, `.npmrc` and `.openai/hosting.json`, the lockfile, SQL migrations, tests, docs and licence notices. The Site ID in the manifest is an identifier, not a password; it does not grant access to the hosted project.

The supplied ZIP excludes dependencies, generated builds, local databases, sessions, caches and secret files. Keep that separation. Never commit `.env*`, `.dev.vars*`, passwords, tokens, patient data, `node_modules`, `.wrangler`, `.sites-runtime`, `.next` or `dist`. Check the files staged by `git add .` before committing any later local changes.

## What GitHub does

It stores reviewable source code and tracks contributions. It does **not** automatically deploy this app or copy its live D1 database. GitHub Pages serves static files and cannot run this application's server login and SQL database. Keep the existing live link for the demonstration.

## Team preparation

Replace placeholder team details with real names/contributions, record honest current limitations, and follow the OC's rules on AI assistance and third-party code. Do not add a licence claiming ownership of third-party starter code; retain existing notices and choose a licence for team-authored code only when the team has agreed.
