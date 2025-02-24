import json
import boto3
import requests
from datetime import datetime, timedelta
import os
import uuid

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client('bedrock-runtime')

# Constants
TABLE_NAME = 'carbon-assistant-data'
CARBON_API_BASE_URL = 'https://api.carbonintensity.org.uk'

class CarbonCalculationAgent:
    def __init__(self):
        self.table = dynamodb.Table(TABLE_NAME)
        
    def get_carbon_intensity(self, date_str=None, region='London'):
    """Get carbon intensity data for London"""
    try:
        # Use the basic intensity endpoint first
        endpoint = "/intensity"
        if date_str:
            endpoint = f"/intensity/date/{date_str}"
            
        response = requests.get(f"{CARBON_API_BASE_URL}{endpoint}")
        response.raise_for_status()
        data = response.json()
            
            # Calculate average intensity for the period
            intensities = [period['intensity']['forecast'] for period in data.get('data', [])]
            avg_intensity = sum(intensities) / len(intensities) if intensities else None
            
            return {
            'current_intensity': data['data'][0]['intensity']['actual'],
            'forecast_intensity': data['data'][0]['intensity']['forecast'],
            'region': region,
            'timestamp': datetime.now().isoformat()
        }
        except requests.exceptions.RequestException as e:
        print(f"Carbon API error: {str(e)}")
        # Return default values if API fails
        return {
            'current_intensity': 200,  # UK average intensity as fallback
            'forecast_intensity': 200,
            'region': region,
            'timestamp': datetime.now().isoformat(),
            'is_fallback': True
        }

    def calculate_energy_emissions(self, kwh_usage: float, region: str = 'London', period: str = None) -> dict:
        """Calculate emissions from energy usage with regional intensity"""
        try:
            # Get carbon intensity data
            intensity_data = self.get_carbon_intensity(date_str=period, region=region)
            
            # Calculate emissions using current intensity
            current_intensity = intensity_data['current_intensity']
            emissions = (kwh_usage * current_intensity) / 1000  # Convert to metric tons CO2
            
            # Calculate potential savings using renewable energy
            renewable_emissions = kwh_usage * 0.015  # Average emissions for renewable energy (kg CO2/kWh)
            potential_savings = emissions - (renewable_emissions / 1000)
            
            return {
                'emissions_tons': round(emissions, 3),
                'intensity_factor': current_intensity,
                'region': region,
                'period': period or 'current',
                'potential_savings_tons': round(potential_savings, 3),
                'recommendations': self._generate_energy_recommendations(kwh_usage, emissions),
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            print(f"Energy calculation error: {str(e)}")
            raise

    def _generate_energy_recommendations(self, kwh_usage: float, emissions: float) -> list:
        """Generate tailored energy saving recommendations"""
        recommendations = []
        
        # Basic consumption analysis
        if kwh_usage > 1000:
            recommendations.append({
                'type': 'high_consumption',
                'message': 'Your energy consumption is relatively high. Consider an energy audit.',
                'potential_impact': 'Could reduce consumption by 20-30%'
            })
            
        # Time-based recommendations
        current_hour = datetime.now().hour
        if 9 <= current_hour <= 17:
            recommendations.append({
                'type': 'peak_hours',
                'message': 'You are calculating during peak hours. Consider shifting non-essential consumption to off-peak hours.',
                'potential_impact': 'Could reduce costs and emissions by 10-15%'
            })
            
        # Standard recommendations
        recommendations.extend([
            {
                'type': 'renewable_energy',
                'message': 'Switching to renewable energy could significantly reduce your emissions.',
                'potential_impact': f'Could save up to {round(emissions * 0.9, 2)} metric tons CO2'
            },
            {
                'type': 'energy_efficiency',
                'message': 'Implement energy efficiency measures like LED lighting and smart controls.',
                'potential_impact': 'Could reduce consumption by 10-20%'
            }
        ])
        
        return recommendations

    def store_calculation(self, calculation_id: str, params: dict, results: dict):
        """Store calculation results in DynamoDB"""
        try:
            self.table.put_item(
                Item={
                    'conversationId': calculation_id,
                    'timestamp': str(int(datetime.now().timestamp() * 1000)),
                    'type': 'calculation',
                    'parameters': params,
                    'results': results
                }
            )
        except Exception as e:
            print(f"DynamoDB error: {str(e)}")
            raise

    def process_calculation(self, event: dict) -> dict:
        """Main handler for calculation requests"""
        try:
            query = event.get('query', '')
            calculation_id = str(uuid.uuid4())
            
            # Extract calculation parameters using Bedrock
            params = self._extract_parameters(query)
            
            # Perform calculation
            if params['type'] == 'energy':
                results = self.calculate_energy_emissions(
                    kwh_usage=params['value'],
                    region=params.get('region', 'London'),
                    period=params.get('period')
                )
            else:
                raise ValueError(f"Unsupported calculation type: {params['type']}")
            
            # Store results
            self.store_calculation(calculation_id, params, results)
            
            return {
                'statusCode': 200,
                'body': {
                    'calculationId': calculation_id,
                    'parameters': params,
                    'results': results
                }
            }
            
        except Exception as e:
            return {
                'statusCode': 500,
                'body': {
                    'error': str(e)
                }
            }

    def _extract_parameters(self, query: str) -> dict:
        """Extract calculation parameters from query using Bedrock"""
        try:
            prompt = f"""
            Extract calculation parameters from this query about carbon emissions:
            {query}
            
            Return a JSON object with:
            - type: calculation type (energy, transport, etc.)
            - value: numerical value
            - unit: unit of measurement
            - region: location if specified
            - period: time period if specified
            
            Return only the JSON object, no other text.
            """
            
            # Invoke Bedrock for parameter extraction
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
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
            parameters = json.loads(response_body['content'][0]['text'])
            
            return parameters
            
        except Exception as e:
            print(f"Parameter extraction error: {str(e)}")
            raise

def lambda_handler(event, context):
    handler = CarbonCalculationAgent()
    return handler.process_calculation(event)