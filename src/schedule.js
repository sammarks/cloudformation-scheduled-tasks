const AWS = require('aws-sdk')

const scanPage = async (documentClient, maxItems = 25, items = [], lastEvaluatedKey = null) => {
  console.info(`Scanning with ${maxItems} max items and ${items.length} items.`)
  console.info(`LastEvaluatedKey: ${lastEvaluatedKey}`)
  const params = {
    TableName: process.env.TASKS_TABLE,
    FilterExpression: '#executeTime <= :executeTime',
    ExpressionAttributeNames: {
      '#executeTime': 'executeTime'
    },
    ExpressionAttributeValues: {
      ':executeTime': (new Date()).getTime() / 1000
    }
  }
  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey
  }
  const { Items, LastEvaluatedKey } = await documentClient.scan(params).promise()
  const newItems = items.concat(Items)
  if (newItems.length >= maxItems) {
    console.info(`${newItems.length} >= ${maxItems} - returning value`)
    return newItems
  } else {
    if (LastEvaluatedKey) {
      console.info(`${newItems.length} < ${maxItems} - performing another scan`)
      return scanPage(documentClient, maxItems, newItems, LastEvaluatedKey)
    } else {
      console.info('No LastEvaluatedKey found. Returning results')
      return newItems
    }
  }
}

module.exports.handler = async () => {
  const sns = new AWS.SNS()
  const documentClient = new AWS.DynamoDB.DocumentClient()
  const Items = await scanPage(documentClient)
  console.info(`Found ${Items.length} tasks to trigger...`)
  await Promise.all(Items.map(async ({ topicArn, payload, taskId }) => {
    console.info(`Triggering task ID '${taskId}' - sending to '${topicArn}'...`)
    await sns.publish({
      TopicArn: topicArn,
      Message: JSON.stringify(payload || {})
    }).promise()
    console.info(`Deleting '${taskId}'...`)
    await documentClient.delete({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise()
  }))
}
