const express = require('express');
const cors = require('cors');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// middleWere
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7lusiir.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const parcelsCollection = client.db("parcelDeliveryDB").collection("parcels");
    const paymentsCollection = client.db('parcelDeliveryDB').collection('payments');

    app.post('/parcels', async (req, res) => {
      const parcelData = req.body;
      const result = await parcelsCollection.insertOne(parcelData);
      res.send(result);
    });

    app.get('/parcels', async (req, res) => {
      const result = await parcelsCollection.find().toArray();
      res.send(result);
    });

    app.get('/parcels', async (req, res) => {
      const email = req.query.email;

      const query = email ? { created_by: email } : {};

      const options = {
        sort: { creation_date: -1 }
      };
      const result = await parcelsCollection.find(query, options).toArray();
      res.send(result);
    });

    app.delete('/parcels/:id', async (req, res) => {
      const id = req.params.id;

      try {
        const query = { _id: new ObjectId(id) };
        const result = await parcelsCollection.deleteOne(query);
        res.send(result); // result = { acknowledged: true, deletedCount: 1 }
      } catch (error) {
        console.error("Delete error:", error);
        res.status(500).send({ error: "Failed to delete parcel" });
      }
    });

    app.get('/parcels/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const parcel = await parcelsCollection.findOne(query);
      res.send(parcel);
    });


    app.get('/payments', async (req, res) => {
      try {
        const email = req.query.email;
        const query = email ? { email } : {};

        const result = await paymentsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch payments' });
      }
    });

    //  save payment history and updated parcel 
    app.post('/payments', async (req, res) => {
      try {
        const payment = req.body;

        // validation check
        if (!payment?.parcelId || !payment?.email || !payment?.amount) {
          return res.status(400).send({ error: 'Invalid payment data' });
        }

        // save to payment history
        const paymentDoc = {
          email: payment.email,
          name: payment.name || '',
          parcelId: payment.parcelId,
          amount: payment.amount,
          transactionId: payment.transactionId || '',
          currency: payment.currency || 'usd',
          method: payment.method || 'card',
          createdAt: {
            raw: new Date(),
            iso: new Date().toISOString(),
          },
        };
        const paymentResult = await paymentsCollection.insertOne(paymentDoc);

        // updated parcel and set payment_status: 'paid'
        const parcelUpdateResult = await parcelsCollection.updateOne(
          { _id: new ObjectId(payment.parcelId) },
          {
            $set: {
              payment_status: 'paid',
              transactionId: payment.transactionId,
            },
          }
        );

        res.send({
          success: true,
          message: '✅ Payment saved & parcel updated successfully',
          paymentResult,
          parcelUpdateResult,
        });
      } catch (err) {
        console.error('❌ Payment save failed:', err.message);
        res.status(500).send({ error: 'Something went wrong' });
      }
    });


    app.post("/create-payment-intent", async (req, res) => {
      const amount = req.body.amount;
      // console.log('receive from client side ', amount)
      // console.log('send the stripe Payment', amount * 100)
      if (!amount || amount < 1) {
        return res.status(400).send({ error: "Invalid amount" });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100, // Stripe requires amount in cents
          currency: "usd", // or "bdt" if you're using a supported local currency
          payment_method_types: ["card"],
        });
        console.log(amount)

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error("Error creating payment intent:", err);
        res.status(500).send({ error: "Failed to create payment intent" });
      }
    });



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Server is running...');
});

app.listen(port, () => {
  console.log(`Parcel server is running ${port}`);
});