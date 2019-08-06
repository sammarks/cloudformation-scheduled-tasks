const AWS = require('aws-sdk')

module.exports.handler = async (event) => {
  const documentClient = new AWS.DynamoDB.DocumentClient()
  return Promise.all(event.Records.map(async (record) => {
    console.info('Processing incoming scheduled task...')
    const message = JSON.parse(record.Sns.Message)
    console.info(message)
    const { executeTime, taskId, topicArn, payload = {} } = JSON.parse(record.Sns.Message)
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
    console.info(`${Items.length} items found matching task id '${taskId}'. Deleting...`)
    await Promise.all(Items.map((item) => {
      return documentClient.delete({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId: item.taskId, executeTime: item.executeTime }
      }).promise()
    }))
    if (executeTime) {
      console.info('executeTime is not falsy, creating new task...')
      await documentClient.update({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId, executeTime },
        UpdateExpression: 'SET #topicArn = :topicArn, #payload = :payload',
        ExpressionAttributeNames: {
          '#topicArn': 'topicArn',
          '#payload': 'payload'
        },
        ExpressionAttributeValues: {
          ':topicArn': topicArn,
          ':payload': payload
        }
      }).promise()
    }
  }))
}
