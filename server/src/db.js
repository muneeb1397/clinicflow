import mongoose from 'mongoose';

export async function connectDB(customUri) {
  const uri = customUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/clinic_agent';
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log("Mongo connected");
    return mongoose.connection;
  } catch (err) {
    console.warn(`Could not connect to MongoDB at ${uri}:`, err.message);
    console.log("Starting in-memory MongoDB fallback for testing/demo...");
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const memUri = mongod.getUri();
      await mongoose.connect(memUri);
      console.log("Mongo connected");
      return mongoose.connection;
    } catch (memErr) {
      console.error("Failed to start in-memory MongoDB:", memErr);
      throw memErr;
    }
  }
}
