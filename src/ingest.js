const AWS = require('aws-sdk')

module.exports.handler = async (event) => {
  const documentClient = new AWS.DynamoDB.DocumentClient()
  return Promise.all(event.Records.map(async (record) => {
    const { executeTime, taskId, topicArn, payload = {} } = JSON.parse(record.Sns.Message)
    console.info(`Processing incoming task request: ${taskId}...`)
    if (executeTime) {
      console.info(`Creating task '${taskId}' to execute at '${executeTime}'...`)
      await documentClient.update({
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
      }).promise()
    } else {
      console.info(`Deleting task '${taskId}'...`)
      await documentClient.delete({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId }
      }).promise()
    }
  }))
}
