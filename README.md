# Approver App

This standalone project is designed to be deployed on a user's own server, enabling integration with Inabit from remote. Its primary purpose is to facilitate the approval of pending transactions within a gated approvals flow.

## Functionality

Upon running, the application must successfully initialize and communicate with Inabit. This involves several steps depending on the initiation state. In other words, this means that there is difference between the first run of the **Approver app** and subsequent (recurring) runs.

During the first run, the **Approver app** is approved by the owner, and the pairing process is completed. In subsequent (recurring) runs, the application can proceed with handling pending transactions as expected.

### First Run

Assuming you received all the details from our representatives, and You start the **Approver app** docker as described, so then
During the first run, a pairing process is initiated. 

The **Approver app** will do these steps:

1. Logging into Inabit using the provided login token, that you will receive from our team.
2. Validating the user's current state.
3. Requesting a pairing code.
4. Producing an encrypted key used for signing, saving it to a mapped volume.
5. Sending pairing data to Inabit and requesting the 'Owner' to authorize the approver. **After this step, you will need to get the the _pairing code_ from the docker logs, and pass it to the owner of your Inabit account for pairing completion.
6. Refreshing the login token i.e. acquiring automatically a new valid login token.


> If anything goes wrong during the initiation stage, the approver initiation process will be aborted.


### Subsequent (recurring) Runs

For subsequent runs, after validating that the user is paired, the application continues its operation as usual.


## Prerequisites

1. You must have an active account at `inabit.com`.

2. In that account, there must be 2 existing users, with the following roles:
  A. `apiAdmin` user.
  B. `apiSigner` user.
  
These users are created in your Inabit account by our representatives.

3. You have received a *login token* that is related to your "apiSigner" user. This token should have been provided to you by our representatives.
 
4. Please verify that host can access `api.inabit.com` server (whitelisted IPs and ports).

5. Please be aware that for completion of the process, you will need interact with your inabit account owner.

## Quick Setup

Before you begin, ensure all prerequisites are met, and that you have the *login token* provided by our representatives.

Then, run this in terminal (linux).

```shell
# clone this repository
git clone https://github.com/In-a-bit/inabit-remote.git
cd inabit-remote
# create 2 needed directories
mkdir refresh
mkdir dat
# save the login token in file.
# in the next line, replace <login token> with the token you got.
echo "<login token>" > refresh/r.dat
# Create your application's environment file. We'll name it app.env.
# (Refer to 'Required Configurations' section for why we don't use .env directly in the root)
cp ./apps/approver/.env.example app.env
```

Now, Open `app.env` file in your text editor, and change the following values:

  * APPROVER_URL - set here the URL of your app. 
  This URL is the URL that this approver app is hosted on. Means - it will get http requests on this URL, from `inabit.com` servers. 
  
  * SECRET - set here a long secret.

  * ORGANIZATION_NAME - set here your organization name.

  * INABIT_API_BASE_URL - should be: https://api.inabit.com/graphql

  * APPROVER_CREATOR_EMAIL - set here your email.

  
Then save the file, and close the editor.

After the file is ready, build the docker, and run it with the following commands : 

```shell
docker compose -f docker-compose.prod.yml build approver
docker compose -f docker-compose.prod.yml up -d approver
```

Now the last step, you should get the the _pairing token_ from the docker logs.
In order to do it, run the following:

```shell
docker logs inabit-remote-approver-1

# then you should search for this log
# and copy the Pairing code 
{
  level: 'info',
  message: 'Pairing code: <COPY THIS CODE>',
  metadata: { timestamp: '2024-02-21T08:54:17.560Z' },
  timestamp: '2024-02-21T08:54:17.560Z'
}
```

**Pass this code to you owner.**.


Ask the owner to open the inabit app on their smartphone. They should have already received a notification from the inabit app requesting approval for the new Approver.

The owner should tap on the notification and enter the provided code when prompted.

After this step is done, you are ready to go!

The next step to do is to create your API Wallet.

If you would like to get deep knowledge, you can read the rest of this document.


## Deployment

From within the root directory `inabit/inabit-remote`:

 ### Set Login Token
 
 The login token is an approver's token valid for 30 days, allowing authentication with Inabit.

 The token is automatically refreshed, i.e. switched to a new 30 days valid token, 

on:
  1. each docker init.
  2. every 15 days (configurable)

 The refreshed login token is saved to a mapped volume on host machine.

The login token must be mapped to a selected location in the host filesystem for initialization and persistency.
 
 Create a folder named `refresh`.
 
 Set into the folder the login token file `r.dat` (which includes the login token).

