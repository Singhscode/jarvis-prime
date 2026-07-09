#!/bin/bash
# Create GitHub Environments and Secrets for JARVIS PRIME
# Usage: GITHUB_TOKEN=your_token ./setup-environments.sh

set -e

OWNER="Singhscode"
REPO="jarvis-prime"
TOKEN=${GITHUB_TOKEN:-}

if [ -z "$TOKEN" ]; then
  echo "Error: GITHUB_TOKEN environment variable not set"
  echo "Usage: GITHUB_TOKEN=your_token ./setup-environments.sh"
  exit 1
fi

echo "Setting up GitHub Environments for $OWNER/$REPO..."

# Function to create environment
create_env() {
  local env_name=$1
  echo "Creating environment: $env_name"
  curl -X POST "https://api.github.com/repos/$OWNER/$REPO/environments/$env_name" \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    -d '{}' || echo "Environment may already exist"
}

# Function to add secret
add_secret() {
  local env_name=$1
  local secret_name=$2
  local secret_value=$3
  
  echo "Adding secret: $secret_name to $env_name"
  curl -X PUT "https://api.github.com/repos/$OWNER/$REPO/environments/$env_name/secrets/$secret_name" \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    -d "{\"encrypted_value\":\"$secret_value\"}" || echo "Failed to add secret"
}

# Create staging environment
create_env "staging"

# Create production environment
create_env "production"

echo "✅ Environments created!"
echo ""
echo "Now add these secrets to GitHub:"
echo "  Staging: STAGING_DEPLOY_SSH_KEY, STAGING_HOST, STAGING_USER, etc."
echo "  Production: PRODUCTION_DEPLOY_SSH_KEY, PRODUCTION_HOST, etc."
echo ""
echo "For manual setup, go to:"
echo "  https://github.com/$OWNER/$REPO/settings/environments"
