const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const User = require('../models/User');

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Create admin user
    const adminUser = new User({
      name: 'Admin User',
      email: 'admin@unicall.com',
      password: 'admin123',
      role: 'admin',
    });
    await adminUser.save();

    console.log('\n=== Seed Data Summary ===');
    console.log('Admin User:');
    console.log('  Email: admin@unicall.com');
    console.log('  Password: admin123');
    console.log('\nData created successfully!');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

seedData();

