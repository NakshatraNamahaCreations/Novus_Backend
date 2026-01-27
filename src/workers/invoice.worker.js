import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { generateAndUploadInvoice } from '../services/generateInvoice.service.js'; 
import { queueRedis } from '../config/redisQueue.js'; 

const prisma = new PrismaClient();

new Worker(
  'invoice', 
  async (job) => {
    const { paymentId } = job.data;
    console.log('📄 Processing invoice for paymentId:', paymentId);

    try {
     
      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        select: {
          patient: {
            select: {
              fullName: true,
            },
          },
          amount: true,
          currency: true,
          orderId:true,
          id:true
      
        },
      });

      if (!payment) {
        throw new Error(`Payment not found for paymentId: ${paymentId}`);
      }
   

      // Generate invoice PDF and upload to S3
      const invoiceUrl = await generateAndUploadInvoice({
        paymentId:payment.id,
        amount: payment.amount,
        currency: payment.currency,
        patientName: payment.patient.fullName,
        orderId:payment.orderId
      });

      // Update the payment record with the invoice URL
      await prisma.payment.update({
        where: { paymentId },
        data: { invoiceUrl },
      });

      console.log('Invoice uploaded successfully to:', invoiceUrl);
    } catch (error) {
      console.error('Error processing invoice job:', error);
      // Optionally, you can handle retries or set a delay before retrying the job
      throw error; // Bull will retry the job based on your retry configuration
    }
  },
  {
    connection: queueRedis,
    concurrency: 5, 
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, 
    },
  }
);



console.log('🚀 Invoice worker started');