Map the folder in the `docker-compose.prod.yml` :

 ```yaml
volumes:
      - ./refresh:/app/apps/approver/refresh
```

Add the following environment variables in correspondence:

```env
LOGIN_TOKEN_FILE_PATH=refresh
LOGIN_TOKEN_FILE_NAME=r.dat
REFRESH_LOGIN_TOKEN_IN_MINUTES=21600 # 15 days in seconds, do not change! 
```

 ### Build

```bash
docker-compose -f docker-compose.prod.yml build approver
```
 ### Run

```bash
docker-compose -f docker-compose.prod.yml up approver
```
## Required Configurations

Provide the required configurations by mapping an external environment file (e.g., `app.env`) into the container using Docker Compose volumes. Create this file at the project root (e.g., by copying `apps/approver/.env.example` to `app.env` as shown in the Quick Setup).

**Important:** Remove any `.env` file from the project root or within the `apps/approver` directory to prevent conflicts with this Docker Compose volume mapping method.

### Mapping `app.env` via Docker Compose volumes

Add a volume mapping to your `approver` service in `docker-compose.prod.yml` to map your host's `app.env` to the container's expected `.env` file location.

Example (`docker-compose.prod.yml`):

```yaml
services:
  approver:
    # ... other service configurations ...
    volumes:
      - ./app.env:/app/apps/approver/.env  # Maps host's ./app.env to container's /app/apps/approver/.env
      # ... other existing volume mappings ...
```

**Key Points:**

*   **Host File:** The example uses `app.env` on your host machine.
*   **Container Target:** The application inside the container typically expects `/app/apps/approver/.env`.
*   **Configuration Source:** Rely solely on the mapped `app.env` file for these configurations to avoid confusion.

### Required Environment Variables

```env
INABIT_API_BASE_URL=http://localhost:3000/graphql
APPROVER_URL=http://example.example
APPROVER_PORT=3020
SECRET=change-me
KEY_FILE_PATH=dat
KEY_FILE_NAME=k.dat
LOGIN_TOKEN_FILE_PATH=refresh
LOGIN_TOKEN_FILE_NAME=r.dat
ORGANIZATION_NAME=my-organization
ENCRYPTION_KEYS_FILE_PATH=enc
ENCRYPTION_KEYS_FILE_NAME=enc.dat
ENCRYPTION_KEYS_PASSPHRASE=passphrase
SHARED_KEY_FILE_PATH=sk
SHARED_KEY_FILE_NAME=sk.dat
WHITELIST_CSV_PATH=whitelist
WHITELIST_CSV_FILE_NAME=whitelist.csv
```
### Important

The approvers' key must be mapped to a selected location in the host filesystem for persistency. This is the required combination of env variables:

```env
SECRET=koko-moko  # Encryption secret for the key.
KEY_FILE_PATH=dat     # File path relative to the app/apps/approver i.e., app/apps/approver/dat.
KEY_FILE_NAME=k.dat   # File name of the encrypted key.
```
In the Docker Compose file:

```yaml
volumes:
      - ./dat:/app/apps/approver/dat
```

##### Ensure Correspondence

Ensure there is correspondence between the volume mapping and the selected `KEY_FILE_PATH` settings. The volume mapping in the Docker Compose file should reflect the chosen `KEY_FILE_PATH` for persisting the encrypted key:

```yaml
volumes:
      - ./dat:/app/apps/approver/dat
```

## Pairing

On Docker init , it is first checked if the approver is in status `Paired` or `WaitingForApproval`.

If not, a pairing flow starts:

Within the flow interaction with Inabit,
1. a pairing data is exchanged with Inabit including the public signing key of the approver.
2. an approval message is sent to the owner of the organization.
3. a pairing code is produced in the approver start up log trace, please copy it, and deliver it  *securely* to the owner for pairing process completion.

```
{
  level: 'info',
  message: 'Pairing code: c754ce6d209dcc1b6f2312903ef31f0ac297b63e5dead29a6b877ecad8c77ada',
  metadata: { timestamp: '2024-02-21T08:54:17.560Z' },
  timestamp: '2024-02-21T08:54:17.560Z'
}
```

## Sign On Transactions ( Automatic Flow )

On a transaction creation in Inabit, 
Inabit will send a request to the this Approver application, to handle the requested transaction approval, and sign on the approve/reject decision.


In order to handle transaction approvals: 

