const AWS = require('aws-sdk')

module.exports.handler = async (event) => {
  const documentClient = new AWS.DynamoDB.DocumentClient()
  return Promise.all(event.Records.map(async (record) => {
    const { executeTime, taskId, topicArn, payload = {} } = JSON.parse(record.Sns.Message)
    if (executeTime) {
      await documentClient.update({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId },
        UpdateExpression: 'SET #executeTime = :executeTime, #topicArn = :topicArn, #payload = :payload',
        ExpressionAttributeNames: {
          '#executeTime': 'executeTime',
          '#topicArn': 'topicArn',
          '#payload': 'payload'
        },
        ExpressionAttributeValues: {
          ':executeTime': executeTime,
          ':topicArn': topicArn,
          ':payload': payload
        }
      }).promise()
    } else {
      await documentClient.delete({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId }
      }).promise()
    }
  }))
}
