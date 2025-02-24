import json
import boto3
from dotenv import load_dotenv
import os
import base64

load_dotenv(override=True)

class AWSClient:
    @staticmethod
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

class ImageAnalyzer:
    @staticmethod
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

class BillProcessor:
    @staticmethod
    def process_bill_image(image_path: str) -> None:
        bedrock = AWSClient.setup_aws_client()

        prompt = """
        Analyze this energy bill image and extract carbon-related information. 
        Provide the output in the following JSON format:
        OUTPUT JSON FORMAT NOTHING ELSE - output should not have any other text

        {
          "billing_period": {
            "start": "YYYY-MM-DD",
            "end": "YYYY-MM-DD",
            "duration_days": 0
          },
          "account_details": {
            "account_number": "",
            "vat_registration": ""
          },
          "energy_usage": {
            "electricity": {
              "cost": 0,
              "currency": ""
            },
            "gas": {
              "cost": 0,
              "currency": ""
            },
            "total_cost": 0,
            "currency": ""
          },
          "estimated_annual_energy_spend": 0,
          "estimated_emissions": {
            "scope_1": {
              "source": "Natural Gas",
              "estimated_usage_kwh": 0,
              "emission_factor": 0,
              "emissions_kg_co2e": 0
            },
            "scope_2": {
              "source": "Electricity",
              "estimated_usage_kwh": 0,
              "emission_factor": 0,
              "emissions_kg_co2e": 0
            },
            "total_emissions_kg_co2e": 0
          },
          "estimated_annual_footprint": {
            "total_emissions_kg_co2e": 0,
            "per_day_kg_co2e": 0
          }
        }

        Instructions:
        1. If any information is not available in the image, use null or 0 as appropriate.
        2. Ensure all numerical values are provided as numbers, not strings.
        3. Calculate estimations using your knowledge and the given data. Estimations are required, so make reasonable assumptions based on the available information and typical energy consumption patterns.
        4. For emission factors, use standard values if not provided: 0.23314 kg CO2e/kWh for electricity and 0.18316 kg CO2e/kWh for natural gas.
        5. If usage data is not explicitly stated, estimate based on costs and average energy prices.
        6. Estimate annual values by extrapolating from the billing period data.
        7. Ensure all calculations and estimations are consistent and logical.
        """

        result = ImageAnalyzer.invoke_image_model(image_path, prompt, bedrock)
        
        try:
            parsed_result = json.loads(result)
            print(json.dumps(parsed_result, indent=2))
        except json.JSONDecodeError:
            print("Error: Unable to parse the result as JSON. Raw output:")

if __name__ == "__main__":
    image_path = "/Users/aryanrajpurohit/nocarbon/page1.jpg" 
    BillProcessor.process_bill_image(image_path)