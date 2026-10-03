import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export async function connectDB(customUri) {
  const uri = customUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/clinicflow';
  try {
    await mongoose.connect(uri, {
      dbName: 'clinicflow',
      serverSelectionTimeoutMS: 5000,
    });
    console.log("Mongo connected");
    return mongoose.connection;
  } catch (err) {
    const sanitizedErrorMsg = err.message ? err.message.replace(/mongodb\+srv:\/\/[^@]+@/, 'mongodb+srv://<credentials>@') : 'Connection error';
    console.warn(`Could not connect to MongoDB Atlas: ${sanitizedErrorMsg}`);
    console.log("Starting in-memory MongoDB fallback for testing/demo...");
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const memUri = mongod.getUri();
      await mongoose.connect(memUri, { dbName: 'clinicflow' });
      console.log("Mongo connected");
      return mongoose.connection;
    } catch (memErr) {
      console.error("Failed to start in-memory MongoDB:", memErr.message);
      throw memErr;
    }
  }
}
