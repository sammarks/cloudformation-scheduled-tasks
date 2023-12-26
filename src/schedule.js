const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb')
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns')

const scanPage = async (
  documentClient,
  maxItems = 25,
  items = [],
  lastEvaluatedKey = null
) => {
  console.info(
    `Scanning with ${maxItems} max items and ${items.length} items.`
  )
  console.info(`LastEvaluatedKey: ${lastEvaluatedKey}`)
  const params = {
    TableName: process.env.TASKS_TABLE,
    FilterExpression: '#executeTime <= :executeTime',
    ExpressionAttributeNames: {
      '#executeTime': 'executeTime'
    },
    ExpressionAttributeValues: {
      ':executeTime': new Date().getTime() / 1000
    }
  }
  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey
  }
  const { Items, LastEvaluatedKey } = await documentClient
    .send(new ScanCommand(params))
  const newItems = items.concat(Items)
  if (newItems.length >= maxItems) {
    console.info(`${newItems.length} >= ${maxItems} - returning value`)
    return newItems
  } else {
    if (LastEvaluatedKey) {
      console.info(
        `${newItems.length} < ${maxItems} - performing another scan`
      )
      return scanPage(documentClient, maxItems, newItems, LastEvaluatedKey)
    } else {
      console.info('No LastEvaluatedKey found. Returning results')
      return newItems
    }
  }
}

module.exports.handler = async () => {
  const sns = new SNSClient({})
  const dynamoDBClient = new DynamoDBClient({})
  const documentClient = DynamoDBDocumentClient.from(dynamoDBClient)
  const Items = await scanPage(documentClient)
  console.info(`Found ${Items.length} tasks to trigger...`)
  await Promise.all(
    Items.map(async ({ topicArn, payload, taskId }) => {
      console.info(
        `Triggering task ID '${taskId}' - sending to '${topicArn}'...`
      )
      await sns
        .send(new PublishCommand({
          TopicArn: topicArn,
          Message: JSON.stringify(payload || {})
        }))
      console.info(`Deleting '${taskId}'...`)
      await documentClient
        .send(new DeleteCommand({
          TableName: process.env.TASKS_TABLE,
          Key: { taskId }
        }))
    })
  )
}
