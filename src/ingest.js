const AWS = require('aws-sdk')

module.exports.handler = async (event) => {
  const documentClient = new AWS.DynamoDB.DocumentClient()
  return Promise.all(event.Records.map(async (record) => {
    const { executeTime, taskId, topicArn, payload = {} } = JSON.parse(record.Sns.Message)
    if (executeTime) {
      await documentClient.update({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId, executeTime },
        UpdateExpression: 'SET #executeTime = :executeTime, #taskId = :taskId, #topicArn = :topicArn, #payload = :payload',
        ExpressionAttributeNames: {
          '#executeTime': 'executeTime',
          '#taskId': 'taskId',
          '#topicArn': 'topicArn',
          '#payload': 'payload'
        },
        ExpressionAttributeValues: {
          ':executeTime': executeTime,
          ':taskId': taskId,
          ':topicArn': topicArn,
          ':payload': payload
        }
      }).promise()
    } else {
      const { Items } = await documentClient.query({
        TableName: process.env.TASKS_TABLE,
        KeyConditionExpression: '#taskId = :taskId',
        ExpressionAttributeNames: {
          '#taskId': 'taskId'
        },
        ExpressionAttributeValues: {
          ':taskId': taskId
        }
      }).promise()
      await Promise.all(Items.map((item) => {
        return documentClient.delete({
          TableName: process.env.TASKS_TABLE,
          Key: { taskId: item.taskId, executeTime: item.executeTime }
        }).promise()
      }))
    }
  }))
}
