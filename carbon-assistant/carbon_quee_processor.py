import json
import boto3
from datetime import datetime
import time

# Initialize AWS clients
bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')

# Constants
TABLE_NAME = 'carbon-assistant-data'
QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/717279723101/carbon-bedrock-queue'

def process_bedrock_request(prompt):
    """Process Bedrock request with retries"""
    max_retries = 3
    initial_delay = 2
    
    for attempt in range(max_retries):
        try:
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 500,
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}]
                    }
                ]
            }
            
            response = bedrock.invoke_model(
                modelId='anthropic.claude-3-5-sonnet-20240620-v1:0',
                contentType='application/json',
                accept='application/json',
                body=json.dumps(request_body)
            )
            
            response_body = json.loads(response['body'].read().decode())
            return response_body['content'][0]['text']
            
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(initial_delay * (2 ** attempt))
                continue
            raise

def store_conversation(conversation_id, prompt, response):
    """Store processed conversation in DynamoDB"""
    try:
        table = dynamodb.Table(TABLE_NAME)
        timestamp = str(int(datetime.now().timestamp() * 1000))
        
        item = {
            'conversationId': conversation_id,
            'timestamp': timestamp,
            'userInput': prompt,
            'response': response,
            'type': 'queued_conversation'
        }
        
        table.put_item(Item=item)
    except Exception as e:
        print(f"DynamoDB error: {str(e)}")

def lambda_handler(event, context):
    """Process messages from SQS queue"""
    try:
        # Get messages from queue
        response = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            MaxNumberOfMessages=1,
            MessageAttributeNames=['All'],
            VisibilityTimeout=300,
            WaitTimeSeconds=0
        )
        
        if 'Messages' not in response:
            return {'statusCode': 200, 'body': 'No messages to process'}
            
        for message in response['Messages']:
            try:
                # Parse message
                message_body = json.loads(message['Body'])
                prompt = message_body['prompt']
                conversation_id = message_body['conversation_id']
                
                # Process request
                bedrock_response = process_bedrock_request(prompt)
                
                # Store result
                store_conversation(conversation_id, prompt, bedrock_response)
                
                # Delete processed message
                sqs.delete_message(
                    QueueUrl=QUEUE_URL,
                    ReceiptHandle=message['ReceiptHandle']
                )
                
            except Exception as e:
                print(f"Error processing message: {str(e)}")
                continue
                
        return {
            'statusCode': 200,
            'body': 'Successfully processed queue messages'
        }
        
    except Exception as e:
        print(f"Queue processor error: {str(e)}")
        return {
            'statusCode': 500,
            'body': f"Error processing queue: {str(e)}"
        }