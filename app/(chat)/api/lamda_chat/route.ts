import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({ region: process.env.AWS_REGION });

export async function POST(request: NextRequest) {
  const { id, messages, modelId } = await request.json();

  try {
    const params = {
      FunctionName: process.env.LAMBDA_FUNCTION_NAME,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({
        body: JSON.stringify({
          input: messages[messages.length - 1].content,
          conversationId: id
        })
      })
    };

    const command = new InvokeCommand(params);
    const { Payload } = await lambda.send(command);

    if (Payload) {
      const result = JSON.parse(new TextDecoder().decode(Payload));
      const body = JSON.parse(result.body);

      if (result.statusCode === 200) {
        return NextResponse.json(body);
      } else {
        return NextResponse.json({ error: body.error }, { status: result.statusCode });
      }
    }
  } catch (error) {
    console.error('Error calling Lambda:', error);
    return NextResponse.json({ error: 'An error occurred while processing your request' }, { status: 500 });
  }
}