// Phase 11 automation worker — PRODUCTION Azure Container Apps definition.
// This is declarative infrastructure only. It contains no secret values and is
// not applied by CI or this release bundle.

@description('Azure region for production resources.')
param location string = resourceGroup().location
@description('Name of the production Container Apps managed environment.')
param managedEnvironmentName string
@description('Name of the production automation worker Container App.')
param workerAppName string
@description('Log Analytics workspace customer ID (GUID).')
param logAnalyticsCustomerId string
@description('Log Analytics shared key; supply only as a secure deployment input.')
@secure()
param logAnalyticsSharedKey string
@description('Production Azure Container Registry login server.')
param acrLoginServer string
@description('Immutable worker image: <acr>/<repository>:sha-<40 lowercase hex SHA>.')
param workerImage string
@description('Production user-assigned identity resource ID for ACR pull and Key Vault reads.')
param userAssignedIdentityResourceId string
@description('Production Key Vault URI for SUPABASE_URL. This is a reference, never a secret value.')
param supabaseUrlSecretUri string
@description('Production Key Vault URI for SUPABASE_SERVICE_ROLE_KEY. This is a reference, never a secret value.')
param supabaseServiceRoleKeySecretUri string
@description('Non-secret unique production worker identifier.')
param automationWorkerId string = 'phase11-worker-production-1'
@description('Container-local health probe port.')
@minValue(1)
@maxValue(65535)
param automationWorkerHealthPort int = 8080
@description('Worker drain grace period in milliseconds.')
@minValue(1000)
@maxValue(300000)
param automationWorkerDrainGraceMs int = 30000
param workerCpu string = '0.25'
param workerMemory string = '0.5Gi'

// ACA expresses termination grace in seconds. This allows the complete worker
// drain interval plus ten seconds before forced termination.
var terminationGracePeriodSeconds = automationWorkerDrainGraceMs / 1000 + 10
var supabaseUrlSecretName = 'supabase-url'
var supabaseServiceRoleKeySecretName = 'supabase-service-role-key'

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

// Separate from the production API App Service. Ingress is deliberately absent:
// the worker accepts no network traffic and ACA uses the container-local probes.
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
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: acrLoginServer
          identity: userAssignedIdentityResourceId
        }
      ]
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
      terminationGracePeriodSeconds: terminationGracePeriodSeconds
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
          // The image command is the reviewed worker command; this template
          // never overrides it. No external-provider credentials are injected.
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
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

output workerAppName string = workerApp.name
output workerAppResourceId string = workerApp.id
output managedEnvironmentResourceId string = managedEnvironment.id
output effectiveTerminationGracePeriodSeconds int = terminationGracePeriodSeconds
