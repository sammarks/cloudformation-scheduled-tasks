const { handler } = require('../src/ingest')
const AWS = require('aws-sdk-mock')

afterEach(() => {
  AWS.restore()
})

describe('ingest handler', () => {
  let event, updateStub, deleteStub, queryStub

  beforeEach(() => {
    process.env.TASKS_TABLE = 'tasks-table'
    event = {
      Records: [
        {
          Sns: {
            Message: JSON.stringify({
              executeTime: 20,
              taskId: 'test-task-id',
              topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic',
              payload: {
                foo: 'bar'
              }
            })
          }
        }
      ]
    }
    updateStub = jest.fn((params, callback) => callback(null, 'success'))
    deleteStub = jest.fn((params, callback) => callback(null, 'success'))
    AWS.mock('DynamoDB.DocumentClient', 'update', updateStub)
    AWS.mock('DynamoDB.DocumentClient', 'delete', deleteStub)
  })

  it('creates or updates the task', async () => {
    await handler(event)
    expect(updateStub.mock.calls.length).toEqual(1)
    expect(deleteStub.mock.calls.length).toEqual(0)
    expect(updateStub.mock.calls[0][0]).toEqual({
      TableName: 'tasks-table',
      Key: { taskId: 'test-task-id', executeTime: 20 },
      UpdateExpression: 'SET #executeTime = :executeTime, #taskId = :taskId, #topicArn = :topicArn, #payload = :payload',
      ExpressionAttributeNames: {
        '#executeTime': 'executeTime',
        '#taskId': 'taskId',
        '#topicArn': 'topicArn',
        '#payload': 'payload'
      },
      ExpressionAttributeValues: {
        ':executeTime': 20,
        ':taskId': 'test-task-id',
        ':topicArn': 'arn:aws:sns:us-east-1:123456789:test-topic',
        ':payload': { foo: 'bar' }
      }
    })
  })

  it('defaults payload to an empty object', async () => {
    event.Records[0].Sns.Message = JSON.stringify({
      executeTime: 20,
      taskId: 'test-task-id',
      topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
    })
    await handler(event)
    expect(updateStub.mock.calls[0][0].ExpressionAttributeValues[':payload']).toEqual({})
    expect(deleteStub.mock.calls.length).toEqual(0)
  })

  it('deletes entries matching the task ID if executeTime is falsy', async () => {
    queryStub = jest.fn((params, callback) => callback(null, {
      Items: [
        { taskId: 'test-task-id', executeTime: 123 }
      ]
    }))
    AWS.mock('DynamoDB.DocumentClient', 'query', queryStub)
    event.Records[0].Sns.Message = JSON.stringify({
      executeTime: null,
      taskId: 'test-task-id',
      topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
    })
    await handler(event)
    expect(updateStub.mock.calls.length).toEqual(0)
    expect(deleteStub.mock.calls.length).toEqual(1)
    expect(deleteStub.mock.calls[0][0]).toEqual({
      TableName: 'tasks-table',
      Key: { taskId: 'test-task-id', executeTime: 123 }
    })
    expect(queryStub.mock.calls.length).toEqual(1)
    expect(queryStub.mock.calls[0][0]).toEqual({
      TableName: 'tasks-table',
      KeyConditionExpression: '#taskId = :taskId',
      ExpressionAttributeNames: {
        '#taskId': 'taskId'
      },
      ExpressionAttributeValues: {
        ':taskId': 'test-task-id'
      }
    })
  })
})
