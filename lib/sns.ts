import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const snsClient = new SNSClient({
  region: process.env.REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.ACCESS_KEY!,
    secretAccessKey: process.env.SECRET_KEY!,
  },
});

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const command = new PublishCommand({
    PhoneNumber: phone, // E.164 format: +919876543210
    Message: `Your AI Resume Coach verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
    MessageAttributes: {
      "AWS.SNS.SMS.SMSType": {
        DataType: "String",
        StringValue: "Transactional", // Higher delivery priority
      },
      ...(process.env.AWS_SNS_SENDER_ID && {
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: process.env.AWS_SNS_SENDER_ID,
        },
      }),
    },
  });

  await snsClient.send(command);
}
