import json
import boto3
from datetime import datetime
import uuid
import time

# Initialize AWS clients
bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
sqs = boto3.client('sqs')

# Constants
TABLE_NAME = 'carbon-assistant-data'
QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/717279723101/carbon-bedrock-queue'

def store_conversation(conversation_id, user_input, response):
    """Store conversation in DynamoDB"""
    try:
        table = dynamodb.Table(TABLE_NAME)
        timestamp = str(int(datetime.now().timestamp() * 1000))
        
        item = {
            'conversationId': conversation_id,
            'timestamp': timestamp,
            'userInput': user_input,
            'response': response,
            'type': 'conversation'
        }
        
        table.put_item(Item=item)
        return True
    except Exception as e:
        print(f"DynamoDB error: {str(e)}")
        return False

def invoke_bedrock_with_retry(prompt, max_retries=5, base_delay=0.5):
    """Invoke Bedrock with retry logic"""
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
            return {
                'success': True,
                'response': response_body['content'][0]['text']
            }
            
        except Exception as e:
            print(f"Attempt {attempt + 1} failed: {str(e)}")
            if attempt < max_retries - 1:
                wait_time = base_delay * (2 ** attempt)
                time.sleep(wait_time)
                continue
            return {
                'success': False,
                'error': str(e)
            }

def invoke_calculation_agent(query):
    """Invoke the calculation Lambda function"""
    try:
        response = lambda_client.invoke(
            FunctionName='carbon-calculation-agent',
            InvocationType='RequestResponse',
            Payload=json.dumps({'query': query})
        )
        return json.loads(response['Payload'].read())
    except Exception as e:
        print(f"Calculation agent error: {str(e)}")
        raise

def lambda_handler(event, context):
    """Main Lambda handler function"""
    try:
        # Extract input from event
        body = json.loads(event.get('body', '{}'))
        user_input = body.get('input', '')
        conversation_id = body.get('conversationId', str(uuid.uuid4()))
        
        if not user_input:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Input is required'})
            }
        
        # Process query
        try:
            if "carbon" in user_input.lower() or "emission" in user_input.lower():
                calc_results = invoke_calculation_agent(user_input)
                prompt = f"Explain these carbon emission calculation results briefly and clearly: {calc_results}"
            else:
                prompt = user_input
                
            result = invoke_bedrock_with_retry(prompt)
            
            if result['success']:
                store_conversation(conversation_id, user_input, result['response'])
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'response': result['response'],
                        'conversationId': conversation_id
                    })
                }
            else:
                return {
                    'statusCode': 500,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps({
                        'error': f"Failed to process request: {result['error']}"
                    })
                }
                
        except Exception as e:
            return {
                'statusCode': 500,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({
                    'error': f"Error processing request: {str(e)}"
                })
            }
            
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'error': f"Error parsing request: {str(e)}"
            })
        }