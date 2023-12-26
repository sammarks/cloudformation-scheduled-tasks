const { DynamoDBDocumentClient, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb')

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
afterEach(() => {
  jest.clearAllMocks()
})

const { handler } = require('../src/ingest')

describe('ingest handler', () => {
  let event, sendMock

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
    sendMock = DynamoDBDocumentClient.from().send.mockImplementation(async command => Promise.resolve('success'))
  })

  it('creates or updates the task', async () => {
    await handler(event)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(expect.any(UpdateCommand))
    expect(sendMock.mock.calls[0][0].clientCommand.input).toEqual(
      expect.objectContaining({
        TableName: 'tasks-table',
        Key: { taskId: 'test-task-id' },
        UpdateExpression:
          'SET #executeTime = :executeTime, #executeHuman = :executeHuman, #topicArn = :topicArn, #payload = :payload',
        ExpressionAttributeNames: {
          '#executeTime': 'executeTime',
          '#executeHuman': 'executeHuman',
          '#topicArn': 'topicArn',
          '#payload': 'payload'
        },
        ExpressionAttributeValues: {
          ':executeTime': 20,
          ':executeHuman': new Date(20000).toString(),
          ':topicArn': 'arn:aws:sns:us-east-1:123456789:test-topic',
          ':payload': { foo: 'bar' }
        }
      })
    )
  })

  it('defaults payload to an empty object', async () => {
    event.Records[0].Sns.Message = JSON.stringify({
      executeTime: 20,
      taskId: 'test-task-id',
      topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
    })
    await handler(event)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(expect.any(UpdateCommand))
    expect(sendMock.mock.calls[0][0].clientCommand.input.ExpressionAttributeValues[':payload']).toEqual({})
  })

  it('deletes the entry if executeTime is falsy', async () => {
    event.Records[0].Sns.Message = JSON.stringify({
      executeTime: null,
      taskId: 'test-task-id',
      topicArn: 'arn:aws:sns:us-east-1:123456789:test-topic'
    })
    await handler(event)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(expect.any(DeleteCommand))
    expect(sendMock.mock.calls[0][0].clientCommand.input).toEqual(expect.objectContaining({
      TableName: 'tasks-table',
      Key: { taskId: 'test-task-id' }
    }))
  })
})
