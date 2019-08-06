const AWS = require('aws-sdk')

module.exports.handler = async () => {
  const sns = new AWS.SNS()
  const documentClient = new AWS.DynamoDB.DocumentClient()
  const { Items } = await documentClient.query({
    TableName: process.env.TASKS_TABLE,
    KeyConditionExpression: '#taskId != :taskId AND #executeTime <= :executeTime',
    ExpressionAttributeNames: {
      '#taskId': 'taskId',
      '#executeTime': 'executeTime'
    },
    ExpressionAttributeValues: {
      ':taskId': '',
      ':executeTime': (new Date()).getTime() / 1000
    }
  }).promise()
  await Promise.all(Items.map(async ({ topicArn, payload, taskId }) => {
    await sns.publish({
      TopicArn: topicArn,
      Message: JSON.stringify(payload)
    }).promise()
    await documentClient.delete({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise()
  }))
}
