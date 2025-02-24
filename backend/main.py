from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import io
import json
from typing import Dict, Any
from helper import AWSClient, ImageAnalyzer, BillProcessor

app = FastAPI()

last_processed_bill_data = None

class ChatRequest(BaseModel):
    message: str

@app.post("/process-bill")
async def process_bill(file: UploadFile = File(...)):
    global last_processed_bill_data
    try:
        contents = await file.read()
        temp_file_path = "/tmp/temp_bill_image.jpg"
        with open(temp_file_path, "wb") as temp_file:
            temp_file.write(contents)

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
              "currency": "",
              "usage_kwh": 0
            },
            "gas": {
              "cost": 0,
              "currency": "",
              "usage_kwh": 0
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

        result = ImageAnalyzer.invoke_image_model(temp_file_path, prompt, bedrock)
        
        try:
            parsed_result = json.loads(result)
            last_processed_bill_data = parsed_result
            return JSONResponse(content=parsed_result)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Error: Unable to parse the result as JSON.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(request: ChatRequest):
    global last_processed_bill_data
    if not last_processed_bill_data:
        raise HTTPException(status_code=400, detail="No bill data available. Please process a bill first.")

    bedrock = AWSClient.setup_aws_client()

    system_prompt = """
    You are an AI assistant specializing in analyzing energy bills and carbon emissions data. 
    Your responses should be based solely on the provided bill data and related carbon emission information. 
    Do not provide any personal opinions or information outside the scope of the bill data.
    Refuse to answer questions unrelated to energy consumption, bills, or carbon emissions.
    """

    user_prompt = f"""
    Based on the following energy bill data:
    {json.dumps(last_processed_bill_data, indent=2)}

    Please answer the following question or respond to the following request:
    {request.message}

    Remember to only provide information directly related to the bill data and carbon emissions. 
    If the question is unrelated, politely refuse to answer and redirect the conversation to the bill data.
    """

    try:
        response = bedrock.invoke_model(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2000,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ]
            }))
        
        response_body = json.loads(response['body'].read())
        answer = response_body['content'][0]['text']
        return JSONResponse(content={"response": answer})

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during chat: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)