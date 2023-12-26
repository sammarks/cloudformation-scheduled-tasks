const lolex = require('lolex')

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const originalModule = jest.requireActual('@aws-sdk/lib-dynamodb')
  const sendMock = jest.fn()
  return {
    ...originalModule,
    DynamoDBDocumentClient: {
      from: () => ({
        send: sendMock
      })
    }
  }
})
jest.mock('@aws-sdk/client-sns', () => {
  const originalModule = jest.requireActual('@aws-sdk/client-sns')
  const sendMock = jest.fn()
  return {
    ...originalModule,
    SNSClient: jest.fn(() => ({
      send: sendMock
    }))
  }
})

const {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb')
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns')
const { handler } = require('../src/schedule')

let clock, dynamoSendMock, snsSendMock
beforeEach(() => {
  clock = lolex.install({ now: 20000 }) // unix seconds: 20
  dynamoSendMock = DynamoDBDocumentClient.from().send.mockImplementation(
    async (command) => Promise.resolve('success')
  )
  snsSendMock = new SNSClient().send.mockImplementation(() => Promise.resolve())
})
afterEach(() => {
  clock.uninstall()
  jest.clearAllMocks()
})

describe('schedule handler', () => {
  beforeEach(() => {
    process.env.TASKS_TABLE = 'tasks-table'
  })
  describe('when there are tasks in the past that need to be executed', () => {
    beforeEach(() => {
      dynamoSendMock
        .mockImplementationOnce(async () => ({
          LastEvaluatedKey: 'last-evaluated-key',
          Items: [
            {
              taskId: 'test-task-one',
              payload: { foo: 'bar' },
              topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
            }
          ]
        }))
        .mockImplementationOnce(async () => ({
          LastEvaluatedKey: null,
          Items: [
            {
              taskId: 'test-task-two',
              payload: { foo2: 'bar2' },
              topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
            }
          ]
        }))
      return handler()
    })
    it('scans for the items properly', () => {
      expect(dynamoSendMock).toHaveBeenCalledTimes(4)
      expect(dynamoSendMock.mock.calls[0][0]).toEqual(expect.any(ScanCommand))
      expect(dynamoSendMock.mock.calls[1][0]).toEqual(expect.any(ScanCommand))
      expect(dynamoSendMock.mock.calls[0][0].clientCommand.input).toEqual({
        TableName: 'tasks-table',
        FilterExpression: '#executeTime <= :executeTime',
        ExpressionAttributeNames: {
          '#executeTime': 'executeTime'
        },
        ExpressionAttributeValues: {
          ':executeTime': 20
        }
      })
      expect(dynamoSendMock.mock.calls[1][0].clientCommand.input.ExclusiveStartKey).toEqual('last-evaluated-key')
    })
    it('posts a message to the SNS topic with the payload', () => {
      expect(snsSendMock).toHaveBeenCalledTimes(2)
      expect(snsSendMock.mock.calls[0][0]).toEqual(expect.any(PublishCommand))
      expect(snsSendMock.mock.calls[1][0]).toEqual(expect.any(PublishCommand))
      expect(snsSendMock.mock.calls[0][0].input).toEqual({
        Message: JSON.stringify({ foo: 'bar' }),
        TopicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
      })
      expect(snsSendMock.mock.calls[1][0].input).toEqual({
        Message: JSON.stringify({ foo2: 'bar2' }),
        TopicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
      })
    })
    it('deletes all executed messages', () => {
      expect(dynamoSendMock.mock.calls[2][0]).toEqual(expect.any(DeleteCommand))
      expect(dynamoSendMock.mock.calls[3][0]).toEqual(expect.any(DeleteCommand))
      expect(dynamoSendMock.mock.calls[2][0].clientCommand.input).toEqual({
        TableName: 'tasks-table',
        Key: { taskId: 'test-task-one' }
      })
      expect(dynamoSendMock.mock.calls[3][0].clientCommand.input).toEqual({
        TableName: 'tasks-table',
        Key: { taskId: 'test-task-two' }
      })
    })
  })
  describe('when there are no tasks in the past that need to be executed', () => {
    beforeEach(() => {
      dynamoSendMock.mockImplementationOnce(async () => ({
        Items: []
      }))
      return handler()
    })
    it('does nothing', () => {
      expect(snsSendMock).not.toHaveBeenCalled()
      expect(dynamoSendMock).toHaveBeenCalledTimes(1) // The scan only.
    })
  })
  describe('when there are more than 25 items in the past that need to be executed', () => {
    beforeEach(() => {
      const task = {
        taskId: 'test-task-one',
        topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
      }
      dynamoSendMock
        .mockImplementationOnce(async () => ({
          LastEvaluatedKey: 'last-evaluated-key',
          Items: new Array(23).fill(task)
        }))
        .mockImplementationOnce(async () => ({
          LastEvaluatedKey: 'another-evaluated-key',
          Items: new Array(20).fill(task)
        }))
      return handler()
    })
    it('only executes the first 25', () => {
      expect(dynamoSendMock).toHaveBeenCalledTimes(2 + 43) // 2 scans, 43 entries to delete.
      expect(snsSendMock).toHaveBeenCalledTimes(43) // 43 entries to publish.
    })
  })
})
