# Event sync setup

The event sync runs from GitHub Actions once per day at 9:00 PM Pacific. Authenticated website admins can also start it from `/admin/`.

## Data behavior

- Purplepass and Facebook are compared field by field.
- Credible conflicts publish the strongest value and remain flagged for review.
- Reviewed flags can be acknowledged in `/admin/`; they return if the underlying source values change.
- Ambiguous conflicts retain the existing website value.
- Manual edits made after a sync are detected and preserved.
- Fields can also be explicitly locked in the event editor.
- Source images are downloaded into `public/uploads/synced/`.
- The selected poster and alternate images remain editable.

## GitHub Actions secrets

Add these under repository **Settings > Secrets and variables > Actions**:

- `FACEBOOK_PAGE_ID`
- `FACEBOOK_PAGE_ACCESS_TOKEN`

The Purplepass organizer ID is already configured as `42425`.
The workflow reads Purplepass through the fixed `/api/purplepass-feed` Netlify function because Purplepass blocks GitHub-hosted runner IP addresses. The proxy only exposes CapCity Presents organizer data and images.

The workflow uses Graph API `v25.0`, released February 18, 2026.

## Meta setup

1. Sign in at [Meta for Developers](https://developers.facebook.com/apps/).
2. Create a Meta app owned by the same account that has full control of the CapCity Presents Page.
3. Use the Facebook Login use case or a Business app type if Meta presents the older app-type flow.
4. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/) and select the new app.
5. Generate a User access token with:
   - `pages_show_list`
   - `pages_manage_metadata`
   - `pages_read_engagement`
   - `pages_read_user_content`
6. Request:

   ```text
   GET /me/accounts?fields=id,name,access_token,tasks
   ```

7. Find CapCity Presents in the response. Save its `id` as `FACEBOOK_PAGE_ID`.
8. Test the returned Page access token with:

   ```text
   GET /PAGE_ID/feed?fields=id,message,created_time,permalink_url,from{id,name},attachments{media_type,title,description,url,target,media,subattachments}&limit=5
   ```

   The importer filters this feed to posts authored by the CapCity Presents Page.

9. Convert the User token to a long-lived User token, then request `/me/accounts` again with the long-lived token.
10. Check the returned Page token in Meta's Access Token Debugger. Meta may issue either a non-expiring Page token or a token with a fixed expiration date. Record that date and rotate the secret before it expires.
11. Save the final Page token as `FACEBOOK_PAGE_ACCESS_TOKEN`. Never commit or paste it into chat, documentation, or an event file.

For a server credential that is not tied to a person's short-lived login flow, a Business Portfolio can use a system user assigned to the app and Page. Availability and token duration depend on the portfolio's Meta business setup.

The app can remain in development mode when the person authorizing it is an app administrator and has Page access. App Review is only needed if people outside the app roles must authorize Pages.

## Admin trigger and PDF reports

Create a fine-grained GitHub personal access token limited to this repository with:

- Actions: Read and write
- Contents: Read
- Metadata: Read

Add these under the Netlify site’s **Project configuration > Environment variables**:

- `GITHUB_AUTOMATION_TOKEN`
- `GITHUB_REPO_OWNER` = `kvvpa`
- `GITHUB_REPO_NAME` = `capcitypresents`
- `GITHUB_BRANCH` = `master`

The `/admin/` controls authenticate through Netlify Identity. Weekly review boundaries are stored in site-scoped Netlify Blobs. PDF reports compare Git history before and during each review.

## First deployment

1. Publish these repository changes.
2. Confirm GitHub Actions permits workflow write access.
3. Add the GitHub and Netlify secrets above.
4. Open `/admin/`, sign in, and click **Sync events now**.
5. Check the workflow result and the flags displayed in the admin panel.
