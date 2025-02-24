import json
import boto3
import base64
from datetime import datetime
import uuid

# Initialize AWS clients
textract = boto3.client('textract')
bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

# Constants
TABLE_NAME = 'carbon-assistant-data'
BUCKET_NAME = 'carbon-assistant-documents-ncai-98320'

class OCRAgent:
    def __init__(self):
        self.table = dynamodb.Table(TABLE_NAME)

    def process_document(self, document_content):
        """Process document using Amazon Textract"""
        try:
            response = textract.detect_document_text(
                Document={
                    'Bytes': base64.b64decode(document_content)
                }
            )
            
            # Extract text blocks
            text_blocks = []
            for block in response['Blocks']:
                if block['BlockType'] == 'LINE':
                    text_blocks.append(block['Text'])
            
            return '\n'.join(text_blocks)
            
        except Exception as e:
            print(f"Textract processing error: {str(e)}")
            raise

    def extract_bill_data(self, text_content: str) -> dict:
        """Extract relevant information from bill text using Bedrock"""
        try:
            prompt = f"""
            Extract the following information from this gas bill text:
            - Billing period (start and end dates)
            - Total gas consumption in kWh
            - Meter number
            - Previous meter reading
            - Current meter reading
            
            Bill text:
            {text_content}
            
            Return only a JSON object with these fields, no other text.
            """
            
            body = json.dumps({
                "prompt": prompt,
                "max_tokens": 500,
                "temperature": 0.0,
                "stop_sequences": ["\n\nHuman:"]
            })
            
            response = bedrock.invoke_model(
                modelId='anthropic.claude-v2',
                body=body
            )
            
            response_body = json.loads(response.get('body').read())
            extracted_data = json.loads(response_body.get('completion', '{}'))
            
            return extracted_data
            
        except Exception as e:
            print(f"Data extraction error: {str(e)}")
            raise

    def store_bill_data(self, bill_id: str, extracted_data: dict, raw_text: str):
        """Store extracted bill data in DynamoDB"""
        try:
            self.table.put_item(
                Item={
                    'conversationId': bill_id,
                    'timestamp': int(datetime.now().timestamp() * 1000),
                    'type': 'gas_bill',
                    'extractedData': extracted_data,
                    'rawText': raw_text
                }
            )
        except Exception as e:
            print(f"DynamoDB error: {str(e)}")
            raise

    def store_document_s3(self, document_content: str, bill_id: str):
        """Store original document in S3"""
        try:
            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=f"bills/{bill_id}.pdf",
                Body=base64.b64decode(document_content)
            )
        except Exception as e:
            print(f"S3 storage error: {str(e)}")
            raise

    def process_bill(self, event: dict) -> dict:
        """Main handler for gas bill processing"""
        try:
            document_content = event.get('document', '')
            bill_id = str(uuid.uuid4())
            
            # Store original document
            self.store_document_s3(document_content, bill_id)
            
            # Process document with Textract
            extracted_text = self.process_document(document_content)
            
            # Extract structured data
            bill_data = self.extract_bill_data(extracted_text)
            
            # Store extracted data
            self.store_bill_data(bill_id, bill_data, extracted_text)
            
            return {
                'statusCode': 200,
                'body': {
                    'billId': bill_id,
                    'extractedData': bill_data
                }
            }
            
        except Exception as e:
            return {
                'statusCode': 500,
                'body': {
                    'error': str(e)
                }
            }

def lambda_handler(event, context):
    handler = OCRAgent()
    return handler.process_bill(event)