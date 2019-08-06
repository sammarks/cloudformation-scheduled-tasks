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

  describe('when a task with the same task ID already exists and executeTime is falsy', () => {
    beforeEach(async () => {
      queryStub = jest.fn((params, callback) => callback(null, {
        Items: [
          { taskId: 'test-task-id', executeTime: 10 },
          { taskId: 'test-task-id', executeTime: 20 }
        ]
      }))
      AWS.mock('DynamoDB.DocumentClient', 'query', queryStub)
      event.Records[0].Sns.Message = JSON.stringify({
        executeTime: null,
        taskId: 'test-task-id',
        topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
      })
      await handler(event)
    })
    it('queries for the existing tasks properly', () => {
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
    it('deletes the old tasks', () => {
      expect(deleteStub.mock.calls.length).toEqual(2)
      expect(deleteStub.mock.calls[0][0]).toEqual({
        TableName: 'tasks-table',
        Key: { taskId: 'test-task-id', executeTime: 10 }
      })
      expect(deleteStub.mock.calls[1][0]).toEqual({
        TableName: 'tasks-table',
        Key: { taskId: 'test-task-id', executeTime: 20 }
      })
    })
    it('does not create the new task', () => {
      expect(updateStub.mock.calls.length).toEqual(0)
    })
  })

  describe('when a task with the same task ID does not already exist', () => {
    beforeEach(async () => {
      queryStub = jest.fn((params, callback) => callback(null, { Items: [] }))
      AWS.mock('DynamoDB.DocumentClient', 'query', queryStub)
      await handler(event)
    })
    it('does not delete the old tasks', () => {
      expect(deleteStub.mock.calls.length).toEqual(0)
    })
  })

  describe('when executeTime is not falsy', () => {
    beforeEach(async () => {
      queryStub = jest.fn((params, callback) => callback(null, { Items: [] }))
      AWS.mock('DynamoDB.DocumentClient', 'query', queryStub)
      await handler(event)
    })
    it('creates the new task', () => {
      expect(updateStub.mock.calls.length).toEqual(1)
      expect(updateStub.mock.calls[0][0]).toEqual({
        TableName: 'tasks-table',
        Key: { taskId: 'test-task-id', executeTime: 20 },
        UpdateExpression: 'SET #topicArn = :topicArn, #payload = :payload',
        ExpressionAttributeNames: {
          '#topicArn': 'topicArn',
          '#payload': 'payload'
        },
        ExpressionAttributeValues: {
          ':topicArn': 'arn:aws:sns:us-east-1:123456789:test-topic',
          ':payload': { foo: 'bar' }
        }
      })
    })
  })

  describe('when the payload is not provided', () => {
    beforeEach(async () => {
      queryStub = jest.fn((params, callback) => callback(null, { Items: [] }))
      AWS.mock('DynamoDB.DocumentClient', 'query', queryStub)
      event.Records[0].Sns.Message = JSON.stringify({
        executeTime: 20,
        taskId: 'test-task-id',
        topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
      })
      await handler(event)
    })
    it('defaults it to an empty object', () => {
      expect(updateStub.mock.calls[0][0].ExpressionAttributeValues[':payload']).toEqual({})
      expect(deleteStub.mock.calls.length).toEqual(0)
    })
  })
})
