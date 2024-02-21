# Approver App

This standalone project is designed to be deployed on a user's own server, enabling integration with Inabit from remote. Its primary purpose is to facilitate the approval of pending transactions within a gated approvals flow.

## Functionality

Upon running, the application must successfully initialize and communicate with Inabit. This involves several steps depending on the initiation state. If the 'signer' is approved, the handling of pending transaction flow may proceed.

### First Run

During the first run, a pairing process is initiated. This includes:

1. Logging into Inabit using the provided login token.
2. Validating the user's current state.
3. Requesting a pairing token.
4. Producing an encrypted key used for signing, saving it to a mapped volume.
5. Sending pairing data to Inabit and requesting the 'Owner' to authorize the approver.
6. Refreshing the login token i.e. acquiring automatically a new valid login token.

### Recurring Runs

For subsequent runs, after validating that the user is paired, the application continues its operation as usual.

### Initiation Errors

If anything goes wrong during the initiation stage, the approver initiation process will be aborted.

## Prerequisites

1. An initial login token of a valid user within Inabit with the role: 'apiSigner'.
2. Enabled communication with the Inabit server (valid URL and whitelisted IPs and ports).

## Deployment

From within the root directory `inabit/inabit-remote`:

 ### Set Login Token
 
 The login token is approver's token valid for 30 days,
 
 allowing authentication with Inabit.

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
REFRESH_LOGIN_TOKEN_IN_MINUTES=21600 # 15 days in seconds
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

The required config can be provided in 2 ways:

1. Baked into the docker by building the docker with a valid `.env` file.
2. Through the `docker-compose.prod.yml` file variables override section `environment`.

In case using `.env` is selected, remember to modify or remove the `environment:` section, from `docker-compose.prod.yml`.
In case of a change of the `.env` , a new docker image build must proceed. 

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
3. a pairing code is produced in the approver (log trace), and must be passed *directly* to the owner for pairing completion.

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
Inabit will send a request to the Approver to handle the requested transaction approval, and sign on the approve/reject decision.

In order to handle transaction approvals: 

1. Approver needs to be in `Paird` status.
2. Configure an external validation url ('endpoint'), implementing the Approver's required approval logics:

   1.  The external validation endpoint is expected to expose a 'post' http endpoint for validation purpose. 
   
      *connectivity to the endpoint must be enabled.

      ```env
                 
            VALIDATION_CALLBACK_URL=http://koko.com/validation
            
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



### Mock validation

It is also possible to mock external validation url using a predefined endpoint (transaction/validate) on the Approver,
and control the required outcome.
Using the following configuration 
```env
VALIDATION_CALLBACK_URL=[APPROVER_URL]transaction/validate # replace [APPROVER_URL] with the Approver's url. 
VALIDATION_MOCK_SET_RESULT=rejected   # allowed: approved / rejected / exception
```

### Initiation trace log:
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
  message: 'signature key : eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJrdHkiOiJFQyIsIngiOiItWGJ6Qjdfa2I2cXNJdDRxTTg3cU5OMC1TeTVZWU9NbmN1R1F4U1E1YmZVIiwieSI6IjR6Qk9zR1Yza0NTek4zSW02cE1KSjZzcUJYVW03RHBfRjJmbWNhbEhGVzgiLCJjcnYiOiJQLTI1NiIsImtpZCI6Im01QXpWcWJjQURRK25hSmh5Y1E4b0JXTFJYYTBqeDVOQjEyeW1KQklyYlU9In19.eyJ2ZXJpZnlfa2V5Ijp7Imp3ayI6eyJrdHkiOiJFQyIsIngiOiItWGJ6Qjdfa2I2cXNJdDRxTTg3cU5OMC1TeTVZWU9NbmN1R1F4U1E1YmZVIiwieSI6IjR6Qk9zR1Yza0NTek4zSW02cE1KSjZzcUJYVW03RHBfRjJmbWNhbEhGVzgiLCJjcnYiOiJQLTI1NiIsImtpZCI6Im01QXpWcWJjQURRK25hSmh5Y1E4b0JXTFJYYTBqeDVOQjEyeW1KQklyYlU9In19LCJtZXNzYWdlIjoie1wiY3JlYXRvclwiOntcImVtYWlsXCI6XCJpc3N1ZXJAZXhhbXBsZS5jb21cIixcIm9yZ2FuaXphdGlvbk5hbWVcIjpcIm15LW9yZ2FuaXphdGlvblwifX0iLCJtYWMiOiJhOGJiMjA3ZGRiMTk2MmE1YTg3MjY2YTkzYWI4MDlmOTY1MDcwN2U0NmNkOTE3M2FiYjZhOTE4MDYwY2Q3ODU2IiwiaWF0IjoxNzA4NTA1NjU3fQ.1ZBl8XRllNyoJNWNPaB6iAu9VbQh2Jcr0hXRPppD8wES1Z5ZckPXTe0eqBmmTtZS_l4Gtip7kwOfFMi-jNtbIA',
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