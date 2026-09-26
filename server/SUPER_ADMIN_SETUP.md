# Stage 1B: authentication and initial Super Admin

Start MongoDB normally, then run `npm start` from `server/`. The application still
uses `mongodb://127.0.0.1:27017` and the `fabulari` database.

Before accepting requests, startup hashes existing plain-text MongoDB passwords
with bcrypt (cost 12). Complete bcrypt hashes are skipped, so restarting is safe.
The conditional update also prevents concurrent migrations overwriting each other.
JSON seed files are read only; seed passwords are hashed before insertion.
Legacy empty passwords are migrated too, but empty credentials are no longer
accepted for signup or login. Invalid/non-string or over-72-byte legacy passwords
stop startup for operator correction instead of being silently truncated.

## Create the initial Super Admin

This is a local operator command, not a public registration endpoint. Run it once
from `server/` with a new username and a password of your choosing. In zsh:

```zsh
read 'SUPER_ADMIN_USERNAME?Super Admin username: '
read -s 'SUPER_ADMIN_PASSWORD?Super Admin password: '
printf '\n'
export SUPER_ADMIN_USERNAME SUPER_ADMIN_PASSWORD
npm run bootstrap:super-admin
unset SUPER_ADMIN_USERNAME SUPER_ADMIN_PASSWORD
```

The hidden password prompt avoids writing the password in shell history. Nothing
prints the password or hash. No default credentials or automatically promoted
users are provided. Missing credentials, an existing username, or an existing
Super Admin cause the command to fail.

The command stores a permanent `initial-super-admin` reservation in the MongoDB
`bootstrap` collection. Its unique `_id` prevents concurrent commands from
creating multiple initial administrators. The reservation remains even after the
account is deleted. If the process fails after reserving but before creating the
account, it deliberately refuses retries. For this exceptional recovery, stop all
bootstrap commands and have the database operator verify that no initial admin
was ever created before removing only the incomplete reservation and retrying.
Never remove a reservation for an already-created administrator.

Sign in through the existing Angular login page. `response.user.role` is
`superAdmin`; normal signup always creates `user`, regardless of submitted role.
Both roles still navigate to the existing home page. No dashboard or additional
permissions/workflows are introduced in this stage.

## Password handling and API compatibility

Signup hashes before insertion. Login finds the username and uses
`bcrypt.compare()` to verify the submitted password. Passwords are never compared
directly. Password input is limited to 72 UTF-8 bytes because bcrypt otherwise
silently truncates longer inputs.

Login and signup strip the password and MongoDB `_id` before responding. User
list, profile read, and profile update queries exclude them with a projection.
The existing response shapes, numeric IDs, role, profile fields and group data
remain available. Angular stores this safe user object, including the role.
Sign in again to replace any user object cached by the old Phase 1 frontend.

This stage changes credential handling only. The existing API access model is
unchanged; a role in browser local storage is not server-side authorization.

## Verification

Run `npm test` from `server/`. The tests require `mongod` on PATH and create an
isolated temporary MongoDB process with its own data directory and port. They do
not alter the development database. Tests cover all eight requested cases,
repeat migration, concurrent/repeated bootstrap, role injection, password input
validation, and fresh JSON seeding. The process and temporary files are cleaned
up at the end. Run `npm run build` from `client/` to check Angular integration.
