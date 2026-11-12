# Mobile release checklist

Run this on the TestFlight build, not the App Store build, before submitting.
Use throwaway accounts for sign-in and deletion. Written for 1.0.4; most of it
applies to every release.

## Before you start

- [ ] The build comes from `main` and `apps/mobile/app.json` shows the version you mean to ship.
- [ ] Use a phone that has never had Wall-E Arena installed, or delete the app and its data first. A bundle shipped inside the store build is what a first launch runs, so this is where backend-address mistakes show up.
- [ ] Keep the Railway HTTP logs for `walle-api` open. Every step below should appear there.

## 1. First launch on a fresh install

- [ ] Open the app for the first time, without force-quitting. The tournament list loads and contests appear.
- [ ] In the logs, requests from the app (user agent `WalleArena/...`) hit `walle-api.wallearena.com`, with no 404s.
- [ ] Sign up with email and password on that very first launch. It succeeds and you land on the home tab signed in.
- [ ] In the logs, `POST /api/auth/register` returns 201.
- [ ] Force-quit and reopen: you are still signed in.

## 2. Sign-in methods

- [ ] Log out, then log in with the email account from step 1.
- [ ] Sign in with Google on a new Google account. The first time, it creates an account.
- [ ] Sign in with Apple on a new Apple ID. The first time, it creates an account.
- [ ] On each account, the profile's "Sign-in method" row shows the right method (Email & password, Google, Apple).

## 3. Token refresh

The access token lasts 24 hours by default (`JWT_EXPIRE_MINUTES`), so this
cannot be forced from the app. The backend rotates refresh tokens: each is good
for one use.

- [ ] Sign in, leave the app untouched for more than 24 hours, then open it. You are still signed in and the data loads. The logs show one `POST /api/auth/refresh` returning 200, followed by successful calls.
- [ ] Leave it another 24 hours and open it again. You are still signed in. This second expiry is what used to log people out.
- [ ] The home screen fires several requests together, so these opens also cover several 401s arriving at once. Exactly one refresh in the logs per open is correct.
- [ ] Log out while the app is loading. It ends up signed out and stays that way.

## 4. Account deletion (App Store requirement)

Use a throwaway account of each type.

- [ ] **Email account:** Profile, Delete Account asks for a password. A wrong password shows "Incorrect password". The right one deletes the account and signs you out.
- [ ] **Google account:** the dialog shows no password box and says "You'll be asked to confirm with Google...". After the confirmation the Google sheet appears. Dismissing the sheet cancels with nothing deleted. Completing it deletes the account and signs you out.
- [ ] **Apple account:** same as Google, with the Apple sheet.
- [ ] Confirming with a different Apple ID, or the wrong Google account, shows the backend's message and deletes nothing.
- [ ] A deleted account can no longer log in.

## 5. Everyday flows

- [ ] Switch tournaments. Contests, teams and the carousel change with it.
- [ ] Open a contest, build a team, join the contest.
- [ ] My Teams and the leaderboard show the new team.
- [ ] Forgot password opens the website's reset page.
- [ ] As an admin account, the admin screens still load.

## 6. Before you submit

- [ ] Android: repeat sections 1 to 4 if the app is on Google Play. The Apple steps do not apply there.
- [ ] No step above made a request to a host other than `walle-api.wallearena.com`.
- [ ] The Railway logs show no 5xx responses during the run.

## Not covered by automated tests

The Google and Apple sheets, native builds and real token expiry. Section 4 is
the one to take seriously.
