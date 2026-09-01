// =============================================================================
// Phase 11 automation worker — STAGING Azure Container Apps definition.
//
// Declarative definition for the separately supervised Phase 11 worker in a
// STAGING environment. It defines:
//   - a Container Apps managed environment (or reuses an existing one),
//   - a single ingress-DISABLED worker Container App,
//   - min/max replicas = 1,
//   - /live and /ready probes on AUTOMATION_WORKER_HEALTH_PORT,
//   - a termination grace period >= the worker drain grace,
//   - Key Vault secret references for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
//     resolved via a user-assigned managed identity.
//
// It NEVER contains secret values. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are passed only as Key Vault secret URIs (parameters) and resolved at runtime.
// It contains NO provider credentials (no Apollo/Hunter/Outreach/Calendar/webhook).
//
// This file does not, by itself, create resources. A human-approved deployment
// (az deployment group create ...) against a STAGING resource group is required.
// =============================================================================

// ----------------------------------------------------------------------------
// Parameters — all environment-specific identifiers are inputs. No defaults
// point at production. Secret VALUES are never parameters here; only Key Vault
// secret URIs are accepted.
// ----------------------------------------------------------------------------

@description('Azure region for staging resources, e.g. eastus.')
param location string = resourceGroup().location

@description('Name of the staging Container Apps managed environment.')
param managedEnvironmentName string

@description('Name of the staging worker Container App. Must not reference production.')
param workerAppName string

@description('Log Analytics workspace customer ID (GUID) for the ACA environment.')
param logAnalyticsCustomerId string

@description('Log Analytics workspace shared key. Provide via a secure deployment input; never commit the value.')
@secure()
param logAnalyticsSharedKey string

@description('Login server of the staging Azure Container Registry, e.g. myacrstaging.azurecr.io.')
param acrLoginServer string

@description('Fully qualified worker image reference, e.g. myacrstaging.azurecr.io/phase11-automation-worker:sha-<40hex>. Set by the deploy workflow.')
param workerImage string

@description('Resource ID of the user-assigned managed identity used for ACR pull and Key Vault secret read.')
param userAssignedIdentityResourceId string

@description('Key Vault secret URI for SUPABASE_URL, e.g. https://<vault>.vault.azure.net/secrets/supabase-url.')
param supabaseUrlSecretUri string

@description('Key Vault secret URI for SUPABASE_SERVICE_ROLE_KEY.')
param supabaseServiceRoleKeySecretUri string

@description('Non-secret, unique worker identity assigned by the platform for this staging replica.')
param automationWorkerId string = 'phase11-worker-staging-1'

@description('Health probe port exposed by the worker inside the container.')
@minValue(1)
@maxValue(65535)
param automationWorkerHealthPort int = 8080

@description('Worker drain grace in milliseconds. The ACA termination grace is derived to be >= this value.')
@minValue(1000)
@maxValue(300000)
param automationWorkerDrainGraceMs int = 30000

@description('Worker container CPU cores (ACA consumption allowed increments).')
param workerCpu string = '0.25'

@description('Worker container memory (must pair with CPU per ACA rules).')
param workerMemory string = '0.5Gi'

// ----------------------------------------------------------------------------
// Derived values
// ----------------------------------------------------------------------------

// ACA termination grace period is expressed in whole seconds and must be at
// least the worker drain grace. Round up from milliseconds, then add a small
// buffer so the worker always finishes draining before SIGKILL.
var drainGraceSeconds = automationWorkerDrainGraceMs / 1000
var terminationGracePeriodSeconds = drainGraceSeconds + 10

// Non-secret secret-reference names used inside the Container App.
var supabaseUrlSecretName = 'supabase-url'
var supabaseServiceRoleKeySecretName = 'supabase-service-role-key'

// ----------------------------------------------------------------------------
// Container Apps managed environment (staging)
// ----------------------------------------------------------------------------
resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: managedEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Worker Container App (staging) — ingress disabled, one replica
// ----------------------------------------------------------------------------
resource workerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: workerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      // No public ingress: this is a background worker, not an HTTP service.
      // Omitting the ingress block leaves the app without external or internal
      // ingress; the health port is used only by ACA probes.
      activeRevisionsMode: 'Single'

      // Pull the image using the user-assigned managed identity (no registry
      // username/password stored here).
      registries: [
        {
          server: acrLoginServer
          identity: userAssignedIdentityResourceId
        }
      ]

      // Secrets are Key Vault references resolved by the managed identity.
      // No secret values are present in this template.
      secrets: [
        {
          name: supabaseUrlSecretName
          keyVaultUrl: supabaseUrlSecretUri
          identity: userAssignedIdentityResourceId
        }
        {
          name: supabaseServiceRoleKeySecretName
          keyVaultUrl: supabaseServiceRoleKeySecretUri
          identity: userAssignedIdentityResourceId
        }
      ]
    }
    template: {
      // ACA holds the replica for this many seconds after SIGTERM before
      // SIGKILL. Derived to be >= the worker drain grace so the worker always
      // finishes draining first.
      terminationGracePeriodSeconds: terminationGracePeriodSeconds
      // One replica initially. Horizontal scale requires a separate approved
      // staging restart/scale/fairness rehearsal.
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
      containers: [
        {
          name: 'automation-worker'
          image: workerImage
          resources: {
            cpu: json(workerCpu)
            memory: workerMemory
          }
          // Command/entrypoint come from the image (npm run worker:automation
          // --workspace=apps/api). We intentionally do not override it here.
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              // Provider activation stays OFF for staging worker rollout.
              name: 'PHASE11_APOLLO_READ_ENABLED'
              value: 'false'
            }
            {
              name: 'AUTOMATION_WORKER_ID'
              value: automationWorkerId
            }
            {
              name: 'AUTOMATION_WORKER_HEALTH_PORT'
              value: string(automationWorkerHealthPort)
            }
            {
              name: 'AUTOMATION_WORKER_DRAIN_GRACE_MS'
              value: string(automationWorkerDrainGraceMs)
            }
            {
              name: 'SUPABASE_URL'
              secretRef: supabaseUrlSecretName
            }
            {
              name: 'SUPABASE_SERVICE_ROLE_KEY'
              secretRef: supabaseServiceRoleKeySecretName
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/live'
                port: automationWorkerHealthPort
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: automationWorkerHealthPort
              }
              // /ready is 200 only after durable compatibility + stale-lease
              // recovery, and 503 during drain.
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
    }
  }
}

// ----------------------------------------------------------------------------
// Outputs (non-secret)
// ----------------------------------------------------------------------------
output workerAppName string = workerApp.name
output workerAppResourceId string = workerApp.id
output managedEnvironmentResourceId string = managedEnvironment.id
output effectiveTerminationGracePeriodSeconds int = terminationGracePeriodSeconds
