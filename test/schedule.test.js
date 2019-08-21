const { handler } = require('../src/schedule')
const lolex = require('lolex')
const AWS = require('aws-sdk-mock')

let clock
beforeEach(() => {
  clock = lolex.install({ now: 20000 }) // unix seconds: 20
})
afterEach(() => {
  clock.uninstall()
  AWS.restore()
})

describe('schedule handler', () => {
  let publishStub, scanStub, deleteStub
  beforeEach(() => {
    process.env.TASKS_TABLE = 'tasks-table'
    publishStub = jest.fn((params, callback) => callback(null, 'Success'))
    deleteStub = jest.fn((params, callback) => callback(null, 'Success'))
    AWS.mock('DynamoDB.DocumentClient', 'delete', deleteStub)
    AWS.mock('SNS', 'publish', publishStub)
  })
  describe('when there are tasks in the past that need to be executed', () => {
    beforeEach(() => {
      scanStub = jest.fn((params, callback) => callback(null, {
        Items: [
          {
            taskId: 'test-task-one',
            payload: { foo: 'bar' },
            topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
          },
          {
            taskId: 'test-task-two',
            payload: { foo2: 'bar2' },
            topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
          }
        ]
      }))
      AWS.mock('DynamoDB.DocumentClient', 'scan', scanStub)
      return handler()
    })
    it('scans for the items properly', () => {
      expect(scanStub.mock.calls.length).toEqual(1)
      expect(scanStub.mock.calls[0][0]).toEqual({
        TableName: 'tasks-table',
        Limit: 25,
        FilterExpression: '#executeTime <= :executeTime',
        ExpressionAttributeNames: {
          '#executeTime': 'executeTime'
        },
        ExpressionAttributeValues: {
          ':executeTime': 20
        }
      })
    })
    it('posts a message to the SNS topic with the payload', () => {
      expect(publishStub.mock.calls.length).toEqual(2)
      expect(publishStub.mock.calls[0][0]).toEqual({
        Message: JSON.stringify({ foo: 'bar' }),
        TopicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
      })
      expect(publishStub.mock.calls[1][0]).toEqual({
        Message: JSON.stringify({ foo2: 'bar2' }),
        TopicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
      })
    })
    it('deletes all executed messages', () => {
      expect(deleteStub.mock.calls.length).toEqual(2)
      expect(deleteStub.mock.calls[0][0]).toEqual({
        TableName: 'tasks-table',
        Key: { taskId: 'test-task-one' }
      })
      expect(deleteStub.mock.calls[1][0]).toEqual({
        TableName: 'tasks-table',
        Key: { taskId: 'test-task-two' }
      })
    })
  })
  describe('when there are no tasks in the past that need to be executed', () => {
    beforeEach(() => {
      scanStub = jest.fn((params, callback) => callback(null, {
        Items: []
      }))
      AWS.mock('DynamoDB.DocumentClient', 'scan', scanStub)
      return handler()
    })
    it('does nothing', () => {
      expect(publishStub.mock.calls.length).toEqual(0)
      expect(deleteStub.mock.calls.length).toEqual(0)
    })
  })
})
