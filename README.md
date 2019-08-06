![][header-image]

[![CircleCI](https://img.shields.io/circleci/build/github/sammarks/cloudformation-scheduled-tasks/master)](https://circleci.com/gh/sammarks/cloudformation-scheduled-tasks)
[![Coveralls](https://img.shields.io/coveralls/sammarks/cloudformation-scheduled-tasks.svg)](https://coveralls.io/github/sammarks/cloudformation-scheduled-tasks)
[![Dev Dependencies](https://david-dm.org/sammarks/cloudformation-scheduled-tasks/dev-status.svg)](https://david-dm.org/sammarks/cloudformation-scheduled-tasks?type=dev)
[![Donate](https://img.shields.io/badge/donate-paypal-blue.svg)](https://paypal.me/sammarks15)

`cloudformation-scheduled-tasks` is an AWS CloudFormation template generated using the
[Serverless Framework](https://serverless.com) designed to trigger any SNS-compatible AWS
event (Lambda function, Email, Text Message, etc) at a specific time.

## Get Started

It's simple! Click this fancy button:

[![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=scheduled-tasks&templateURL=https://cloudformation-scheduled-tasks.s3.amazonaws.com/template.yaml)

Then give the stack a name, and configure it:

| Parameter | Default Value | Description |
| --- | --- | --- |
| PollingSchedule | `rate(5 minutes)` | The CloudWatch ScheduleExpression defining the interval the polling Lambda runs at. |
| ReadCapacityUnits | 1 | The read capacity units for the Scheduled Tasks DynamoDB table. |
| WriteCapacityUnits | 1 | The write capacity units for the Scheduled Tasks DynamoDB table. |
| DestinationArns | | A comma-separated list of possible destination SNS topic ARNS for permissioning the polling Lambda. |

Finally, reference the outputs inside another stack, or in your code:

| Output | Description |
| --- | --- |
| IngestSNSTopicArn | The ARN of the ingest SNS topic. Read below for what data to send to this. |

Once the stack is deployed, send a new message to the SNS topic to schedule a task:

```js
sns.publish({
  TopicArn: process.env.INGEST_TOPIC_ARN,
  Message: JSON.stringify({
    executeTime: moment().add(1, 'hour').unix(),
    taskId: 'achieve-world-peace-today',
    topicArn: 'arn:aws:sns:us-east-1:123456789:achieve-world-peace',
    payload: {
      when: moment().format()
    }
  })
})
```

You can also update a task to execute at a new time or with a different payload by sending it again:

```js
sns.publish({
  TopicArn: process.env.INGEST_TOPIC_ARN,
  Message: JSON.stringify({
    executeTime: moment().add(1, 'hour').add(1, 'day').unix(),
    taskId: 'achieve-world-peace-today',
    topicArn: 'arn:aws:sns:us-east-1:123456789:achieve-world-peace',
    payload: {
      when: moment().add(1, 'day').format()
    }
  })
})
```

You can delete a task by passing a falsy `executeTime`:

```js
sns.publish({
  TopicArn: process.env.INGEST_TOPIC_ARN,
  Message: JSON.stringify({
    executeTime: null,
    taskId: 'achieve-world-peace-today'
  })
})
```

### Usage in Another Stack or Serverless

Add something like this underneath resources:

```yaml
subscriptionExpiredTopic:
  Type: AWS::SNS::Topic
  Properties: {}
otherTopic:
  Type: AWS::SNS::Topic
  Properties: {}
scheduledTasksStack:
  Type: AWS::CloudFormation::Stack
  Properties:
    TemplateURL: https://cloudformation-scheduled-tasks.s3.amazonaws.com/VERSION/template.yaml
    Parameters:
      PollingSchedule: 'rate(5 minutes)'
      ReadCapacityUnits: 1
      WriteCapacityUnits: 1
      DestinationArns:
        'Fn::Join':
          - ','
          - - Ref: subscriptionExpiredTopic
          - - Ref: otherTopic
```

And then when you want to reference the ingest topic in your environment variables:

```yaml
environment:
  SCHEDULED_TASK_INGEST:
    Fn::GetAtt:
      - scheduledTasksStack
      - 'Outputs.IngestSNSTopicArn'
```

**Note:** This stack will require the `CAPABILITY_AUTO_EXPAND` capability when deploying
the parent stack with CloudFormation. If you are using the Serverless framework, you can
"trick" it into adding the required capabilities by adding this to your `serverless.yaml`:

```yaml
resources:
  Transform: 'AWS::Serverless-2016-10-31' # Trigger Serverless to add CAPABILITY_AUTO_EXPAND
  Resources:
    otherResource: # ... all of your original resources
```

### What's deployed?

- Two Lambda Functions (Schedule and Ingest)
- A DynamoDB table (with configurable provisioned capacity)
- A SNS Topic
- IAM Permissions for the Schedule Lambda

### How does it work?

The best way to describe this is to go through what each lambda function is responsible for:

#### ingest

The Ingest Lambda is responsible for processing incoming messages from the ingest SNS topic.
If a new message comes in with a truthy `executeTime`, it updates the scheduled tasks table
inside DynamoDB with the passed payload, topic ARN, and execution time (in unix time, seconds).

If the `executeTime` is falsy, it attempts to delete the existing record from DynamoDB so it
is not executed.

#### schedule

The Schedule Lambda is run periodically (you can configure the interval in the stack parameters).
When it runs, it queries the scheduled tasks table in DynamoDB for any execution times less than
the current time. If it finds any, it sends a message to their topic ARN containing the payload,
and then deletes the item from the table. If the SNS posting fails, it leaves the item in the
table to be processed later.

### A note on duplicate calls

_It is possible_ under some less-than-ideal circumstances for an SNS message to be sent out twice
for the same execution. Currently this will only happen if the initial message is sent out correctly,
but then removing the record from DynamoDB fails.

**Please write your messaging handling code to respond to duplicates and ignore them.**

### Accessing Previous Versions & Upgrading

Each time a release is made in this repository, the corresponding template is available at:

```
https://cloudformation-scheduled-tasks.s3.amazonaws.com/VERSION/template.yaml
```

**On upgrading:** I actually _recommend_ you lock the template you use to a specific version.
Then, if you want to update to a new version, all you have to change in your CloudFormation
template is the version and AWS will automatically delete the old stack and re-create the
new one for you.

## Features

- Schedule Lambda functions to be run at a certain time through the use of an SNS topic.
- Schedule other AWS SNS-compatbiles as well.
- Update or cancel existing tasks by using their user-defined unique identifier.
- Because it's all through SNS and DynamoDB, the entire functionality is self-contained within this
  CloudFormation template.
- Deploy with other CloudFormation-compatible frameworks (like the Serverless framework).

## Why use this?

Right now Lambda supports executing functions at an interval _very well._ It unfortunately does not
support running tasks at a specific time very well.

Suppose you have built your own subscription system, and you need to keep track of when subscriptions
are about to expire, have expired, or are currently expiring. Since the only data you have stored is
_when_ the subscription expires, it makes sense to automatically create a "scheduled task" whenever
updating that expiration date that schedules the actions you would like to take on the expiration
of the subscription.

Sure, you could also roll your own solution to this, but why do that when there is a ready-to-deploy
solution already out there?

[header-image]: https://raw.githubusercontent.com/sammarks/art/master/cloudformation-scheduled-tasks/header.jpg
