const AWS = require('aws-sdk')

module.exports.handler = async () => {
  const sns = new AWS.SNS()
  const documentClient = new AWS.DynamoDB.DocumentClient()
  const { Items } = await documentClient.scan({
    TableName: process.env.TASKS_TABLE,
    FilterExpression: '#executeTime <= :executeTime',
    ExpressionAttributeNames: {
      '#executeTime': 'executeTime'
    },
    ExpressionAttributeValues: {
      ':executeTime': (new Date()).getTime() / 1000
    }
  }).promise()
  console.info(`Found ${Items.length} tasks to trigger...`)
  await Promise.all(Items.map(async ({ topicArn, payload, taskId }) => {
    console.info(`Triggering task ID '${taskId}' - sending to '${topicArn}'...`)
    await sns.publish({
      TopicArn: topicArn,
      Message: JSON.stringify(payload)
    }).promise()
    console.info(`Deleting '${taskId}'...`)
    await documentClient.delete({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise()
  }))
}
