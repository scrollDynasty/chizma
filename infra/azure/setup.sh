#!/usr/bin/env bash
# One-time Azure setup for the Chizma API (test phase).
# Creates: resource group, FREE (F1) Linux App Service plan, Python 3.12 web app,
# and an OIDC identity so GitHub Actions can deploy without stored passwords.
#
# Requires: az (logged in: `az login`), gh (logged in), the GitHub repo already created.
# Usage:   LOCATION=germanywestcentral ./infra/azure/setup.sh
#          (Azure for Students limits regions; see `az policy assignment list`.)
set -euo pipefail

# Git Bash on Windows rewrites arguments like /subscriptions/... into file paths.
export MSYS_NO_PATHCONV=1

REPO="${REPO:-scrollDynasty/chizma}"
LOCATION="${LOCATION:-germanywestcentral}"
RG="${RG:-chizma-rg}"
PLAN="${PLAN:-chizma-plan}"
APP="${APP:-chizma-api-$(openssl rand -hex 3)}"
WEB_ORIGIN="${WEB_ORIGIN:-https://scrolldynasty.github.io}"

echo "==> Subscription: $(az account show --query name -o tsv)"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"

echo "==> Register the App Service resource provider (first use only)"
az provider register --namespace Microsoft.Web --wait

echo "==> Resource group $RG in $LOCATION"
az group create --name "$RG" --location "$LOCATION" --output none

echo "==> App Service plan $PLAN (Linux, F1 = free)"
az appservice plan create --name "$PLAN" --resource-group "$RG" --is-linux --sku F1 --output none

echo "==> Web app $APP"
az webapp create --name "$APP" --resource-group "$RG" --plan "$PLAN" \
  --runtime "PYTHON:3.12" --startup-file "bash startup.sh" --output none
az webapp update --name "$APP" --resource-group "$RG" --https-only true --output none
API_HOST="$(az webapp show --name "$APP" --resource-group "$RG" --query defaultHostName -o tsv)"
API_URL="https://$API_HOST"

echo "==> App settings (no secrets here; add those in the portal)"
az webapp config appsettings set --name "$APP" --resource-group "$RG" --output none --settings \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  CHIZMA_ENV=production \
  CHIZMA_DATABASE_URL=sqlite:////home/data/chizma.db \
  CHIZMA_CORS_ORIGINS="$WEB_ORIGIN" \
  CHIZMA_PUBLIC_API_URL="$API_URL" \
  CHIZMA_WEB_URL="$WEB_ORIGIN/chizma" \
  CHIZMA_AI_PROVIDER=fake

echo "==> GitHub OIDC identity for deployments"
CLIENT_ID="$(az ad app list --display-name "chizma-github-deploy" --query "[0].appId" -o tsv)"
if [ -z "$CLIENT_ID" ]; then
  CLIENT_ID="$(az ad app create --display-name "chizma-github-deploy" --query appId -o tsv)"
fi
az ad sp create --id "$CLIENT_ID" --output none 2>/dev/null || true
WEBAPP_ID="$(az webapp show --name "$APP" --resource-group "$RG" --query id -o tsv)"
az role assignment create --assignee "$CLIENT_ID" --role "Website Contributor" --scope "$WEBAPP_ID" --output none
# GitHub may present either the name-based or the ID-based subject; trust both.
OWNER_ID="$(gh api "repos/$REPO" --jq .owner.id)"
REPO_ID="$(gh api "repos/$REPO" --jq .id)"
OWNER="${REPO%%/*}"; NAME="${REPO##*/}"
for subject in "repo:$REPO:environment:azure-api"                "repo:$OWNER@$OWNER_ID/$NAME@$REPO_ID:environment:azure-api"; do
  cred_name="github-$(echo "$subject" | md5sum | cut -c1-8)"
  az ad app federated-credential create --id "$CLIENT_ID" --parameters "{
    \"name\": \"$cred_name\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"$subject\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" --output none 2>/dev/null || echo "    (credential for $subject already exists)"
done

echo "==> GitHub repository variables (identifiers only, not secrets)"
gh variable set AZURE_CLIENT_ID --repo "$REPO" --body "$CLIENT_ID"
gh variable set AZURE_TENANT_ID --repo "$REPO" --body "$TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID --repo "$REPO" --body "$SUBSCRIPTION_ID"
gh variable set AZURE_WEBAPP_NAME --repo "$REPO" --body "$APP"
gh variable set CHIZMA_API_URL --repo "$REPO" --body "$API_URL"

cat <<EOF

Done. API URL: $API_URL

Next steps (manual, in the Azure portal):
  1. Cost Management > Budgets: create a monthly budget with email alerts at \$5 and \$20.
  2. Later (M1): add secrets in Web app > Settings > Environment variables:
     OPENAI_API_KEY, CHIZMA_JWT_SECRET, CHIZMA_GITHUB_CLIENT_ID/SECRET, CHIZMA_GOOGLE_CLIENT_ID/SECRET.
Then re-run the "Deploy API" and "Deploy editor" workflows in GitHub Actions.
EOF