1. Approver needs to be in `Paired` status.
2. Configure an external validation url ('endpoint'), implementing the Approver's required approval logics:
  
   1.  The external validation endpoint is expected to expose a 'post' http endpoint for validation purpose. 
   
      *connectivity to the endpoint must be enabled.

      ```env
                 
            VALIDATION_CALLBACK_URL=http://your-domain.com/validation
            # replace the domain with the URL of your validation logics implemented endpoint.
            
      ```

   2. The endpoint will automatically be passed a `TransactionValidationData` json object at the body of the http 'post' call. 
 with the following structure:

    ```javascript
     
      {
            createTime: string;
            transactionId: string;
            transactionType: string;   // Withdrawal / Deposit / Swap
            initiatorId: string;
            organizationId: string;
            network: string;
            walletId: string;
            walletAddress: string;
            to: string;
            coin: string;
            amount: number;
            baseCurrencyCode: string;
            baseCurrencyAmount: number;
      };
      
    ```

   3. The endpoint is expected to return a response with the following structure:

      ```javascript
      { approved: boolean }  // allowed: { approved: true / false }
            
      ```
   4. In case of an exception a retry will be scheduled to execute in 3 minutes time, up to 10 times (10 * 3 minutes).

      ```env
            VALIDATION_RETRY_INTERVAL_MINUTES=3
            VALIDATION_RETRY_MAX_COUNT=10
      ```
   5. On receiving a validation url call response, a signed approval (using Approver's key) will be sent back automatically to Inabit, for further processing (policy enforcement).


### Using Internal Validation (Whitelist or Mock)

Instead of an external validation URL, you can configure the Approver to use its own internal validation logic.

**1. Mock Validation:**

It is also possible to mock external validation url using a predefined endpoint (`transaction/validate`) on the Approver,
and control the required outcome.
Using the following configuration 
```env
VALIDATION_CALLBACK_URL=[APPROVER_URL]/transaction/validate # replace [APPROVER_URL] with the Approver's url. 
VALIDATION_MOCK_SET_RESULT=rejected   # allowed: approved / rejected / exception
```

**2. Internal Whitelist Validation:**

The Approver app includes an endpoint to validate transactions against the `whitelist.csv` file. To use this, set the `VALIDATION_CALLBACK_URL` to point to this internal endpoint:

```env
VALIDATION_CALLBACK_URL=[APPROVER_URL]/transaction/whitelist 
# replace [APPROVER_URL] with the Approver's publicly accessible URL (e.g., http://localhost:3020, or your production domain)
```
This endpoint will check if the transaction's destination address is present in the `whitelist.csv` file.

**Whitelist Management (whitelist.csv):**

The `whitelist.csv` file is used to maintain a list of approved destination addresses for transactions. If you configure the Approver to use internal whitelist validation, transactions to addresses not in this file will be rejected.

**Structure:**

The `whitelist.csv` file should be a CSV file with three columns: `address`, `network`, and `coin`. The first line must be the header. For example:

```csv
"address","network","coin"
"0x1234567890abcdef1234567890abcdef12345678","Ethereum","ETH"
"TWNFJdxxuaF1it5UkbWbqnfAgNU7JVu5hB","TRON","TRX"
```

**Configuration:**

Set the following environment variables to configure the whitelist:

```env
WHITELIST_CSV_PATH=whitelist
WHITELIST_CSV_FILE_NAME=whitelist.csv
```

**Volume Mapping:**

To ensure the `whitelist.csv` file is persisted and accessible to the Docker container, map it as a volume in your `docker-compose.prod.yml` file.

Create a folder named `whitelist` in the `apps/approver` directory (i.e., `/whitelist`).
Place your `whitelist.csv` file inside this folder.

Then, map this folder in the `docker-compose.prod.yml`:

```yaml
volumes:
      # ... other volume mappings
      - ./whitelist:/app/apps/approver/whitelist
```

Ensure the `WHITELIST_CSV_PATH` environment variable corresponds to the path used inside the container.

### Initiation trace log example:

```
{
  level: 'info',
  message: 'Init Approver started',
  metadata: { timestamp: '2024-02-21T08:54:11.990Z' },
  timestamp: '2024-02-21T08:54:11.990Z'
}
{
  level: 'info',
  message: 'Checking if Approver is paired already.',
  metadata: { timestamp: '2024-02-21T08:54:15.174Z' },
  timestamp: '2024-02-21T08:54:15.174Z'
}
{
  level: 'info',
  message: 'Approver needs to be paired, starts a pairing process...',
  metadata: { timestamp: '2024-02-21T08:54:16.071Z' },
  timestamp: '2024-02-21T08:54:16.071Z'
}
{
  level: 'info',
  message: 'Getting a pairing token.',
  metadata: { timestamp: '2024-02-21T08:54:16.075Z' },
  timestamp: '2024-02-21T08:54:16.075Z'
}
{
  level: 'info',
  message: 'Getting a pairing code',
  metadata: { timestamp: '2024-02-21T08:54:17.555Z' },
  timestamp: '2024-02-21T08:54:17.555Z'
}
{
  level: 'info',
  message: 'Pairing code: c754ce6d209dcc1b6f2312903ef31f0ac297b63e5dead29a6b877ecad8c77ada',
  metadata: { timestamp: '2024-02-21T08:54:17.560Z' },
  timestamp: '2024-02-21T08:54:17.560Z'
}
{
  level: 'info',
  message: 'Getting a signature key',
  metadata: { timestamp: '2024-02-21T08:54:17.562Z' },
  timestamp: '2024-02-21T08:54:17.562Z'
}
{
  level: 'info',
  message: 'signature key : eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJrdHkiOiJFQyIsIngiOiItWGJ6Qjdfa2I2cXNJdDRxTTg3cU5OMC1TeTVZWU9NbmN1R1F4U1E1YmZVIiwieSI6IjR6Qk9zR1Yza0NTek4zSW02cE1KSjZzcUJYVW03RHBfRjJmbWNhbEhGVzgiLCJjcnYiOiJQLTI1NiIsImtpZCI6Im01QXpWcWJjQURRK25hSmh5Y1E4b0JXTFJYYTBqeDVOQjEyeW1KQklyYlU9In19.eyJ2ZXJpZnlfa2V5Ijp7Imp3ayI6eyJrdHkiOiJFQyIsIngiOiItWGJ6Qjdfa2I2cXNJdDRxTTg3cU5OMC1TeTVZWU9NbmN1R1F4U1E1YmZVIiwieSI6IjR6Qk9zR1Yza0NTek4zSW02cE1KSjZzcUJYVW03RHBfRjJmbWNhbEhGVzgiLCJjcnYiOiJQLTI1NiIsImtpZCI6Im01QXpWcWJjQURRK25hSmh5Y1E4b0JXTFJYYTBqeDVOQjEyeW1KQklyYlU9In19LCJtZXNzYWdlIjoie1wiY3JlYXRvclwiOntcImVtYWlsXCI6XCJpc3N1ZXJAZXhhbXBsZS5jb21cIixcIm9yZ2FuaXphdGlvblwifX0iLCJtYWMiOiJhOGJiMjA3ZGRiMTk2MmE1YTg3MjY2YTkzYWI4MDlmOTY1MDcwN2U0NmNkOTE3M2FiYjZhOTE4MDYwY2Q3ODU2IiwiaWF0IjoxNzA4NTA1NjU3fQ.1ZBl8XRllNyoJNWNPaB6iAu9VbQh2Jcr0hXRPppD8wES1Z5ZckPXTe0eqBmmTtZS_l4Gtip7kwOfFMi-jNtbIA',
  metadata: { timestamp: '2024-02-21T08:54:17.578Z' },
  timestamp: '2024-02-21T08:54:17.578Z'
}
{
  level: 'info',
  message: 'Sending pairing data',
  metadata: { timestamp: '2024-02-21T08:54:17.581Z' },
  timestamp: '2024-02-21T08:54:17.581Z'
}
{
  level: 'info',
  message: 'Approver is waiting for approval',
  metadata: { timestamp: '2024-02-21T08:54:20.767Z' },
  timestamp: '2024-02-21T08:54:20.767Z'
}
{
  level: 'info',
  message: 'Init Approver completed, waiting for pairing process completion.',
  metadata: { timestamp: '2024-02-21T08:54:20.769Z' },
  timestamp: '2024-02-21T08:54:20.769Z'
}
[Nest] 4308  - 02/21/2024, 8:54:20 AM     LOG [NestApplication] Nest application successfully started +8819ms
{
  level: 'info',
  message: 'Refresh token completed',
  metadata: { timestamp: '2024-02-21T08:54:20.803Z' },
  timestamp: '2024-02-21T08:54:20.803Z'
}
{
  level: 'info',
  message: 'Scheduling next refresh token in 15 days',
  metadata: { timestamp: '2024-02-21T08:54:20.806Z' },
  timestamp: '2024-02-21T08:54:20.806Z'
}

```