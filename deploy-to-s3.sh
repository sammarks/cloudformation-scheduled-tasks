rm -f ./packaged-template.yaml

cp package.json src/package.json
cp yarn.lock src/yarn.lock
cd src
yarn install --production --frozen-lockfile
cd ..

PACKAGE_VERSION=$(node -p -e "require('./package.json').version")

# us-east-1
aws cloudformation package \
  --template-file ./sam-template.yaml \
  --s3-bucket sammarks-cf-templates \
  --output-template-file packaged-template.yaml
aws s3 cp ./packaged-template.yaml "s3://sammarks-cf-templates/scheduled-tasks/$PACKAGE_VERSION/template.yaml"
aws s3 cp ./packaged-template.yaml "s3://sammarks-cf-templates/scheduled-tasks/template.yaml"

# us-east-2
aws cloudformation package \
  --template-file ./sam-template.yaml \
  --s3-bucket sammarks-cf-templates-us-east-2 \
  --output-template-file packaged-template.yaml
aws s3 cp ./packaged-template.yaml "s3://sammarks-cf-templates-us-east-2/scheduled-tasks/$PACKAGE_VERSION/template.yaml"
aws s3 cp ./packaged-template.yaml "s3://sammarks-cf-templates-us-east-2/scheduled-tasks/template.yaml"

rm -rf ./src/node_modules ./src/package.json ./src/yarn.lock ./packaged-template.yaml
