rm -f ./sam-template.yaml ./packaged-template.yaml

sls sam export --output ./sam-template.yaml

aws cloudformation package \
  --template-file ./sam-template.yaml \
  --s3-bucket cloudformation-scheduled-tasks \
  --output-template-file packaged-template.yaml

PACKAGE_VERSION=$(node -p -e "require('./package.json').version")
aws s3 cp ./packaged-template.yaml "s3://cloudformation-scheduled-tasks/$PACKAGE_VERSION/template.yaml"
aws s3 cp ./packaged-template.yaml "s3://cloudformation-scheduled-tasks/template.yaml"
