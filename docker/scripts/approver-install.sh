#!/bin/sh
set -e

rm -rf dist

printf "\n=============\nInstalling npm dependencies...\n"
cd /app
npm i --include-workspace-root=true --workspace=apps/approver

printf "\n=============\nBuilding worker...\n"
cd apps/approver
npm run build