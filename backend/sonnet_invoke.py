import boto3
import json
from dotenv import load_dotenv
import os
import base64

load_dotenv(override=True)

def setup_aws_client(service_name='bedrock-runtime'):
    aws_access_key_id = os.getenv('ACCESS_KEY')
    aws_secret_access_key = os.getenv('SECRET_KEY')
    aws_region = os.getenv('AWS_REGION_NAME', 'us-east-1')

    if not all([aws_access_key_id, aws_secret_access_key]):
        raise ValueError("Missing AWS credentials in environment variables")

    return boto3.client(
        service_name=service_name,
        region_name=aws_region,
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key
    )

def invoke_text_model(prompt, bedrock):
    try:
        response = bedrock.invoke_model(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}]
            }))
    except bedrock.exceptions.ValidationException as e:
        return e
    response_body = json.loads(response['body'].read())
    summary = response_body['content'][0]['text']
    return summary

def invoke_image_model(image_path, prompt, bedrock):
    try:
        with open(image_path, "rb") as image_file:
            image_data = base64.b64encode(image_file.read()).decode("utf-8")

        message_content = [
            {"type": "text", "text": prompt},
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",  
                    "data": image_data
                }
            }
        ]

        response = bedrock.invoke_model(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": message_content}]
            }))
        
        response_body = json.loads(response['body'].read())
        summary = response_body['content'][0]['text']
        return summary

    except bedrock.exceptions.ValidationException as e:
        return f"Validation Error: {str(e)}"
    except FileNotFoundError:
        return "Error: Image file not found."
    except Exception as e:
        return f"Error during image model invocation: {str(e)}"
