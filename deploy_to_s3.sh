#!/bin/bash
set -x

aws s3 sync ./build/ s3://sheacloud-cloud-inventory-ui-primary/ --delete
INVALIDATION_ID=$(aws cloudfront create-invalidation --distribution-id E37BBRWAG8FP1Q --paths "/*" | jq -r '.Invalidation.Id')
aws cloudfront wait invalidation-completed --distribution-id E37BBRWAG8FP1Q --id $INVALIDATION_ID