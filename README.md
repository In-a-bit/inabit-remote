# Approver App

This standalone project is designed to be deployed on a user's own server, enabling integration with Inabit from remote. Its primary purpose is to facilitate the approval of pending transactions within a gated approvals flow.

## Functionality

Upon running, the application must successfully initialize and communicate with Inabit. This involves several steps depending on the initiation state. If the 'signer' is approved, the handling of pending transaction flow may proceed.

### First Run

During the first run, a pairing process is initiated. This includes:

1. Logging into Inabit.
2. Validating the user's current state.
3. Requesting a pairing token.
4. Producing an encrypted key used for signing, saving it to a mapped volume.
5. Sending pairing data to Inabit and requesting the 'Owner' to authorize the approver.

### Recurring Runs

For subsequent runs, after validating that the user is paired, the application continues its operation as usual.

### Initiation Errors

If anything goes wrong during the initiation stage, the approver initiation process will be aborted.

## Prerequisites

1. Credentials of a valid user within Inabit with the role: 'apiSigner'.
2. Enabled communication with the Inabit server (valid URL and whitelisted IPs and ports).

## Deployment

From within the root directory `inabit/inabit-remote`:

 ### Build

```bash
docker-compose -f docker-compose.prod.yml build approver
```
 ### Run

```bash
docker-compose -f docker-compose.prod.yml up approver
```
## Required Configurations

The required config can be provided in 2 ways:

1. Baked into the docker by building the docker with a valid `.env` file.
2. Through the `docker-compose.prod.yml` file variables override section `environment`.

In case using `.env` is selected, remember to modify or remove the `environment:` section, from `docker-compose.prod.yml`.

### Required Environment Variables

```env
INABIT_API_BASE_URL=http://localhost:3000/graphql
SIGNER_USERNAME=signer@example
SIGNER_PASSWORD=signer
APPROVER_URL=http://example.example
APPROVER_PORT=3020
SECRET=change-me
FILE_PATH=dat
FILE_NAME=k.dat
```
### Important

The approvers' key must be mapped to a selected location in the host filesystem for persistency. This is the combination of env variables:

```env
SECRET=koko-moko  # Encryption secret for the key.
FILE_PATH=dat     # File path relative to the app/apps/approver i.e., app/apps/approver/dat.
FILE_NAME=k.dat   # File name of the encrypted key.
```
In the Docker Compose file:

```yaml
volumes:
      - ./dat:/app/apps/approver/dat
```

##### Ensure Correspondence

Ensure there is correspondence between the volume mapping and the selected `FILE_PATH` settings. The volume mapping in the Docker Compose file should reflect the chosen `FILE_PATH` for persisting the encrypted key:

```yaml
volumes:
      - ./dat:/app/apps/approver/dat
```