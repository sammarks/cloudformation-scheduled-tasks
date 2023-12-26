const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb')

module.exports.handler = async (event) => {
  const dynamoDbClient = new DynamoDBClient({})
  const documentClient = DynamoDBDocumentClient.from(dynamoDbClient)
  return Promise.all(event.Records.map(async (record) => {
    const { executeTime, taskId, topicArn, payload = {} } = JSON.parse(record.Sns.Message)
    console.info(`Processing incoming task request: ${taskId}...`)
    if (executeTime) {
      console.info(`Creating task '${taskId}' to execute at '${executeTime}'...`)
      await documentClient.send(new UpdateCommand({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId },
        UpdateExpression: 'SET #executeTime = :executeTime, #executeHuman = :executeHuman, #topicArn = :topicArn, #payload = :payload',
        ExpressionAttributeNames: {
          '#executeTime': 'executeTime',
          '#executeHuman': 'executeHuman',
          '#topicArn': 'topicArn',
          '#payload': 'payload'
        },
        ExpressionAttributeValues: {
          ':executeTime': executeTime,
          ':executeHuman': (new Date(executeTime * 1000)).toString(),
          ':topicArn': topicArn,
          ':payload': payload
        }
      }))
    } else {
      console.info(`Deleting task '${taskId}'...`)
      await documentClient.send(new DeleteCommand({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId }
      }))
    }
  }))
}
